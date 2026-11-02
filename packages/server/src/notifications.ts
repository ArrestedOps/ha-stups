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

  const doneAction = (cardId: string, dueAt: string) => ({ id: `${aPrefix}${ACTION_PREFIX}:${cardId}:${dueAt}`, title: 'Erledigt' });

  function cardPayload(card: OpenDueCard, body: string): PushMessage {
    return {
      title: card.title,
      body,
      tag: cardTag(card.id),
      group: GROUP,
      open: { cardId: card.id },
      level: 'time-sensitive',
      actions: [doneAction(card.id, card.dueAt)],
    };
  }

  /** Eine Karte ist (von einem Wächter) jemandem zugewiesen worden: gleich Bescheid sagen, ohne auf die Fälligkeit zu warten */
  async function notifyAssigned(card: { id: string; title: string; dueAt: string | null }, userIds: string[]): Promise<void> {
    const nowMs = deps.now().getTime();
    const due = card.dueAt ? ` · fällig ${formatDue(Date.parse(card.dueAt), nowMs, deps.timeZone())}` : '';
    for (const id of userIds) {
      if (!push.canReach(id)) {
        warnNoServices(id);
        continue;
      }
      const message: PushMessage = {
        title: card.title,
        body: `Neue Karte für dich${due}`,
        tag: cardTag(card.id),
        group: GROUP,
        open: { cardId: card.id },
        level: 'time-sensitive',
      };
      // „Erledigt" gilt für einen bestimmten Termin; ohne Termin bleibt es beim Öffnen der Karte
      if (card.dueAt) message.actions = [doneAction(card.id, card.dueAt)];
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
      const message: PushMessage = {
        title: card.title,
        body: 'Noch offen: Denkst du dran?',
        tag: cardTag(card.id),
        group: GROUP,
        open: { cardId: card.id },
        level: 'time-sensitive',
      };
      if (card.dueAt) message.actions = [doneAction(card.id, card.dueAt)];
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
      const lines = [...overdue, ...today]
        .slice(0, 5)
        .map((c) => `• ${c.title} (${formatDue(Date.parse(c.dueAt), nowMs, tz)})`);
      const more = overdue.length + today.length - lines.length;
      if (more > 0) lines.push(`… und ${more} weitere`);
      const payload: PushMessage = {
        title: 'Stups',
        body: [`Heute fällig: ${today.length} · Überfällig: ${overdue.length}`, ...lines].join('\n'),
        tag: 'stups-summary',
        group: GROUP,
        open: {},
        level: 'active',
      };
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
        const due = formatDue(dueMs, nowMs, tz);
        for (const userId of card.assigneeIds) {
          if (!push.canReach(userId)) {
            warnNoServices(userId);
            continue;
          }
          const key = (kind: NotificationKind, k: string): NotificationKey => ({ cardId: card.id, userId, kind, key: k });

          if (card.remindBeforeMin && nowMs >= dueMs - card.remindBeforeMin * MINUTE && nowMs < dueMs) {
            const msg = `In ${formatLead(card.remindBeforeMin)} fällig: ${due} · ${card.boardName}`;
            if (await deliver(key('reminder', card.dueAt), cardPayload(card, msg))) sent += 1;
          }

          if (nowMs >= dueMs) {
            const late = nowMs - dueMs;
            if (late > CATCH_UP_MS) {
              if (store.claimNotification(key('due', card.dueAt), 'skipped')) {
                log.info(`Push (due) „${card.title}" übersprungen: Termin liegt mehr als 12 Stunden zurück`);
              }
            } else {
              const msg = `Fällig: ${due} · ${card.boardName}${late > LATE_NOTE_MS ? ' (verspätet)' : ''}`;
              if (await deliver(key('due', card.dueAt), cardPayload(card, msg))) sent += 1;
            }
          }

          if (
            card.overdueNag &&
            dayDiff(dueMs, nowMs, tz) < 0 &&
            minutesOfDay(nowMs, tz) >= parseHm(options.overdueNagTime)
          ) {
            const msg = `Überfällig seit ${due} · ${card.boardName}`;
            if (await deliver(key('nag', localDateKey(nowMs, tz)), cardPayload(card, msg))) sent += 1;
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
    const payload: PushMessage = {
      title,
      body: `Erledigt · nächste Karte ${formatDue(Date.parse(nextDueAt), deps.now().getTime(), deps.timeZone())}`,
      tag: cardTag(cardId),
      group: GROUP,
      level: 'passive',
    };
    const everyone = [...new Set([...assigneeIds, ...store.nudgeRecipients(cardId)])];
    await Promise.allSettled(everyone.map((id) => push.send(id, payload)));
  }

  // ---------- Stupse ----------

  const nameOf = (userId: string | null): string => (userId ? (store.userById(userId)?.displayName ?? 'Jemand') : 'Jemand');

  function nudgePayload(n: DueNudge): PushMessage {
    const actions = [
      { id: `${aPrefix}${NUDGE_PREFIX}DONE:${n.id}`, title: 'Erledigt' },
      { id: `${aPrefix}${NUDGE_PREFIX}ACK:${n.id}`, title: 'Mach ich' },
      // nach dem dritten „Später" gibt es den Knopf nicht mehr
      ...(n.laterCount < NUDGE_LATER_MAX ? [{ id: `${aPrefix}${NUDGE_PREFIX}LATER:${n.id}`, title: 'Später' }] : []),
    ];
    return {
      title: `${n.fromName} stupst dich`,
      body: `${n.cardTitle} · ${n.text}`,
      tag: cardTag(n.cardId),
      group: GROUP,
      open: { cardId: n.cardId },
      // Keine Stufe gesetzt, also normal (nicht „time-sensitive"): ein Stups soll freundlich sein und nicht durch den Fokus brechen
      actions,
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

      if (await send(n.toId, nudgePayload(n))) {
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
          await feedback(c.fromId, c.nudgeId, c.cardId, c.cardTitle, `${nameOf(c.byId)} hat erledigt ✓`);
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
      await feedback(nudge.fromId, nudge.id, card.id, card.title, `${user.displayName} macht's 👍`);
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
