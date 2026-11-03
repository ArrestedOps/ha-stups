import { t, tn, withLanguage, type Lang } from './i18n/index.js';
import type { Options } from './config.js';
import type { NotificationAction } from './ha.js';
import type { PushGateway, PushMessage } from './push.js';
import { dayDiff, formatDue, formatLead, localDateKey, minutesOfDay, parseHm } from './time.js';
import { NUDGE_LATER_MAX, type ClosedNudge, type DueNudge, type NotificationKey, type NotificationKind, type OpenDueCard, type Store } from './store.js';

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
}

/** Ein Tipp auf einen Knopf: aus Home Assistant (userId) oder über ntfy (personId, schon geprüft) */
export interface PushAction extends NotificationAction {
  /** interne Kennung der Person, wenn der Weg sie selbst kennt (ntfy-Knöpfe sind für eine Person signiert) */
  personId?: string;
}

export type ActionResult = 'completed' | 'acked' | 'postponed' | 'already_done' | 'stale' | 'unknown_card' | 'ignored';

const MINUTE = 60_000;
const CATCH_UP_MS = 12 * 60 * MINUTE;
const LATE_NOTE_MS = 10 * MINUTE;
const SUMMARY_WINDOW_MS = 4 * 60 * MINUTE;
const GROUP = 'stups';
const ACTION_PREFIX = 'KANBAN_DONE';
const NUDGE_PREFIX = 'KANBAN_NUDGE_';

export const cardTag = (cardId: string) => `stups-card-${cardId}`;

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
      if (!push.canReach(id)) {
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

  /** Eine Karte eines Wächters ist nach der eingestellten Zeit noch offen: freundlich erinnern */
  async function notifyStillOpen(card: { id: string; title: string; dueAt: string | null }, userIds: string[]): Promise<void> {
    for (const id of userIds) {
      if (!push.canReach(id)) {
        warnNoServices(id);
        continue;
      }
      const message = inLang(id, (): PushMessage => {
        const m: PushMessage = {
          title: card.title,
          body: t('Noch offen: Denkst du dran?'),
          tag: cardTag(card.id),
          group: GROUP,
          open: { cardId: card.id },
          level: 'time-sensitive',
          kind: 'watcher',
          spoken: t('{name}, noch offen: {title}.', { name: nameOf(id), title: speakable(card.title) }),
        };
        if (card.dueAt) m.actions = [doneAction(card.id, card.dueAt)];
        return m;
      });
      if (await send(id, message)) {
        log.info(`Push (noch offen) „${card.title}" an ${store.userById(id)?.name ?? id} gesendet`);
      }
    }
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
    const start = parseHm(options.dailySummaryTime);
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
          if (!push.canReach(userId)) {
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

          if (
            card.overdueNag &&
            dayDiff(dueMs, nowMs, tz) < 0 &&
            minutesOfDay(nowMs, tz) >= parseHm(options.overdueNagTime)
          ) {
            const payload = inLang(userId, () =>
              cardPayload(
                card,
                t('Überfällig seit {due} · {board}', { due, board: card.boardName }),
                t('{name}, {title} ist überfällig.', { name: nameOf(userId), title: speakable(card.title) }),
              ),
            );
            if (await deliver(key('nag', localDateKey(nowMs, tz)), payload)) sent += 1;
          }
        }
      }
      sent += await summaries(cards, nowMs, tz);
      sent += await deliverNudges(nowMs);
      return sent;
    } finally {
      running = false;
    }
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
      if (!push.canReach(n.toId)) {
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
  const actor = (a: PushAction) => (a.personId ? store.userById(a.personId) : a.userId ? store.userByHaId(a.userId) : null);

  async function handleNudgeAction(kind: string, nudgeId: string, a: PushAction): Promise<ActionResult> {
    const user = actor(a);
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

    const user = actor(a);
    const res = store.completeCard(cardId, { by: user?.id ?? null, source: 'push' });
    if (res.completionId === null) return 'already_done';

    if (res.nextDueAt) {
      // Bei einer Wiederholung ersetzt eine kurze Bestätigung die Nachricht (gleiches Tag), statt sie nur zu entfernen
      await confirmRepeat(card.id, card.title, card.assigneeIds, res.nextDueAt);
    } else {
      await clearFor(cardId, card.assigneeIds);
    }
    deps.onChange?.();
    log.info(`Karte „${card.title}" per Push erledigt${user ? ` von ${user.name}` : ''}`);
    return 'completed';
  }

  return { tick, handleAction, clearFor, nudgesClosed, notifyAssigned, notifyStillOpen, idle };
}

export type Notifier = ReturnType<typeof createNotifier>;
