import { t, tn, withLanguage, type Lang } from './i18n/index.js';
import type { Options } from './config.js';
import type { NotificationAction } from './ha.js';
import type { PushGateway, PushMessage } from './push.js';
import { DEFAULT_QUIET, quietEnd } from './quiet.js';
import { firstAt, nextAfter } from './reminders.js';
import { toLocal } from './recurrence.js';
import { dayDiff, formatDue, formatLead, localDateKey, minutesOfDay, parseHm } from './time.js';
import { NUDGE_LATER_MAX, type ClosedNudge, type DueNudge, type NotificationKey, type NotificationKind, type OpenDueCard, type Store } from './store.js';
import type { DueReminder } from './store/reminders.js';

export interface NotifierDeps {
  store: Store;
  push: PushGateway;
  options: Pick<Options, 'dailySummaryTime' | 'overdueNagTime'>;
  now: () => Date;
  timeZone: () => string;
  /** Wird nach Änderungen aufgerufen, die durch eine Push-Aktion entstehen (für Live-Sync). */
  onChange?: () => void;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
  /** Wartezeiten vor erneuten Versuchen in Minuten */
  retryDelaysMin?: number[];
  /** Steht vor der Kennung jedes Knopfs (die Beta: BETA_), damit sich normale App und Beta nicht in die Quere kommen */
  actionPrefix?: string;
  /** "Erst vorschlagen": die Person übernimmt die Karte (wirft, wenn schon jemand schneller war) */
  claim?: (cardId: string, userId: string) => Promise<unknown>;
}

/** Ein Tipp auf einen Knopf: aus Home Assistant (userId) oder über ntfy (personId, schon geprüft) */
export interface PushAction extends NotificationAction {
  /** interne Kennung der Person, wenn der Weg sie selbst kennt (ntfy-Knöpfe sind für eine Person signiert) */
  personId?: string;
}

export type ActionResult = 'completed' | 'claimed' | 'taken' | 'acked' | 'postponed' | 'awaiting' | 'confirmed' | 'rejected' | 'already_done' | 'stale' | 'unknown_card' | 'ignored';

const MINUTE = 60_000;
/** Eine Anfrage ohne Antwort: erst nach dieser Zeit wird erinnert, danach höchstens einmal am Tag */
const CONFIRM_REMIND_AFTER_MS = 2 * 60 * MINUTE;
const CATCH_UP_MS = 12 * 60 * MINUTE;
const LATE_NOTE_MS = 10 * MINUTE;
const SUMMARY_WINDOW_MS = 4 * 60 * MINUTE;
const GROUP = 'stups';
const ACTION_PREFIX = 'KANBAN_DONE';
const NUDGE_PREFIX = 'KANBAN_NUDGE_';
const CONFIRM_PREFIX = 'KANBAN_CONFIRM_';
const CLAIM_PREFIX = 'KANBAN_CLAIM:';

export const cardTag = (cardId: string) => `stups-card-${cardId}`;
const confirmTag = (cardId: string) => `stups-confirm-${cardId}`;

/** Sprache der Push-Nachrichten einer Person: die zuletzt gemeldete; solange keine bekannt ist, Deutsch (so war es bisher) */
export const pushLanguage = (store: Pick<Store, 'languageOf'>, userId: string): Lang => store.languageOf(userId) ?? 'de';

export function createNotifier(deps: NotifierDeps) {
  const { store, push, options } = deps;
  const log = deps.log ?? { info: () => undefined, warn: () => undefined };
  const delays = deps.retryDelaysMin ?? [1, 5, 15];
  const aPrefix = deps.actionPrefix ?? '';
  const retries = new Map<string, { attempts: number; nextAt: number }>();
  let running = false;

  const warned = new Set<string>();
  /** Einmal pro Start melden, wenn jemand zuständig ist, aber keinen Notify-Dienst hat (sonst bleibt es unsichtbar). */
  function warnNoServices(userId: string): void {
    if (warned.has(userId)) return;
    warned.add(userId);
    log.warn(`Kein Push-Gerät für ${store.userById(userId)?.name ?? userId}: keine Push-Nachrichten (einstellbar unter Personen & Zugriff)`);
  }

  const send = (userId: string, message: PushMessage): Promise<boolean> => push.send(userId, message);
  /** Baut die Nachricht in der Sprache des Empfängers */
  const inLang = <T>(userId: string, build: () => T): T => withLanguage(pushLanguage(store, userId), build);

  const doneAction = (cardId: string, dueAt: string) => ({ id: `${aPrefix}${ACTION_PREFIX}:${cardId}:${dueAt}`, title: t('Erledigt') });

  /** Text zum Vorlesen: ohne Emoji und Sonderzeichen, Leerzeichen zusammengefasst, höchstens `max` Zeichen */
  const speakable = (text: string, max = 80): string => {
    const clean = text.replace(/[^\p{L}\p{N}\s.,:;!?'’"„“-]/gu, ' ').replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
  };
  const nameOf = (userId: string | null): string => (userId ? (store.userById(userId)?.displayName ?? t('Jemand')) : t('Jemand'));
  /** „30 Minuten", „1 Stunde", „2 Tage" statt „30 Min." (eine Sprachausgabe liest Abkürzungen schlecht) */
  const spokenLead = (min: number): string => {
    if (min % 1440 === 0) return tn('{n} Tag', '{n} Tage', min / 1440);
    if (min % 60 === 0) return tn('{n} Stunde', '{n} Stunden', min / 60);
    return tn('{n} Minute', '{n} Minuten', min);
  };

  function cardPayload(card: OpenDueCard, body: string, spoken: string): PushMessage {
    return {
      title: card.title,
      body,
      tag: cardTag(card.id),
      group: GROUP,
      open: { cardId: card.id },
      level: 'time-sensitive',
      actions: [doneAction(card.id, card.dueAt)],
      kind: 'due',
      spoken,
    };
  }

  /** Eine Karte ist (von einem Wächter) jemandem zugewiesen worden: gleich Bescheid sagen, ohne auf die Fälligkeit zu warten */
  async function notifyAssigned(card: { id: string; title: string; dueAt: string | null }, userIds: string[]): Promise<void> {
    const nowMs = deps.now().getTime();
    for (const id of userIds) {
      if (!push.canReach(id, 'watcher')) {
        warnNoServices(id);
        continue;
      }
      const message = inLang(id, (): PushMessage => {
        const due = card.dueAt ? formatDue(Date.parse(card.dueAt), nowMs, deps.timeZone()) : '';
        const m: PushMessage = {
          title: card.title,
          body: card.dueAt ? t('Neue Karte für dich · fällig {due}', { due }) : t('Neue Karte für dich'),
          tag: cardTag(card.id),
          group: GROUP,
          open: { cardId: card.id },
          level: 'time-sensitive',
          kind: 'watcher',
          spoken: t('{name}, neue Aufgabe: {title}.', { name: nameOf(id), title: speakable(card.title) }),
        };
        // „Erledigt" gilt für einen bestimmten Termin; ohne Termin bleibt es beim Öffnen der Karte
        if (card.dueAt) m.actions = [doneAction(card.id, card.dueAt)];
        return m;
      });
      if (await send(id, message)) {
        log.info(`Push (neue Karte) „${card.title}" an ${store.userById(id)?.name ?? id} gesendet`);
      }
    }
  }

  /** "Erst vorschlagen": alle, die zu Hause sind, fragen, wer die Karte übernimmt (Knopf „Übernehmen") */
  async function notifySuggest(card: { id: string; title: string }, userIds: string[]): Promise<void> {
    for (const id of userIds) {
      if (!push.canReach(id, 'watcher')) {
        warnNoServices(id);
        continue;
      }
      const message = inLang(id, (): PushMessage => ({
        title: card.title,
        body: t('Wer übernimmt?'),
        tag: cardTag(card.id),
        group: GROUP,
        open: { cardId: card.id },
        level: 'time-sensitive',
        actions: [{ id: `${aPrefix}${CLAIM_PREFIX}${card.id}`, title: t('Übernehmen') }],
        kind: 'watcher',
        spoken: t('Wer übernimmt: {title}?', { title: speakable(card.title) }),
      }));
      if (await send(id, message)) log.info(`Push (Wer übernimmt?) „${card.title}" an ${store.userById(id)?.name ?? id} gesendet`);
    }
  }

  /** Die Frage „Wer übernimmt?" ist beantwortet oder verfallen: bei allen Personen wegräumen */
  async function suggestClosed(card: { id: string }): Promise<void> {
    await Promise.allSettled(store.people().map((p) => push.clear(p.id, cardTag(card.id))));
  }

  /** true, wenn tatsächlich gesendet wurde */
  async function deliver(k: NotificationKey, payload: PushMessage): Promise<boolean> {
    const nowMs = deps.now().getTime();
    const retryKey = JSON.stringify(k);
    const retry = retries.get(retryKey);
    if (retry && retry.nextAt > nowMs) return false;
    if (!store.claimNotification(k)) return false; // schon gesendet (auch vor einem Neustart)

    if (await send(k.userId, payload)) {
      retries.delete(retryKey);
      log.info(`Push (${k.kind}) „${payload.title}" an ${store.userById(k.userId)?.name ?? k.userId} gesendet`);
      return true;
    }
    store.releaseNotification(k);
    const attempts = (retry?.attempts ?? 0) + 1;
    if (attempts > delays.length) {
      store.claimNotification(k, 'failed'); // aufgeben, nicht endlos weiter versuchen
      retries.delete(retryKey);
      log.warn(`Push (${k.kind}) für Karte ${k.cardId} endgültig fehlgeschlagen`);
    } else {
      retries.set(retryKey, { attempts, nextAt: nowMs + delays[attempts - 1]! * MINUTE });
    }
    return false;
  }

  async function summaries(cards: OpenDueCard[], nowMs: number, tz: string): Promise<number> {
    const minutes = minutesOfDay(nowMs, tz);
    const start = parseHm(store.getSettings().dailySummaryTime ?? options.dailySummaryTime);
    if (minutes < start) return 0;
    const date = localDateKey(nowMs, tz);
    let sent = 0;

    for (const person of store.people()) {
      if (!push.canReach(person.id)) continue;
      const k: NotificationKey = { cardId: 'summary', userId: person.id, kind: 'summary', key: date };
      const mine = cards.filter((c) => c.assigneeIds.includes(person.id));
      const overdue = mine.filter((c) => Date.parse(c.dueAt) < nowMs);
      const today = mine.filter((c) => Date.parse(c.dueAt) >= nowMs && dayDiff(Date.parse(c.dueAt), nowMs, tz) === 0);

      const inWindow = (minutes - start) * MINUTE < SUMMARY_WINDOW_MS;
      if (!inWindow || (overdue.length === 0 && today.length === 0)) {
        store.claimNotification(k, 'skipped'); // heute nichts mehr nachholen
        continue;
      }
      const payload = inLang(person.id, (): PushMessage => {
        const lines = [...overdue, ...today].slice(0, 5).map((c) => `• ${c.title} (${formatDue(Date.parse(c.dueAt), nowMs, tz)})`);
        const more = overdue.length + today.length - lines.length;
        if (more > 0) lines.push(t('… und {n} weitere', { n: more }));
        return {
          title: 'Stups',
          body: [t('Heute fällig: {today} · Überfällig: {overdue}', { today: today.length, overdue: overdue.length }), ...lines].join('\n'),
          tag: 'stups-summary',
          group: GROUP,
          open: {},
          level: 'active',
        };
      });
      if (await deliver(k, payload)) sent += 1;
    }
    return sent;
  }

  /**
   * Sonntags-Zusammenfassung (nur für Personen, die sie eingeschaltet haben): eine wertschätzende Nachricht je Woche, ab 18:00
   * Ortszeit innerhalb von vier Stunden, nicht in der Ruhezeit der Person, nie bei null erledigten Karten. Nur aufs Handy.
   */
  async function weeklySummaries(nowMs: number, tz: string): Promise<number> {
    const local = toLocal(nowMs, tz);
    if (new Date(Date.UTC(local.y, local.m - 1, local.d)).getUTCDay() !== 0) return 0; // nur sonntags
    const minutes = minutesOfDay(nowMs, tz);
    const start = 18 * 60;
    if (minutes < start) return 0;
    const wanted = store.people().filter((p) => p.weeklySummary && push.canReach(p.id));
    if (wanted.length === 0) return 0;
    const week = store.fairness('week');
    const date = localDateKey(nowMs, tz);
    const inWindow = (minutes - start) * MINUTE < SUMMARY_WINDOW_MS;
    let sent = 0;
    for (const person of wanted) {
      const k: NotificationKey = { cardId: 'weekly', userId: person.id, kind: 'summary', key: date };
      if (!inWindow || week.total.done === 0) {
        store.claimNotification(k, 'skipped'); // diese Woche nichts mehr nachholen
        continue;
      }
      if (quietEnd(nowMs, tz, person.nudgeQuiet) !== null) continue; // später im Fenster noch einmal versuchen
      const payload = inLang(person.id, (): PushMessage => {
        const names = week.people.filter((p) => p.done > 0).map((p) => `${p.name} ${p.done}`).join(', ');
        return {
          title: 'Stups',
          body: `${tn('Diese Woche habt ihr {n} Aufgabe erledigt.', 'Diese Woche habt ihr {n} Aufgaben erledigt.', week.total.done)} ${names}. 💪`,
          tag: 'stups-weekly',
          group: GROUP,
          open: {},
          level: 'active',
        };
      });
      if (await deliver(k, payload)) sent += 1;
    }
    return sent;
  }

  // ---------- Bestätigung (Rolle „Kind") ----------

  /** Die Frage an einen Bestätiger, mit den Knöpfen „Bestätigen" und „Nochmal" */
  function confirmMessage(id: string, card: { id: string; title: string }, childId: string | null, reminder: boolean): PushMessage {
    return inLang(id, () => ({
      title: card.title,
      body: reminder ? t('{name} wartet auf Bestätigung', { name: nameOf(childId) }) : t('{name} meldet: erledigt. Stimmt das?', { name: nameOf(childId) }),
      tag: confirmTag(card.id),
      group: GROUP,
      open: { cardId: card.id },
      level: 'active',
      actions: [
        { id: `${aPrefix}${CONFIRM_PREFIX}YES:${card.id}`, title: t('Bestätigen') },
        { id: `${aPrefix}${CONFIRM_PREFIX}NO:${card.id}`, title: t('Nochmal') },
      ],
    }));
  }

  /** Ein Kind hat abgehakt: das Kind sieht „Wartet auf Bestätigung" (ersetzt die Erinnerung), die Bestätiger werden gefragt */
  async function confirmationRequested(cardId: string): Promise<void> {
    let card;
    try {
      card = store.getCard(cardId);
    } catch {
      return;
    }
    const childId = card.confirmRequestedBy;
    if (childId) {
      await Promise.allSettled([
        send(childId, inLang(childId, () => ({ title: card.title, body: t('Wartet auf Bestätigung'), tag: cardTag(card.id), group: GROUP, open: { cardId: card.id }, level: 'passive' }))),
      ]);
    }
    if (!childId) return;
    for (const id of store.confirmerIds(childId)) {
      if (!push.canReach(id)) {
        warnNoServices(id);
        continue;
      }
      if (await send(id, confirmMessage(id, card, childId, false))) log.info(`Push (Bestätigung) „${card.title}" an ${nameOf(id)} gesendet`);
    }
  }

  /** Ein Bestätiger hat geantwortet: das Kind erfährt es, die Frage verschwindet bei allen Bestätigern, andere Zuständige sind die Erinnerung los */
  async function confirmationAnswered(a: { cardId: string; childId: string | null; byId: string | null; outcome: 'confirmed' | 'rejected' }): Promise<void> {
    let card;
    try {
      card = store.getCard(a.cardId);
    } catch {
      return;
    }
    if (a.childId) {
      await Promise.allSettled(store.confirmerIds(a.childId).map((id) => push.clear(id, confirmTag(a.cardId))));
    }
    if (a.outcome === 'confirmed') await clearFor(a.cardId, card.assigneeIds.filter((id) => id !== a.childId));
    if (a.childId) {
      const childId = a.childId;
      const child = store.userById(childId);
      // Ein „Nochmal" ist wie ein Stups und darf ins Haus, außer das Kind hat gerade Ruhezeit
      const speak = a.outcome === 'rejected' && !!child && quietEnd(deps.now().getTime(), deps.timeZone(), child.nudgeQuiet) === null;
      const message = inLang(childId, (): PushMessage => {
        const m: PushMessage = {
          title: card.title,
          body: a.outcome === 'confirmed' ? t('Bestätigt von {name} ✓', { name: nameOf(a.byId) }) : t('{name}: Nochmal, bitte', { name: nameOf(a.byId) }),
          tag: cardTag(card.id),
          group: GROUP,
          open: { cardId: card.id },
          level: a.outcome === 'confirmed' ? 'passive' : 'active',
        };
        if (speak) {
          m.kind = 'nudge';
          m.spoken = t('{to}, {from} sagt: Nochmal, bitte. {title}', { to: nameOf(childId), from: speakable(nameOf(a.byId), 40), title: speakable(card.title) });
        }
        return m;
      });
      await Promise.allSettled([send(childId, message)]);
    }
    deps.onChange?.();
  }

  /** Ein Kind tippt „Erledigt" in einer Nachricht: braucht das Bestätigung, wird daraus eine Anfrage. true = so behandelt. */
  async function requestInstead(card: { id: string }, userId: string): Promise<boolean> {
    if (!store.needsConfirmation(card.id, userId)) return false;
    const asked = store.requestConfirmation(card.id, userId);
    if (asked.created) await confirmationRequested(card.id);
    deps.onChange?.();
    return true;
  }

  /** Tipp auf „Bestätigen" oder „Nochmal". Nur die Bestätiger des Kindes (und bei „Bestätigen" wer zuerst kommt) */
  async function handleConfirmAction(answer: 'confirm' | 'reject', cardId: string, a: PushAction): Promise<ActionResult> {
    const user = actorOrReject(a);
    if (!user) return 'ignored';
    let card;
    try {
      card = store.getCard(cardId);
    } catch {
      return 'unknown_card';
    }
    if (card.confirmRequestedAt === null) return 'stale'; // schon beantwortet
    if (!store.mayConfirm(user.id, card.confirmRequestedBy, false)) return 'ignored';
    const res = store.answerConfirmation(cardId, answer, 'push');
    await confirmationAnswered({ cardId, childId: res.childId, byId: user.id, outcome: answer === 'confirm' ? 'confirmed' : 'rejected' });
    log.info(`Karte „${card.title}" ${answer === 'confirm' ? 'bestätigt' : 'zurückgegeben'} von ${user.name}`);
    return answer === 'confirm' ? 'confirmed' : 'rejected';
  }

  /** Anfragen, die keiner beantwortet: nach zwei Stunden an die Bestätiger erinnern, danach höchstens einmal am Tag */
  async function confirmationReminders(nowMs: number, tz: string): Promise<number> {
    let sent = 0;
    const date = localDateKey(nowMs, tz);
    for (const r of store.openConfirmations()) {
      if (!r.childId || nowMs - Date.parse(r.requestedAt) < CONFIRM_REMIND_AFTER_MS) continue;
      for (const id of store.confirmerIds(r.childId)) {
        const person = store.userById(id);
        if (!person || !push.canReach(id) || quietEnd(nowMs, tz, person.nudgeQuiet) !== null) continue;
        const k: NotificationKey = { cardId: r.cardId, userId: id, kind: 'nag', key: `confirm:${date}` };
        if (await deliver(k, confirmMessage(id, { id: r.cardId, title: r.title }, r.childId, true))) sent += 1;
      }
    }
    return sent;
  }

  /** Ein Durchlauf. Gibt die Zahl der gesendeten Nachrichten (je Person) zurück. */
  async function tick(): Promise<number> {
    if (running) return 0;
    running = true;
    try {
      const nowMs = deps.now().getTime();
      const tz = deps.timeZone();
      const cards = store.openDueCards();
      let sent = 0;

      for (const card of cards) {
        const dueMs = Date.parse(card.dueAt);
        for (const userId of card.assigneeIds) {
          const due = inLang(userId, () => formatDue(dueMs, nowMs, tz));
          if (!push.canReach(userId, 'due')) {
            warnNoServices(userId);
            continue;
          }
          const key = (kind: NotificationKind, k: string): NotificationKey => ({ cardId: card.id, userId, kind, key: k });

          if (card.remindBeforeMin && nowMs >= dueMs - card.remindBeforeMin * MINUTE && nowMs < dueMs) {
            const payload = inLang(userId, () =>
              cardPayload(
                card,
                t('In {lead} fällig: {due} · {board}', { lead: formatLead(card.remindBeforeMin!), due, board: card.boardName }),
                t('{name}, {title} ist in {lead} fällig.', { name: nameOf(userId), title: speakable(card.title), lead: spokenLead(card.remindBeforeMin!) }),
              ),
            );
            if (await deliver(key('reminder', card.dueAt), payload)) sent += 1;
          }

          if (nowMs >= dueMs) {
            const late = nowMs - dueMs;
            if (late > CATCH_UP_MS) {
              if (store.claimNotification(key('due', card.dueAt), 'skipped')) {
                log.info(`Push (due) „${card.title}" übersprungen: Termin liegt mehr als 12 Stunden zurück`);
              }
            } else {
              const payload = inLang(userId, () =>
                cardPayload(
                  card,
                  `${t('Fällig: {due} · {board}', { due, board: card.boardName })}${late > LATE_NOTE_MS ? ` ${t('(verspätet)')}` : ''}`,
                  t('{name}, {title} ist fällig.', { name: nameOf(userId), title: speakable(card.title) }),
                ),
              );
              if (await deliver(key('due', card.dueAt), payload)) sent += 1;
            }
          }
        }
      }
      sent += await summaries(cards, nowMs, tz);
      sent += await weeklySummaries(nowMs, tz);
      sent += await confirmationReminders(nowMs, tz);
      sent += await deliverReminders(nowMs, tz);
      sent += await deliverNudges(nowMs);
      return sent;
    } finally {
      running = false;
    }
  }

  // ---------- Nachhaken ----------

  /**
   * Die Nachricht „noch offen“: bei Wächter-Karten wie der bisherige Stups („Denkst du dran?“), bei Aufgaben nach dem Termin „Überfällig seit …“.
   * „Erledigt“ gibt es nur für Zuständige und nur mit Termin (die Aktion gilt für einen bestimmten Termin).
   */
  function reminderPayload(r: DueReminder, userId: string, nowMs: number, tz: string): PushMessage {
    return inLang(userId, (): PushMessage => {
      const overdue = r.dueAt !== null && Date.parse(r.dueAt) < nowMs && !r.watcherId;
      const m: PushMessage = {
        title: r.title,
        body: overdue ? t('Überfällig seit {due} · {board}', { due: formatDue(Date.parse(r.dueAt!), nowMs, tz), board: r.boardName }) : t('Noch offen: Denkst du dran?'),
        tag: cardTag(r.cardId),
        group: GROUP,
        open: { cardId: r.cardId },
        level: 'time-sensitive',
        kind: r.watcherId ? 'watcher' : 'due',
        spoken: overdue ? t('{name}, {title} ist überfällig.', { name: nameOf(userId), title: speakable(r.title) }) : t('{name}, noch offen: {title}.', { name: nameOf(userId), title: speakable(r.title) }),
      };
      if (r.dueAt && r.assigneeIds.includes(userId)) m.actions = [doneAction(r.cardId, r.dueAt)];
      return m;
    });
  }

  /**
   * Nachhaken: „Wenn nicht erledigt“ (Tabelle card_reminders, für Aufgaben persönlich, für Wächter an die jeweils Zuständigen). Fällig, wenn der
   * Zeitpunkt da ist und die Karte noch offen ist; danach der nächste Zeitpunkt, bis zur Höchstzahl. Erledigte, gelöschte und archivierte Karten
   * liefert der Store nicht mehr: damit endet alles von selbst. In der Ruhezeit einer Person kommt nichts (sie wartet bis zum Ende).
   */
  async function deliverReminders(nowMs: number, tz: string): Promise<number> {
    let sent = 0;
    const defaultTime = options.overdueNagTime;
    for (const r of store.dueReminders(new Date(nowMs).toISOString())) {
      const at = r.nextAt === null ? firstAt(r.spec, r.baseMs, tz, defaultTime) : Date.parse(r.nextAt);
      if (r.nextAt === null) store.planReminder(r.id, new Date(at).toISOString());
      if (at > nowMs) continue;

      // Wer bekommt es? Persönlich nur diese Person (und nur, wenn sie das Board sieht), sonst die jetzigen Zuständigen
      const people = r.userId ? (store.userById(r.userId)?.isPerson && store.canSeeBoard(r.userId, r.boardId) ? [r.userId] : []) : r.assigneeIds;
      if (people.length === 0) continue; // niemand zuständig (noch): es wartet, der erste Zeitpunkt bleibt gültig

      const awake = people.filter((id) => quietEnd(nowMs, tz, store.userById(id)?.nudgeQuiet ?? { ...DEFAULT_QUIET, off: true }) === null);
      if (awake.length === 0) {
        const ends = people.map((id) => quietEnd(nowMs, tz, store.userById(id)!.nudgeQuiet)).filter((e): e is number => e !== null);
        store.planReminder(r.id, new Date(Math.min(...ends)).toISOString()); // verschoben auf das Ende der Ruhezeit, nichts gezählt
        continue;
      }

      const retryKey = `reminder:${r.id}:${r.sentCount}`;
      const retry = retries.get(retryKey);
      if (retry && retry.nextAt > nowMs) continue;
      let delivered = 0;
      let failed = 0;
      for (const id of awake) {
        const k: NotificationKey = { cardId: r.cardId, userId: id, kind: 'nag', key: `reminder:${r.id}:${r.sentCount}` };
        if (!push.canReach(id, r.watcherId ? 'watcher' : 'due')) {
          warnNoServices(id);
          continue;
        }
        if (await send(id, reminderPayload(r, id, nowMs, tz))) {
          delivered += 1;
          store.claimNotification(k); // fürs Sendeprotokoll
          log.info(`Push (noch offen) „${r.title}" an ${nameOf(id)} gesendet`);
        } else {
          failed += 1;
        }
      }
      if (delivered === 0 && failed > 0) {
        // Zustellung gescheitert: nach 1, 5 und 15 Minuten noch einmal, dann gilt dieser Zeitpunkt als erledigt
        const attempts = (retry?.attempts ?? 0) + 1;
        if (attempts <= delays.length) {
          retries.set(retryKey, { attempts, nextAt: nowMs + delays[attempts - 1]! * MINUTE });
          continue;
        }
        log.warn(`Nachhaken für Karte ${r.cardId} endgültig fehlgeschlagen`);
      }
      retries.delete(retryKey);
      sent += delivered;
      if (r.watcherId) store.recordWatcherNudge(r.cardId, people, `nach ${Math.round((at - r.baseMs) / MINUTE)} Min.`);

      // Der nächste Zeitpunkt (verpasste werden übersprungen, nicht nachgeholt); nach der Höchstzahl oder ohne Wiederholung ist Schluss
      const count = r.sentCount + 1;
      let next = nextAfter(r.spec, at, tz, defaultTime);
      while (next !== null && next <= nowMs) next = nextAfter(r.spec, next, tz, defaultTime);
      const done = next === null || count >= r.spec.max;
      store.settleReminder(r.id, { sentCount: count, nextAt: done ? null : new Date(next!).toISOString(), done });
    }
    if (sent > 0) deps.onChange?.();
    return sent;
  }

  /** Entfernt die Nachrichten einer Karte von allen Geräten der Zuständigen. */
  async function clearFor(cardId: string, assigneeIds?: string[]): Promise<void> {
    let ids = assigneeIds;
    if (!ids) {
      try {
        ids = store.getCard(cardId).assigneeIds;
      } catch {
        return;
      }
    }
    // Auch wer nur einen Stups zu dieser Karte bekommen hat, soll die Nachricht los werden
    const everyone = [...new Set([...ids, ...store.nudgeRecipients(cardId)])];
    await Promise.allSettled(everyone.map((id) => push.clear(id, cardTag(cardId))));
  }

  /** „Erledigt · nächste Karte Sa 10:00" statt der Erinnerung: gleiches Tag ersetzt die alte Nachricht, ohne Button und ohne Ton. */
  async function confirmRepeat(cardId: string, title: string, assigneeIds: string[], nextDueAt: string): Promise<void> {
    const payload = (id: string): PushMessage =>
      inLang(id, () => ({
        title,
        body: t('Erledigt · nächste Karte {when}', { when: formatDue(Date.parse(nextDueAt), deps.now().getTime(), deps.timeZone()) }),
        tag: cardTag(cardId),
        group: GROUP,
        level: 'passive',
      }));
    const everyone = [...new Set([...assigneeIds, ...store.nudgeRecipients(cardId)])];
    await Promise.allSettled(everyone.map((id) => push.send(id, payload(id))));
  }

  // ---------- Stupse ----------

  /** Die Texte der Schnellauswahl (die Vorlagen stehen deutsch in der Datenbank-Konstante; hier werden sie übersetzt) */
  const templateText = (tpl: NonNullable<DueNudge['template']>): string =>
    ({ think: t('Denkst du dran?'), today: t('Heute noch?'), help: t('Brauch deine Hilfe'), thanks: t('Danke dir! ❤️') })[tpl];

  function nudgePayload(n: DueNudge): PushMessage {
    const actions = [
      { id: `${aPrefix}${NUDGE_PREFIX}DONE:${n.id}`, title: t('Erledigt') },
      { id: `${aPrefix}${NUDGE_PREFIX}ACK:${n.id}`, title: t('Mach ich') },
      // nach dem dritten „Später" gibt es den Knopf nicht mehr
      ...(n.laterCount < NUDGE_LATER_MAX ? [{ id: `${aPrefix}${NUDGE_PREFIX}LATER:${n.id}`, title: t('Später') }] : []),
    ];
    return {
      title: t('{name} stupst dich', { name: n.fromName }),
      body: `${n.cardTitle} · ${n.template ? templateText(n.template) : n.text}`,
      tag: cardTag(n.cardId),
      group: GROUP,
      open: { cardId: n.cardId },
      // Keine Stufe gesetzt, also normal (nicht „time-sensitive"): ein Stups soll freundlich sein und nicht durch den Fokus brechen
      actions,
      kind: 'nudge',
      nudgeId: n.id,
      spoken: t('{to}, {from} stupst dich: {title}. {text}', {
        to: nameOf(n.toId),
        from: speakable(n.fromName, 40),
        title: speakable(n.cardTitle),
        text: speakable(n.template ? templateText(n.template) : n.text, 120),
      }),
    };
  }

  /** Stellt fällige Stupse zu. Vormerken, senden, bei einem Fehler zurücknehmen und nach 1, 5 und 15 Minuten erneut versuchen. */
  async function deliverNudges(nowMs: number): Promise<number> {
    let sent = 0;
    for (const n of store.dueNudges()) {
      const retryKey = `nudge:${n.id}:${n.round}`;
      const retry = retries.get(retryKey);
      if (retry && retry.nextAt > nowMs) continue;
      if (!store.claimNudge(n.id, n.round)) continue; // schon zugestellt (auch vor einem Neustart)

      if (await send(n.toId, inLang(n.toId, () => nudgePayload(n)))) {
        retries.delete(retryKey);
        log.info(`Stups „${n.cardTitle}" von ${n.fromName} an ${nameOf(n.toId)} gesendet`);
        sent += 1;
        continue;
      }
      if (!push.canReach(n.toId, 'nudge')) {
        retries.delete(retryKey);
        log.warn(`Stups „${n.cardTitle}": ${nameOf(n.toId)} hat kein Push-Gerät, nicht zugestellt`);
        continue; // bleibt vorgemerkt, es gibt nichts zu wiederholen
      }
      store.releaseNudge(n.id, n.round);
      const attempts = (retry?.attempts ?? 0) + 1;
      if (attempts > delays.length) {
        store.claimNudge(n.id, n.round); // aufgeben
        retries.delete(retryKey);
        log.warn(`Stups „${n.cardTitle}" an ${nameOf(n.toId)} endgültig fehlgeschlagen`);
      } else {
        retries.set(retryKey, { attempts, nextAt: nowMs + delays[attempts - 1]! * MINUTE });
      }
    }
    return sent;
  }

  /** Leise Rückmeldung an den Absender; eigenes Tag je Stups, damit sie sich nicht gegenseitig ersetzen. */
  async function feedback(toId: string, nudgeId: string, cardId: string, title: string, message: string): Promise<void> {
    const payload: PushMessage = {
      title,
      body: message,
      tag: `${NUDGE_PREFIX.toLowerCase().replace(/_/g, '-')}${nudgeId}`,
      group: GROUP,
      open: { cardId },
      level: 'passive',
    };
    await Promise.allSettled([push.send(toId, payload)]);
  }

  const inflight = new Set<Promise<void>>();
  const track = (p: Promise<void>): Promise<void> => {
    inflight.add(p);
    void p.finally(() => inflight.delete(p));
    return p;
  };

  /** Der Store meldet, welche Stupse durch das Erledigen einer Karte geschlossen wurden: „… hat erledigt ✓" an die Absender. */
  function nudgesClosed(list: ClosedNudge[]): Promise<void> {
    return track(
      (async () => {
        for (const c of list) {
          if (c.byId !== null && c.byId === c.fromId) continue; // der Absender hat selbst erledigt
          await feedback(c.fromId, c.nudgeId, c.cardId, c.cardTitle, inLang(c.fromId, () => t('{name} hat erledigt ✓', { name: nameOf(c.byId) })));
        }
        deps.onChange?.();
      })(),
    );
  }

  /** Wartet, bis alle angestoßenen Rückmeldungen gesendet sind (für Tests und das geordnete Beenden). */
  const idle = async (): Promise<void> => {
    await Promise.allSettled([...inflight]);
  };

  /** Tipp auf „Erledigt", „Mach ich" oder „Später" in einem Stups. Nur der Empfänger darf antworten. */
  const actor = (a: PushAction) => {
    const user = a.personId ? store.userById(a.personId) : a.userId ? store.userByHaId(a.userId) : null;
    return user && user.isPerson ? user : null; // nur eine eindeutig bestimmte Person der Liste darf handeln
  };

  /** Die handelnde Person der Aktion; ist sie nicht eindeutig, wird abgelehnt und protokolliert (sonst liefe „Erledigt" an den Kinderregeln vorbei) */
  function actorOrReject(a: PushAction): ReturnType<typeof actor> {
    const user = actor(a);
    if (!user) log.warn(`Push-Aktion „${a.action.split(':')[0]}" abgelehnt: die handelnde Person ist nicht eindeutig bestimmt`);
    return user;
  }

  async function handleNudgeAction(kind: string, nudgeId: string, a: PushAction): Promise<ActionResult> {
    const user = actorOrReject(a);
    if (!user) return 'ignored';
    const nudge = store.getNudge(nudgeId);
    if (!nudge) return 'stale';
    if (nudge.toId !== user.id) return 'ignored';

    let card;
    try {
      card = store.getCard(nudge.cardId);
    } catch {
      return 'unknown_card';
    }
    if (nudge.reply !== null || card.completedAt) return 'stale';

    if (kind === 'DONE') {
      if (await requestInstead(card, user.id)) return 'awaiting';
      const res = store.completeCard(card.id, { by: user.id, source: 'push' });
      if (res.completionId === null) return 'already_done';
      if (res.nextDueAt) await confirmRepeat(card.id, card.title, card.assigneeIds, res.nextDueAt);
      else await clearFor(card.id, card.assigneeIds);
      await idle(); // Rückmeldungen an die Absender
      deps.onChange?.();
      log.info(`Karte „${card.title}" per Stups erledigt von ${user.name}`);
      return 'completed';
    }

    const res = store.replyNudge(nudgeId, user.id, kind === 'ACK' ? 'ack' : 'later');
    if (res.outcome !== 'ok') return 'stale';
    // Die Nachricht verschwindet vom Gerät: bei „Später" kommt sie später neu
    await clearFor(card.id, []);
    if (kind === 'ACK') {
      await feedback(nudge.fromId, nudge.id, card.id, card.title, inLang(nudge.fromId, () => t('{name} macht\'s 👍', { name: user.displayName })));
    }
    deps.onChange?.();
    return kind === 'ACK' ? 'acked' : 'postponed';
  }

  /** Reagiert auf das Tippen von „Erledigt" in einer Push-Nachricht. */
  async function handleAction(a: PushAction): Promise<ActionResult> {
    const nm = new RegExp(`^${aPrefix}${NUDGE_PREFIX}(DONE|ACK|LATER):(.+)$`).exec(a.action);
    if (nm) return handleNudgeAction(nm[1]!, nm[2]!, a);
    const claim = new RegExp(`^${aPrefix}${CLAIM_PREFIX}(.+)$`).exec(a.action);
    if (claim) {
      const user = actorOrReject(a);
      if (!user || !deps.claim) return 'ignored';
      try {
        await deps.claim(claim[1]!, user.id);
        return 'claimed';
      } catch {
        return 'taken'; // jemand war schneller (oder die Karte ist erledigt): für den Knopf kein Fehler
      }
    }
    const cm = new RegExp(`^${aPrefix}${CONFIRM_PREFIX}(YES|NO):(.+)$`).exec(a.action);
    if (cm) return handleConfirmAction(cm[1] === 'YES' ? 'confirm' : 'reject', cm[2]!, a);
    const m = new RegExp(`^${aPrefix}${ACTION_PREFIX}:([^:]+):(.+)$`).exec(a.action);
    if (!m) return 'ignored';
    const [, cardId, key] = m as unknown as [string, string, string];

    let card;
    try {
      card = store.getCard(cardId);
    } catch {
      return 'unknown_card';
    }
    // Nur der Termin, für den die Nachricht gesendet wurde, zählt. Ein alter Tipp erledigt nichts Neues.
    if (!card.dueAt || Date.parse(card.dueAt) !== Date.parse(key)) return 'stale';

    const user = actorOrReject(a);
    if (!user) return 'ignored';
    if (!card.assigneeIds.includes(user.id)) {
      log.warn(`Push-Aktion „Erledigt" für „${card.title}" von ${user.name} abgelehnt: nicht zugewiesen`);
      return 'ignored';
    }
    if (await requestInstead(card, user.id)) return 'awaiting';
    const res = store.completeCard(cardId, { by: user.id, source: 'push' });
    if (res.completionId === null) return 'already_done';

    if (res.nextDueAt) {
      // Bei einer Wiederholung ersetzt eine kurze Bestätigung die Nachricht (gleiches Tag), statt sie nur zu entfernen
      await confirmRepeat(card.id, card.title, card.assigneeIds, res.nextDueAt);
    } else {
      await clearFor(cardId, card.assigneeIds);
    }
    deps.onChange?.();
    log.info(`Karte „${card.title}" per Push erledigt von ${user.name}`);
    return 'completed';
  }

  return { tick, handleAction, clearFor, nudgesClosed, notifyAssigned, notifySuggest, suggestClosed, confirmationRequested, confirmationAnswered, idle };
}

export type Notifier = ReturnType<typeof createNotifier>;
