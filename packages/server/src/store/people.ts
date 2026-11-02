import { randomBytes, randomUUID } from 'node:crypto';
import { NotFoundError, ValidationError } from '../errors.js';
import { DEFAULT_QUIET, type QuietWindow } from '../quiet.js';
import { type User, type AccessMode, type Settings, DEFAULT_DUE_TIME, type Row } from './types.js';
import { PERSON_COLORS, NTFY_TOPIC_RE } from './constants.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import { t } from '../i18n/index.js';

/** Personen, Zugriff und Einstellungen */
export function createPeople(c: Ctx, late: unknown) {
  // Erst hier auf den vollen Typ gebracht: stünde Internals schon im Kopf, hinge sein Typ von sich selbst ab
  const s = late as Internals;
  const { iso, one, all, run, tx } = c;
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

      const names = [who.name, who.displayName].map((n) => n.trim().toLowerCase()).filter(Boolean);
      const placeholder = all('select * from users where ha_user_id is null').find((u) =>
        names.includes(u.name.toLowerCase()),
      );
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

  /** Nimmt jemanden aus der Liste. Karten behalten die Zuweisung, sie tritt wieder in Kraft, wenn die Person zurückkommt. */
  function removePerson(id: string): void {
    userRow(id);
    run('update users set is_person = 0 where id = ?', id);
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
   * alle anderen sind keine Person mehr (ihre Karten behalten die Zuweisung), der Zugriff folgt access_mode.
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

  /** Personen und Zugriff werden in der Add-on-Konfiguration verwaltet (nicht in der App) */
  const isManaged = (): boolean => getSetting('managedByOptions') === '1';

  /** Die Konfiguration verwaltet nichts mehr: die App darf Personen und Zugriff wieder ändern. */
  const clearManaged = (): void => {
    if (isManaged()) putSetting('managedByOptions', '0');
  };

  function getSettings(): Settings {
    const get = (k: string) => (one('select value from settings where key = ?', k)?.value as string | undefined) ?? null;
    return { dashboardPath: get('dashboardPath'), panelPath: get('panelPath'), defaultDueTime: get('defaultDueTime') ?? DEFAULT_DUE_TIME };
  }

  function setSettings(patch: { dashboardPath?: string | null; panelPath?: string | null; defaultDueTime?: string | null }): Settings {
    for (const key of ['dashboardPath', 'panelPath'] as const) {
      const value = patch[key];
      if (value === undefined) continue;
      if (value === null) {
        run('delete from settings where key = ?', key);
        continue;
      }
      if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.length > 200) {
        throw new ValidationError(t('Der Pfad muss mit / beginnen'));
      }
      run('insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value', key, value);
    }
    if (patch.defaultDueTime !== undefined) {
      const time = patch.defaultDueTime;
      if (time === null) run('delete from settings where key = ?', 'defaultDueTime');
      else if (typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) putSetting('defaultDueTime', time);
      else throw new ValidationError(t('Die Uhrzeit muss die Form HH:MM haben, zum Beispiel 09:00'));
    }
    return getSettings();
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
    getSetting,
    putSetting,
    rawSetting,
    putRawSetting,
    pushSecret,
    getAccessMode,
    setAccessMode,
    importLegacyPeople,
    applyManagedPeople,
    isManaged,
    clearManaged,
    getSettings,
    setSettings,
    userByHaId,
    userById,
  };
}
