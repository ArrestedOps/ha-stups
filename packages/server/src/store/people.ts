import { randomBytes, randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import { cleanPermissions, PERMISSIONS, type Permission } from '../permissions.js';
import { lastBusyDay, localDateKey, validDateKey } from '../busy.js';
import { DEFAULT_QUIET, type QuietWindow } from '../quiet.js';
import { type User, type AccessMode, type Settings, type AddonImportResult, type AddonOptionsDefaults, type AddonOptionsImport, DEFAULT_DUE_TIME, type Row } from './types.js';
import { PERSON_COLORS, NTFY_TOPIC_RE } from './constants.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import { t } from '../i18n/index.js';
import { checkDashboardPath } from '../dashboard-path.js';

/** Personen, Zugriff und Einstellungen */
export function createPeople(c: Ctx, late: unknown) {
  // Erst hier auf den vollen Typ gebracht: stünde Internals schon im Kopf, hinge sein Typ von sich selbst ab
  const s = late as Internals;
  const { iso, one, all, run, tx, now, timeZone } = c;
  // Funktionen aus anderen Themen: erst beim Aufruf nachgeschlagen (alle Teile sind bei der Verwendung zusammengesetzt)
  const { closeNudgesOfUser } = lazy(s, ['closeNudgesOfUser'] as const);

  const toUser = (r: Row): User => ({
    id: r.id,
    haUserId: r.ha_user_id,
    name: r.name,
    displayName: r.display_name,
    isPerson: r.is_person === 1,
    color: r.color,
    notifyServices: JSON.parse(r.notify_services ?? '[]') as string[],
    ntfy: typeof r.ntfy_topic === 'string' && r.ntfy_topic !== '',
    nudgeQuiet: quietOf(r),
    languageChoice: r.language_choice === 'de' || r.language_choice === 'en' ? r.language_choice : 'auto',
    language: r.language === 'de' || r.language === 'en' ? r.language : null,
    accentHue: typeof r.accent_hue === 'number' ? r.accent_hue : null,
    dashboardPath: typeof r.dashboard_path === 'string' && r.dashboard_path !== '' ? r.dashboard_path : null,
    weeklySummary: r.weekly_summary === 1,
    isChild: r.is_child === 1,
    childScope: r.child_scope === 'assigned' ? 'assigned' : 'all',
    confirmDefault: r.confirm_default === 1,
    avatarRev: r.avatar_source ? (r.avatar_rev as number) : null,
    avatarSource: r.avatar_source === 'ha' || r.avatar_source === 'upload' ? r.avatar_source : null,
    busyUntil: typeof r.busy_until === 'string' && r.busy_until !== '' ? r.busy_until : null,
    confirmers: all(
      'select c.user_id from child_confirmers c join users u on u.id = c.user_id and u.is_person = 1 where c.child_id = ? order by c.rowid',
      r.id,
    ).map((x) => x.user_id as string),
  });

  /** Ruhezeit aus den Spalten der Person, mit der Vorgabe für alles, was nicht gesetzt ist */
  function quietOf(r: Row): QuietWindow {
    return {
      start: r.nudge_quiet_start ?? DEFAULT_QUIET.start,
      end: r.nudge_quiet_end ?? DEFAULT_QUIET.end,
      off: r.nudge_quiet_off === 1,
    };
  }

  function nextPersonColor(): string {
    const used = all('select color from users where is_person = 1').map((r) => r.color);
    return PERSON_COLORS.find((c) => !used.includes(c)) ?? PERSON_COLORS[0]!;
  }

  /** Dienstnamen bereinigen: ohne „notify.", ohne Leere und Doppelte. strict: Unsinn ablehnen statt überspringen. */
  function cleanServices(raw: unknown, strict: boolean): string[] {
    if (!Array.isArray(raw)) {
      if (strict) throw new ValidationError(t('Die Dienste müssen eine Liste sein'));
      return [];
    }
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'string') {
        if (strict) throw new ValidationError(t('Ein Dienstname ist kein Text'));
        continue;
      }
      const name = item.trim().replace(/^notify\./, '');
      if (name === '') continue;
      if (!/^[A-Za-z0-9_]+$/.test(name)) {
        if (strict) throw new ValidationError(t('„{name}" ist kein gültiger Dienstname', { name }));
        continue;
      }
      if (!out.includes(name)) out.push(name);
    }
    return out;
  }

  /** Aus den Add-on-Optionen (nur noch für die einmalige Übernahme) */
  function syncPeople(people: { name: string; notify?: string[] }[]): void {
    tx(() => {
      for (const p of people) {
        const wanted = p.name.trim().toLowerCase();
        if (!wanted) continue;
        let existing = all('select * from users').find(
          (u) => u.name.toLowerCase() === wanted || u.display_name.toLowerCase() === wanted,
        );
        if (!existing) {
          const id = randomUUID();
          run(
            'insert into users (id, ha_user_id, name, display_name, is_person, color, created_at) values (?, null, ?, ?, 1, ?, ?)',
            id,
            p.name.trim(),
            p.name.trim(),
            nextPersonColor(),
            iso(),
          );
          existing = one('select * from users where id = ?', id)!;
        } else if (existing.is_person !== 1) {
          run('update users set is_person = 1 where id = ?', existing.id);
        }
        if (p.notify !== undefined) {
          run('update users set notify_services = ? where id = ?', JSON.stringify(cleanServices(p.notify, false)), existing.id);
        }
      }
    });
  }

  function resolveUser(who: { haId: string; name: string; displayName: string }): User {
    return tx(() => {
      const byId = one('select * from users where ha_user_id = ?', who.haId);
      if (byId) return toUser(byId);

      // Nur der Benutzername verknüpft von selbst (ihn ändern nur Administratoren). Den Anzeigenamen ändert jeder
      // Home-Assistant-Nutzer im Profil: passt nur er, bleibt das Konto „Wartet auf Freigabe", bis ein Administrator zustimmt.
      const username = who.name.trim().toLowerCase();
      const placeholder = username
        ? all('select * from users where ha_user_id is null').find((u) => u.name.toLowerCase() === username)
        : undefined;
      if (placeholder) {
        run('update users set ha_user_id = ? where id = ?', who.haId, placeholder.id);
        return toUser(one('select * from users where id = ?', placeholder.id)!);
      }
      const id = randomUUID();
      run(
        'insert into users (id, ha_user_id, name, display_name, is_person, color, created_at) values (?, ?, ?, ?, 0, null, ?)',
        id,
        who.haId,
        who.name || who.displayName,
        who.displayName || who.name,
        iso(),
      );
      return toUser(one('select * from users where id = ?', id)!);
    });
  }

  const people = (): User[] => all('select * from users where is_person = 1 order by created_at, rowid').map(toUser);

  /** Benutzer, die die App geöffnet haben, aber (noch) keine Person sind: „Wartet auf Freigabe" */
  const pendingUsers = (): User[] =>
    all('select * from users where is_person = 0 and ha_user_id is not null order by created_at, rowid').map(toUser);

  const userRow = (id: string): Row => {
    const r = one('select * from users where id = ?', id);
    if (!r) throw new NotFoundError(t('Person nicht gefunden'));
    return r;
  };

  function cleanPersonName(raw: unknown): string {
    if (typeof raw !== 'string' || raw.trim() === '') throw new ValidationError(t('Der Name fehlt'));
    const name = raw.trim();
    if (name.length > 60) throw new ValidationError(t('Der Name ist zu lang (höchstens 60 Zeichen)'));
    return name;
  }

  /** Macht jemanden zur Person (zuweisbar, bekommt Push). Gibt es ihn schon, wird er nur markiert. */
  function addPerson(input: { haUserId?: string | null; name: string }): User {
    const name = cleanPersonName(input.name);
    return tx(() => {
      const haId = input.haUserId || null;
      let row = haId ? one('select * from users where ha_user_id = ?', haId) : undefined;
      if (!row) {
        // Eine Person, die noch nie angemeldet war, wird beim ersten Öffnen über den Namen verknüpft
        row = all('select * from users where ha_user_id is null').find(
          (u) => u.name.toLowerCase() === name.toLowerCase() || u.display_name.toLowerCase() === name.toLowerCase(),
        );
        if (row && haId) run('update users set ha_user_id = ? where id = ?', haId, row.id);
      }
      if (!row) {
        const id = randomUUID();
        run(
          'insert into users (id, ha_user_id, name, display_name, is_person, color, created_at) values (?, ?, ?, ?, 1, ?, ?)',
          id,
          haId,
          name,
          name,
          nextPersonColor(),
          iso(),
        );
        return toUser(one('select * from users where id = ?', id)!);
      }
      if (row.is_person !== 1) {
        run('update users set is_person = 1, color = ? where id = ?', row.color ?? nextPersonColor(), row.id);
      }
      return toUser(one('select * from users where id = ?', row.id)!);
    });
  }

  /** Nimmt jemanden aus der Liste. Aufgaben behalten die Zuweisung, sie tritt wieder in Kraft, wenn die Person zurückkommt. */
  function removePerson(id: string): void {
    userRow(id);
    run('update users set is_person = 0 where id = ?', id);
    run('delete from user_permissions where user_id = ?', id); // bei der Rückkehr fängt die Person ohne Rechte an
    closeNudgesOfUser(id);
  }

  function renamePerson(id: string, displayName: unknown): User {
    userRow(id);
    run('update users set display_name = ? where id = ?', cleanPersonName(displayName), id);
    return toUser(userRow(id));
  }

  function setNotifyServices(id: string, services: unknown): User {
    userRow(id);
    run('update users set notify_services = ? where id = ?', JSON.stringify(cleanServices(services, true)), id);
    return toUser(userRow(id));
  }

  const ntfyTopic = (id: string): string | null => {
    const topic = one('select ntfy_topic from users where id = ?', id)?.ntfy_topic as string | null | undefined;
    return topic ? topic : null;
  };

  /** Leer oder null entfernt das Thema */
  function setNtfyTopic(id: string, raw: unknown): User {
    userRow(id);
    let topic: string | null = null;
    if (raw !== null && raw !== undefined && !(typeof raw === 'string' && raw.trim() === '')) {
      if (typeof raw !== 'string' || !NTFY_TOPIC_RE.test(raw.trim())) {
        throw new ValidationError(t('Das Thema darf 1 bis 64 Zeichen haben: Buchstaben, Ziffern, Minus und Unterstrich'));
      }
      topic = raw.trim();
    }
    run('update users set ntfy_topic = ? where id = ?', topic, id);
    return toUser(userRow(id));
  }

  /** Die zuletzt gemeldete Sprache der Person (für Push); null, solange noch kein Gerät eine gemeldet hat */
  const languageOf = (id: string): 'de' | 'en' | null => {
    const l = one('select language from users where id = ?', id)?.language;
    return l === 'de' || l === 'en' ? l : null;
  };

  /** `choice`: die feste Wahl der Person ('auto' = folgt dem Gerät), `effective`: die Sprache, die das Gerät gerade zeigt */
  function setLanguage(id: string, v: { choice: 'auto' | 'de' | 'en'; effective: 'de' | 'en' }): void {
    userRow(id);
    run('update users set language = ?, language_choice = ? where id = ?', v.effective, v.choice === 'auto' ? null : v.choice, id);
  }

  /** Eigener Farbton der Oberfläche: eine ganze Zahl von 0 bis 359, null = das Orange der App */
  /** „Wenig Zeit" bis zu einem Tag (YYYY-MM-DD, einschließlich; heute bis 90 Tage); null nimmt es zurück */
  function setBusyUntil(id: string, value: unknown): User {
    userRow(id);
    if (value !== null) {
      const tz = timeZone();
      if (typeof value !== 'string' || !validDateKey(value)) throw new ValidationError(t('Das Datum muss die Form JJJJ-MM-TT haben'));
      if (value < localDateKey(now().getTime(), tz)) throw new ValidationError(t('Das Datum liegt in der Vergangenheit'));
      if (value > lastBusyDay(now().getTime(), tz)) throw new ValidationError(t('„Wenig Zeit" lässt sich höchstens 90 Tage im Voraus eintragen'));
    }
    run('update users set busy_until = ? where id = ?', value, id);
    return toUser(userRow(id));
  }

  /** Sonntags-Zusammenfassung als Push: je Person ein- oder ausgeschaltet (aus, bis jemand sie einschaltet) */
  function setWeeklySummary(id: string, on: unknown): User {
    if (typeof on !== 'boolean') throw new ValidationError(t('„Wöchentliche Zusammenfassung" muss wahr oder falsch sein'));
    userRow(id);
    run('update users set weekly_summary = ? where id = ?', on ? 1 : 0, id);
    return toUser(userRow(id));
  }

  /**
   * Rolle „Kind" einrichten (nur Administratoren, das prüft die Schnittstelle): ist die Person ein Kind, welche Boards sie sieht,
   * ob „Erledigt" standardmäßig eine Bestätigung braucht und wer bestätigen darf. Nur die angegebenen Felder ändern sich.
   */
  function setChild(id: string, patch: { isChild?: unknown; childScope?: unknown; confirmDefault?: unknown; confirmers?: unknown }): User {
    const row = userRow(id);
    if (row.is_person !== 1) throw new NotFoundError(t('Person nicht gefunden'));
    const bool = (v: unknown, what: string): boolean => {
      if (typeof v !== 'boolean') throw new ValidationError(t('{what} muss wahr oder falsch sein', { what }));
      return v;
    };
    // Erst alles prüfen, dann schreiben: ein Fehler ändert nichts
    const isChild = patch.isChild === undefined ? undefined : bool(patch.isChild, t('„Kind"'));
    const confirmDefault = patch.confirmDefault === undefined ? undefined : bool(patch.confirmDefault, t('„Bestätigung als Vorgabe"'));
    let scope: 'all' | 'assigned' | undefined;
    if (patch.childScope !== undefined) {
      if (patch.childScope !== 'all' && patch.childScope !== 'assigned') {
        throw new ValidationError(t('Die Sichtbarkeit muss „all" (alle Boards) oder „assigned" (nur Boards mit eigenen Aufgaben) sein'));
      }
      scope = patch.childScope;
    }
    let confirmers: string[] | undefined;
    if (patch.confirmers !== undefined) {
      if (!Array.isArray(patch.confirmers) || patch.confirmers.some((x) => typeof x !== 'string')) throw new ValidationError(t('Die Bestätiger müssen eine Liste von Personen sein'));
      confirmers = [...new Set(patch.confirmers as string[])];
      if (confirmers.includes(id)) throw new ValidationError(t('Das Kind kann sich nicht selbst bestätigen'));
      for (const other of confirmers) {
        if (one('select 1 as x from users where id = ? and is_person = 1', other) === undefined) throw new NotFoundError(t('Person nicht gefunden'));
      }
    }
    tx(() => {
      if (isChild !== undefined) run('update users set is_child = ? where id = ?', isChild ? 1 : 0, id);
      if (isChild === true) run('delete from user_permissions where user_id = ?', id); // ein Kind hat keine Berechtigungen
      if (scope !== undefined) run('update users set child_scope = ? where id = ?', scope, id);
      if (confirmDefault !== undefined) run('update users set confirm_default = ? where id = ?', confirmDefault ? 1 : 0, id);
      if (confirmers !== undefined) {
        run('delete from child_confirmers where child_id = ?', id);
        for (const other of confirmers) run('insert into child_confirmers (child_id, user_id) values (?, ?)', id, other);
      }
    });
    return toUser(userRow(id));
  }

  /** Berechtigungen einer Person (nur die gespeicherten, in der Reihenfolge von PERMISSIONS; ob sie gelten, entscheidet access.ts) */
  function permissionsOf(id: string): Permission[] {
    const have = new Set(all('select permission from user_permissions where user_id = ?', id).map((r) => r.permission));
    return PERMISSIONS.filter((p) => have.has(p));
  }

  /** Die Berechtigungen aller Personen, die welche haben (für die Liste der Administratoren) */
  function allPermissions(): Record<string, Permission[]> {
    const by = new Map<string, Set<unknown>>();
    for (const r of all('select user_id, permission from user_permissions')) {
      const set = by.get(r.user_id as string) ?? new Set();
      set.add(r.permission);
      by.set(r.user_id as string, set);
    }
    return Object.fromEntries([...by].map(([id, set]) => [id, PERMISSIONS.filter((p) => set.has(p))]).filter(([, list]) => (list as Permission[]).length > 0));
  }

  /**
   * Berechtigungen einer Person ersetzen (nur Administratoren, das prüft die Schnittstelle). Nur eingetragene Personen; ein Kind
   * bekommt keine (die Liste leeren geht immer). Erst alles prüfen, dann schreiben.
   */
  function setPermissions(id: string, raw: unknown): Permission[] {
    const list = cleanPermissions(raw);
    const row = userRow(id);
    if (row.is_person !== 1) throw new NotFoundError(t('Person nicht gefunden'));
    if (row.is_child === 1 && list.length > 0) throw new ConflictError(t('Ein Kind bekommt keine Berechtigungen'));
    tx(() => {
      run('delete from user_permissions where user_id = ?', id);
      for (const p of list) run('insert into user_permissions (user_id, permission) values (?, ?)', id, p);
    });
    return list;
  }

  function setAccentHue(id: string, hue: number | null): void {
    if (hue !== null && (!Number.isInteger(hue) || hue < 0 || hue > 359)) throw new ValidationError(t('Der Farbton muss eine Zahl von 0 bis 359 sein'));
    userRow(id);
    run('update users set accent_hue = ? where id = ?', hue, id);
  }

  /** Das Dashboard der Person (null = Standard); die Prüfung des Pfads macht der Aufrufer (dashboard-path.ts) */
  function setDashboardPath(id: string, path: string | null): void {
    userRow(id);
    run('update users set dashboard_path = ? where id = ?', path, id);
  }

  // ----- Onboarding -----

  /** Gespeicherter Stand der Einrichtung: der Schritt und, was die Person dort schon gewählt hat (frei, aber klein) */
  type OnboardingProgress = { step: string; selection?: Record<string, unknown> };

  function readProgress(raw: unknown): OnboardingProgress | null {
    if (typeof raw !== 'string' || raw === '') return null;
    try {
      const v = JSON.parse(raw) as OnboardingProgress;
      return typeof v?.step === 'string' ? v : null;
    } catch {
      return null;
    }
  }

  function onboardingOf(id: string): { status: 'done' | 'skipped' | null; progress: OnboardingProgress | null } {
    const r = userRow(id);
    return { status: r.onboarding === 'done' || r.onboarding === 'skipped' ? r.onboarding : null, progress: readProgress(r.onboarding_progress) };
  }

  /** „Fertig" oder „übersprungen"; die gemerkte Auswahl wird dabei nicht mehr gebraucht */
  function setOnboardingStatus(id: string, status: 'done' | 'skipped'): void {
    if (status !== 'done' && status !== 'skipped') throw new ValidationError(t('Der Status muss „done" oder „skipped" sein'));
    userRow(id);
    run('update users set onboarding = ?, onboarding_progress = null where id = ?', status, id);
  }

  function setOnboardingProgress(id: string, input: { step?: unknown; selection?: unknown }): void {
    if (typeof input.step !== 'string' || !/^[a-z]{2,20}$/.test(input.step)) throw new ValidationError(t('Der Schritt der Einrichtung fehlt'));
    const sel = input.selection;
    if (sel !== undefined && (typeof sel !== 'object' || sel === null || Array.isArray(sel))) throw new ValidationError(t('Die Auswahl der Einrichtung ist ungültig'));
    const json = JSON.stringify(sel === undefined ? { step: input.step } : { step: input.step, selection: sel });
    if (json.length > 4000) throw new ValidationError(t('Die Auswahl der Einrichtung ist zu groß'));
    userRow(id);
    run('update users set onboarding_progress = ? where id = ?', json, id);
  }

  /** „Einrichtung nochmal durchgehen": Status weg, Fortschritt auf den Anfang (damit sie auch in einer Bestandsinstallation aufgeht) */
  function resetOnboarding(id: string): void {
    userRow(id);
    run('update users set onboarding = null, onboarding_progress = ? where id = ?', JSON.stringify({ step: 'welcome' }), id);
  }

  /**
   * Zeigt Stups dieser Person die Einrichtung? Die eine Regel für Oberfläche und Tests (Abschnitt 3.0 der Übergabe):
   * - Nie, wenn schon „fertig" oder „übersprungen" gespeichert ist.
   * - Mitglieder und Kinder (Personen): beim ersten Start, auch in einer vollen Installation (Kurzfassung). Wer vor Migration 30 da war, gilt als fertig.
   * - Administratoren: auf einer neuen Installation (keine Aufgaben, keine Wächter, keine anderen Personen) oder mitten in der Einrichtung
   *   (gespeicherter Fortschritt, sonst wäre sie nach dem Anlegen der Personen nicht mehr „neu"; auch „nochmal durchgehen" setzt ihn).
   */
  function needsOnboarding(id: string, who: { isAdmin: boolean }): boolean {
    const r = userRow(id);
    if (r.onboarding === 'done' || r.onboarding === 'skipped') return false;
    if (!who.isAdmin) return r.is_person === 1;
    if (readProgress(r.onboarding_progress)) return true;
    const others = (one('select count(*) as n from users where is_person = 1 and id <> ?', id)!.n as number) > 0;
    const cards = (one('select count(*) as n from cards')!.n as number) > 0;
    const watchers = (one('select count(*) as n from watchers')!.n as number) > 0;
    return !others && !cards && !watchers;
  }

  const getSetting = (key: string): string | null =>
    (one('select value from settings where key = ?', key)?.value as string | undefined) ?? null;

  const putSetting = (key: string, value: string) =>
    run('insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value', key, value);

  /** Rohe Einstellung (Tabelle settings), für Dinge, die nicht in Settings gehören, etwa die Schalter der Beta */
  const rawSetting = (key: string): string | null => getSetting(key);

  function putRawSetting(key: string, value: string | null): void {
    if (value === null) run('delete from settings where key = ?', key);
    else putSetting(key, value);
  }

  /** Geheimnis, mit dem die Knöpfe in ntfy-Nachrichten signiert werden; entsteht beim ersten Gebrauch und zieht mit der Datenbank um */
  function pushSecret(): string {
    const existing = getSetting('pushSecret');
    if (existing) return existing;
    const secret = randomBytes(32).toString('base64url');
    putSetting('pushSecret', secret);
    return secret;
  }

  function getAccessMode(): AccessMode {
    return getSetting('accessMode') === 'selected' ? 'selected' : 'everyone';
  }

  function setAccessMode(mode: unknown): AccessMode {
    if (mode !== 'everyone' && mode !== 'selected') throw new ValidationError(t('Unbekannter Zugriffsmodus'));
    putSetting('accessMode', mode);
    return mode;
  }

  /**
   * Bis Version 0.10 standen die Personen und ihre Notify-Dienste in den Add-on-Optionen. Sie werden einmal
   * in die Datenbank übernommen, danach gelten die Einstellungen in der App. Bestehende Installationen bleiben
   * bei „alle", frische starten mit „nur freigegebene". Gibt true zurück, wenn übernommen wurde.
   */
  function importLegacyPeople(users: { name: string; notify: string[] }[]): boolean {
    if (getSetting('legacyPeopleImported') !== null) return false;
    tx(() => {
      const hadPeople = people().length > 0 || users.length > 0;
      syncPeople(users);
      if (getSetting('accessMode') === null) putSetting('accessMode', hadPeople ? 'everyone' : 'selected');
      putSetting('legacyPeopleImported', iso());
    });
    return true;
  }

  /**
   * Personen und Zugriff kommen aus der Add-on-Konfiguration in Home Assistant (Option users ausgefüllt).
   * Bei jedem Start gilt die Liste dort: genannte Personen werden angelegt und bekommen ihre Push-Geräte,
   * alle anderen sind keine Person mehr (ihre Aufgaben behalten die Zuweisung), der Zugriff folgt access_mode.
   * In der App sind Personen, Geräte und Zugriff dann gesperrt.
   */
  function applyManagedPeople(users: { name: string; notify: string[] }[], mode: AccessMode): void {
    tx(() => {
      const listed = users.filter((u) => u.name.trim() !== '');
      syncPeople(listed);
      const names = new Set(listed.map((u) => u.name.trim().toLowerCase()));
      for (const p of people()) {
        if (!names.has(p.name.toLowerCase()) && !names.has(p.displayName.toLowerCase())) removePerson(p.id);
      }
      putSetting('accessMode', mode);
      if (getSetting('legacyPeopleImported') === null) putSetting('legacyPeopleImported', iso());
      putSetting('managedByOptions', '1');
    });
  }

  /**
   * Einmalig beim ersten Start des Add-ons nach dem Update: Die Optionen users, access_mode, dashboard_path, daily_summary_time und
   * overdue_nag_time kommen in die Datenbank, danach gilt die App (auch wenn die Konfiguration bisher alles gesperrt hat).
   * Niemand wird entfernt. Ein Wert, der dem Standard entspricht, ungültig ist oder in der App schon gesetzt wurde, wird nicht übernommen.
   * Gibt null zurück, wenn es schon geschehen ist.
   */
  function importAddonOptions(o: AddonOptionsImport, defaults: AddonOptionsDefaults): AddonImportResult | null {
    if (getSetting('addonOptionsImported') !== null) return null;
    return tx(() => {
      const listed = o.users.filter((u) => u.name.trim() !== '');
      let accessMode: AccessMode | null = null;
      if (listed.length > 0) {
        syncPeople(listed);
        putSetting('accessMode', o.accessMode);
        if (getSetting('legacyPeopleImported') === null) putSetting('legacyPeopleImported', iso());
        accessMode = o.accessMode;
      } else {
        importLegacyPeople([]);
      }
      clearManaged();
      const settings: string[] = [];
      const skipped: string[] = [];
      for (const key of ['dashboardPath', 'dailySummaryTime', 'overdueNagTime'] as const) {
        if (o[key] === defaults[key] || getSettings()[key] !== null) continue;
        try {
          setSettings({ [key]: o[key] });
          settings.push(key);
        } catch (err) {
          if (!(err instanceof ValidationError)) throw err;
          skipped.push(key);
        }
      }
      putSetting('addonOptionsImported', iso());
      return { people: listed.length, accessMode, settings, skipped };
    });
  }

  /** Personen und Zugriff werden in der Add-on-Konfiguration verwaltet (nicht in der App) */
  const isManaged = (): boolean => getSetting('managedByOptions') === '1';

  /** Die Konfiguration verwaltet nichts mehr: die App darf Personen und Zugriff wieder ändern. */
  const clearManaged = (): void => {
    if (isManaged()) putSetting('managedByOptions', '0');
  };

  function getSettings(): Settings {
    const get = (k: string) => (one('select value from settings where key = ?', k)?.value as string | undefined) ?? null;
    return { dashboardPath: get('dashboardPath'), panelPath: get('panelPath'), defaultDueTime: get('defaultDueTime') ?? DEFAULT_DUE_TIME, dailySummaryTime: get('dailySummaryTime'), overdueNagTime: get('overdueNagTime') };
  }

  /** Eine Uhrzeit-Einstellung (HH:MM): undefined lässt sie, null löscht sie, alles andere muss die Form haben */
  function putTimeSetting(key: string, time: string | null | undefined): void {
    if (time === undefined) return;
    if (time === null) run('delete from settings where key = ?', key);
    else if (typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) putSetting(key, time);
    else throw new ValidationError(t('Die Uhrzeit muss die Form HH:MM haben, zum Beispiel 09:00'));
  }

  function setSettings(patch: { dashboardPath?: string | null; panelPath?: string | null; defaultDueTime?: string | null; dailySummaryTime?: string | null; overdueNagTime?: string | null }): Settings {
    for (const key of ['dashboardPath', 'panelPath'] as const) {
      const value = patch[key];
      if (value === undefined) continue;
      if (value === null) {
        run('delete from settings where key = ?', key);
        continue;
      }
      checkDashboardPath(value); // beginnt mit „/", kein „//", kein „\", kein Schema, keine Leerzeichen, höchstens 200 Zeichen
      run('insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value', key, value);
    }
    putTimeSetting('defaultDueTime', patch.defaultDueTime);
    putTimeSetting('dailySummaryTime', patch.dailySummaryTime);
    putTimeSetting('overdueNagTime', patch.overdueNagTime);
    return getSettings();
  }

  /** Woher das Bild der Person kommt (Home Assistant oder selbst hochgeladen); null = keins */
  function avatarSource(id: string): 'ha' | 'upload' | null {
    const s = one('select avatar_source from users where id = ?', id)?.avatar_source;
    return s === 'ha' || s === 'upload' ? s : null;
  }

  /** Vermerkt ein neues Bild und gibt die neue Fassung zurück (zählt auch nach dem Entfernen weiter hoch) */
  function setAvatar(id: string, source: 'ha' | 'upload'): number {
    userRow(id);
    run('update users set avatar_source = ?, avatar_rev = avatar_rev + 1 where id = ?', source, id);
    return one('select avatar_rev from users where id = ?', id)!.avatar_rev as number;
  }

  function clearAvatar(id: string): void {
    userRow(id);
    run('update users set avatar_source = null where id = ?', id);
  }

  function userByHaId(haId: string): User | null {
    const r = one('select * from users where ha_user_id = ?', haId);
    return r ? toUser(r) : null;
  }

  function userById(id: string): User | null {
    const r = one('select * from users where id = ?', id);
    return r ? toUser(r) : null;
  }

  return {
    toUser,
    quietOf,
    nextPersonColor,
    cleanServices,
    syncPeople,
    resolveUser,
    people,
    pendingUsers,
    userRow,
    cleanPersonName,
    addPerson,
    removePerson,
    renamePerson,
    setNotifyServices,
    ntfyTopic,
    setNtfyTopic,
    languageOf,
    setLanguage,
    setAccentHue,
    setDashboardPath,
    onboardingOf,
    setOnboardingStatus,
    setOnboardingProgress,
    resetOnboarding,
    needsOnboarding,
    setWeeklySummary,
    setBusyUntil,
    setChild,
    permissionsOf,
    allPermissions,
    setPermissions,
    avatarSource,
    setAvatar,
    clearAvatar,
    getSetting,
    putSetting,
    rawSetting,
    putRawSetting,
    pushSecret,
    getAccessMode,
    setAccessMode,
    importLegacyPeople,
    importAddonOptions,
    applyManagedPeople,
    isManaged,
    clearManaged,
    getSettings,
    setSettings,
    userByHaId,
    userById,
  };
}
