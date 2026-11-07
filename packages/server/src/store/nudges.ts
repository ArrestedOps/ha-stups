import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, ValidationError } from '../errors.js';
import { isHm, quietEnd } from '../quiet.js';
import { NUDGE_TEMPLATES, NUDGE_TEXT_MAX, NUDGE_COOLDOWN_MS, NUDGE_LATER_MS, NUDGE_LATER_MAX, type User, type NudgeTemplate, type Nudge, type NudgeSent, type NudgeSkipped, type NudgeTarget, type DueNudge, type RecentNudge, type ActivityEntry, type Row } from './types.js';
import { LIVE_BOARD, OPEN_CARD, PUBLIC_BOARD } from './constants.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import type { Viewer } from './visibility.js';
import { t } from '../i18n/index.js';

/** Stupsen */
export function createNudgesPart(c: Ctx, late: unknown) {
  // Erst hier auf den vollen Typ gebracht: stünde Internals schon im Kopf, hinge sein Typ von sich selbst ab
  const s = late as Internals;
  const { now, timeZone, iso, one, all, run, tx } = c;
  // Funktionen aus anderen Themen: erst beim Aufruf nachgeschlagen (alle Teile sind bei der Verwendung zusammengesetzt)
  const { quietOf, toUser, userRow, visibleCardRow, canSeeBoard, visibleBoardsSql } = lazy(s, ['quietOf', 'toUser', 'userRow', 'visibleCardRow', 'canSeeBoard', 'visibleBoardsSql'] as const);

  const toNudge = (r: Row): Nudge => ({
    id: r.id,
    cardId: r.card_id,
    fromId: r.from_user,
    toId: r.to_user,
    template: r.template,
    text: r.text,
    createdAt: r.created_at,
    deliverAt: r.deliver_at,
    deliveredAt: r.delivered_at,
    deliveredRound: r.delivered_round,
    laterCount: r.later_count,
    reply: r.reply,
    replyAt: r.reply_at,
  });

  const getNudge = (id: string): Nudge | undefined => {
    const r = one('select * from nudges where id = ?', id);
    return r ? toNudge(r) : undefined;
  };

  /** Bis wann die Sperrzeit für dieses Paar an dieser Karte noch gilt (null = darf stupsen) */
  function nudgeCooldownEnd(cardId: string, fromId: string, toId: string, nowMs: number): number | null {
    const last = one('select max(created_at) as t from nudges where card_id = ? and from_user = ? and to_user = ?', cardId, fromId, toId);
    if (!last?.t) return null;
    const end = Date.parse(last.t as string) + NUDGE_COOLDOWN_MS;
    return end > nowMs ? end : null;
  }

  /** Ein Notify-Dienst (Home Assistant), ein ntfy-Thema oder ein eingeschalteter Haus-Kanal für Stupse: irgendein Weg, auf dem ein Stups ankommen kann */
  const hasDevice = (u: Row): boolean =>
    (JSON.parse(u.notify_services ?? '[]') as string[]).length > 0 ||
    (typeof u.ntfy_topic === 'string' && u.ntfy_topic !== '') ||
    one(`select 1 as x from house_channels where user_id = ? and enabled = 1 and kinds like '%"nudge"%' limit 1`, u.id) !== undefined;

  /** Frühester Zustellzeitpunkt: sofort, außer der Empfänger hat gerade Ruhezeit */
  const deliverAtFor = (recipient: Row, atMs: number): number => quietEnd(atMs, timeZone(), quietOf(recipient)) ?? atMs;

  function createNudges(
    cardId: string,
    fromId: string,
    input: { to: unknown; template?: unknown; text?: unknown },
  ): { sent: NudgeSent[]; skipped: NudgeSkipped[] } {
    const sender = one('select * from users where id = ?', fromId);
    if (!sender || sender.is_person !== 1) throw new ForbiddenError(t('Nur Personen von Stups können stupsen'));
    const card = visibleCardRow(cardId);
    if (card.completed_at !== null || card.archived_at !== null) throw new ConflictError(t('Die Karte ist schon erledigt'));

    if (input.text !== undefined && input.text !== null && typeof input.text !== 'string') {
      throw new ValidationError(t('Der Text muss aus Zeichen bestehen'));
    }
    const custom = typeof input.text === 'string' ? input.text.trim() : '';
    let template: NudgeTemplate | null = null;
    let text: string;
    if (custom) {
      if (custom.length > NUDGE_TEXT_MAX) throw new ValidationError(t('Der Text ist zu lang (höchstens {max} Zeichen)', { max: NUDGE_TEXT_MAX }));
      text = custom;
    } else {
      if (typeof input.template !== 'string' || !(input.template in NUDGE_TEMPLATES)) {
        throw new ValidationError(t('Bitte eine Nachricht wählen oder schreiben'));
      }
      template = input.template as NudgeTemplate;
      text = NUDGE_TEMPLATES[template];
    }
    if (!Array.isArray(input.to) || input.to.length === 0) throw new ValidationError(t('Bitte mindestens eine Person wählen'));
    const recipients = [...new Set(input.to as string[])];

    return tx(() => {
      const nowMs = now().getTime();
      const sent: NudgeSent[] = [];
      const skipped: NudgeSkipped[] = [];
      for (const toId of recipients) {
        if (toId === fromId) {
          skipped.push({ to: toId, reason: 'self', retryAt: null });
          continue;
        }
        const to = typeof toId === 'string' ? one('select * from users where id = ?', toId) : undefined;
        // Wer die Karte nicht sehen darf (privates Board), bekommt keinen Stups zu ihr
        if (!to || to.is_person !== 1 || !canSeeBoard(toId, card.board_id)) {
          skipped.push({ to: toId, reason: 'no_person', retryAt: null });
          continue;
        }
        if (!hasDevice(to)) {
          skipped.push({ to: toId, reason: 'no_device', retryAt: null });
          continue;
        }
        const cooldown = nudgeCooldownEnd(cardId, fromId, toId, nowMs);
        if (cooldown !== null) {
          skipped.push({ to: toId, reason: 'rate', retryAt: new Date(cooldown).toISOString() });
          continue;
        }
        const id = randomUUID();
        const deliverMs = deliverAtFor(to, nowMs);
        run(
          `insert into nudges (id, card_id, from_user, to_user, template, text, created_at, deliver_at)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          cardId,
          fromId,
          toId,
          template,
          text,
          new Date(nowMs).toISOString(),
          new Date(deliverMs).toISOString(),
        );
        sent.push({ nudgeId: id, to: toId, status: deliverMs > nowMs ? 'queued' : 'sent', deliverAt: new Date(deliverMs).toISOString() });
      }
      return { sent, skipped };
    });
  }

  /** Wer in der Stups-Auswahl steht, wer vorausgewählt ist und warum jemand (noch) nicht wählbar ist */
  function nudgeTargets(cardId: string, fromId: string): NudgeTarget[] {
    const card = visibleCardRow(cardId);
    const nowMs = now().getTime();
    const assigned = new Set(all('select user_id from card_assignees where card_id = ?', cardId).map((r) => r.user_id as string));
    // Nur Personen, die das Board der Karte sehen
    const others = all('select * from users where is_person = 1 and id <> ? order by created_at, rowid', fromId).filter((u) => canSeeBoard(u.id as string, card.board_id as string));
    const targets = others.map((u): NudgeTarget => {
      const cooldown = hasDevice(u) ? nudgeCooldownEnd(cardId, fromId, u.id, nowMs) : null;
      const reason = !hasDevice(u) ? 'no_device' : cooldown !== null ? 'rate' : null;
      const deliverMs = reason === null ? deliverAtFor(u, nowMs) : nowMs;
      return {
        id: u.id,
        name: u.display_name,
        color: u.color,
        selectable: reason === null,
        reason,
        retryAt: cooldown !== null ? new Date(cooldown).toISOString() : null,
        deliverAt: reason === null && deliverMs > nowMs ? new Date(deliverMs).toISOString() : null,
        preselected: false,
      };
    });
    const assignedOthers = targets.filter((t) => assigned.has(t.id));
    const selectable = targets.filter((t) => t.selectable);
    if (assignedOthers.length > 0) {
      for (const t of assignedOthers) t.preselected = t.selectable;
    } else if (selectable.length === 1) {
      selectable[0]!.preselected = true;
    }
    return targets;
  }

  /** Stupse, die jetzt zugestellt werden sollen (noch nicht beantwortet, Karte offen, Empfänger ist Person) */
  function dueNudges(): DueNudge[] {
    return all(
      `select n.*, c.title as card_title, f.display_name as from_name
       from nudges n
       join cards c on c.id = n.card_id
       join users f on f.id = n.from_user
       join users t on t.id = n.to_user and t.is_person = 1
       where n.reply is null and n.delivered_round < n.later_count and n.deliver_at <= ? and ${OPEN_CARD}${LIVE_BOARD}
       order by n.deliver_at, n.rowid`,
      now().toISOString(),
    ).map((r) => ({
      id: r.id,
      cardId: r.card_id,
      cardTitle: r.card_title,
      fromId: r.from_user,
      fromName: r.from_name,
      toId: r.to_user,
      text: r.text,
      template: r.template ?? null,
      round: r.later_count,
      laterCount: r.later_count,
    }));
  }

  /** Merkt die Zustellung vor. false = jemand anderes war schneller (oder es gibt nichts mehr zuzustellen). */
  function claimNudge(id: string, round: number): boolean {
    return (
      Number(
        run('update nudges set delivered_round = ?, delivered_at = ? where id = ? and reply is null and delivered_round < ?', round, iso(), id, round)
          .changes,
      ) > 0
    );
  }

  /** Nimmt eine Vormerkung zurück, wenn das Senden nicht geklappt hat */
  function releaseNudge(id: string, round: number): void {
    run('update nudges set delivered_round = ? where id = ? and delivered_round = ?', round - 1, id, round);
  }

  /** Antwort des Empfängers auf „Mach ich" oder „Später". Alles Veraltete wird mit „stale" abgewiesen. */
  function replyNudge(
    id: string,
    userId: string,
    action: 'ack' | 'later',
  ): { outcome: 'ok' | 'stale' | 'forbidden'; nudge?: Nudge } {
    const n = one('select * from nudges where id = ?', id);
    if (!n) return { outcome: 'stale' };
    if (n.to_user !== userId) return { outcome: 'forbidden' };
    const open = one(`select 1 as x from cards c where c.id = ? and ${OPEN_CARD}`, n.card_id);
    if (n.reply !== null || !open) return { outcome: 'stale' };

    const nowMs = now().getTime();
    if (action === 'ack') {
      run("update nudges set reply = 'ack', reply_at = ? where id = ?", new Date(nowMs).toISOString(), id);
    } else {
      if (n.later_count >= NUDGE_LATER_MAX) return { outcome: 'stale' };
      const wanted = nowMs + NUDGE_LATER_MS;
      const recipient = one('select * from users where id = ?', userId)!;
      const deliverMs = quietEnd(wanted, timeZone(), quietOf(recipient)) ?? wanted;
      const log = [...(JSON.parse(n.later_log) as string[]), new Date(nowMs).toISOString()];
      run(
        'update nudges set later_count = later_count + 1, deliver_at = ?, later_log = ? where id = ?',
        new Date(deliverMs).toISOString(),
        JSON.stringify(log),
        id,
      );
    }
    return { outcome: 'ok', nudge: getNudge(id) };
  }

  /**
   * Schließt alle offenen Stupse einer Karte. announce = die Karte wurde erledigt: Wer selbst erledigt hat, hat
   * „erledigt" geantwortet, die übrigen sind geschlossen, und die Absender bekommen eine Rückmeldung.
   */
  function closeOpenNudges(cardId: string, byId: string | null, announce: boolean): void {
    const rows = all(
      `select n.*, c.title as card_title from nudges n join cards c on c.id = n.card_id
       where n.card_id = ? and n.reply is null order by n.created_at, n.rowid`,
      cardId,
    );
    for (const r of rows) {
      const reply = announce && byId !== null && r.to_user === byId ? 'done' : 'closed';
      run('update nudges set reply = ?, reply_at = ? where id = ?', reply, iso(), r.id);
      if (announce) {
        c.pendingClosed.push({ nudgeId: r.id, cardId, cardTitle: r.card_title, fromId: r.from_user, toId: r.to_user, byId });
      }
    }
  }

  const closeNudgesOfUser = (userId: string) =>
    run("update nudges set reply = 'closed', reply_at = ? where reply is null and (from_user = ? or to_user = ?)", iso(), userId, userId);

  /** Alle, die zu dieser Karte je einen Stups bekommen haben (für das Abräumen der Nachrichten) */
  const nudgeRecipients = (cardId: string): string[] =>
    all('select distinct to_user from nudges where card_id = ?', cardId).map((r) => r.to_user as string);

  function openNudgeCounts(opts: { publicOnly?: boolean } = {}): { total: number; byUser: Record<string, number> } {
    const rows = all(
      `select n.to_user, count(*) as n from nudges n join cards c on c.id = n.card_id
       where n.reply is null and ${OPEN_CARD}${opts.publicOnly ? PUBLIC_BOARD : ''} group by n.to_user`,
    );
    const byUser: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byUser[r.to_user] = r.n;
      total += r.n;
    }
    return { total, byUser };
  }

  /** Offene Stupse mit Karte und Absender (für die Attribute der Sensoren) */
  function openNudgeList(opts: { publicOnly?: boolean } = {}): { toId: string; card: string; from: string; since: string }[] {
    return all(
      `select n.to_user, n.created_at, c.title as card_title, f.display_name as from_name
       from nudges n join cards c on c.id = n.card_id join users f on f.id = n.from_user
       where n.reply is null and ${OPEN_CARD}${opts.publicOnly ? PUBLIC_BOARD : ''} order by n.created_at, n.rowid`,
    ).map((r) => ({ toId: r.to_user, card: r.card_title, from: r.from_name, since: r.created_at }));
  }

  function recentNudges(limit: number, viewer: Viewer): RecentNudge[] {
    const nowIso = now().toISOString();
    const seen = visibleBoardsSql(viewer);
    return all(
      `select n.*, c.title as card_title, f.display_name as from_name, t.display_name as to_name
       from nudges n join cards c on c.id = n.card_id
       join users f on f.id = n.from_user join users t on t.id = n.to_user
       where c.board_id in (${seen.sql})
       order by n.created_at desc, n.rowid desc limit ?`,
      ...seen.args,
      limit,
    ).map((r) => ({
      title: r.card_title,
      from: r.from_name,
      to: r.to_name,
      at: r.created_at,
      deliverAt: r.deliver_at,
      state:
        r.reply === 'closed' ? 'geschlossen' : r.reply !== null ? 'beantwortet' : r.deliver_at > nowIso ? 'wartet' : 'offen',
    }));
  }

  function setNudgeQuiet(userId: string, patch: { start?: unknown; end?: unknown; off?: unknown }): User {
    userRow(userId);
    if (patch.start !== undefined) {
      if (!isHm(patch.start)) throw new ValidationError(t('Der Beginn der Ruhezeit braucht die Form HH:MM'));
      run('update users set nudge_quiet_start = ? where id = ?', patch.start, userId);
    }
    if (patch.end !== undefined) {
      if (!isHm(patch.end)) throw new ValidationError(t('Das Ende der Ruhezeit braucht die Form HH:MM'));
      run('update users set nudge_quiet_end = ? where id = ?', patch.end, userId);
    }
    if (patch.off !== undefined) {
      if (typeof patch.off !== 'boolean') throw new ValidationError(t('„Ruhezeit aus" muss wahr oder falsch sein'));
      run('update users set nudge_quiet_off = ? where id = ?', patch.off ? 1 : 0, userId);
    }
    return toUser(userRow(userId));
  }

  /** Verlauf einer Karte aus den Stupsen: der Stups selbst, „Später" und „Mach ich" */
  function nudgeActivity(cardId: string): ActivityEntry[] {
    const out: ActivityEntry[] = [];
    for (const r of all(
      `select n.*, f.display_name as from_name, t.display_name as to_name
       from nudges n join users f on f.id = n.from_user join users t on t.id = n.to_user
       where n.card_id = ? order by n.created_at, n.rowid`,
      cardId,
    )) {
      out.push({ id: `nudge-${r.id}`, kind: 'nudged', at: r.created_at, byName: r.from_name, to: r.to_name, text: r.text });
      (JSON.parse(r.later_log) as string[]).forEach((at, i) =>
        out.push({ id: `nudge-${r.id}-later-${i}`, kind: 'nudge_reply', at, byName: r.to_name, text: 'Später' }),
      );
      if (r.reply === 'ack') out.push({ id: `nudge-${r.id}-ack`, kind: 'nudge_reply', at: r.reply_at, byName: r.to_name, text: 'Mach ich' });
    }
    return out;
  }

  return {
    toNudge,
    getNudge,
    nudgeCooldownEnd,
    hasDevice,
    deliverAtFor,
    createNudges,
    nudgeTargets,
    dueNudges,
    claimNudge,
    releaseNudge,
    replyNudge,
    closeOpenNudges,
    closeNudgesOfUser,
    nudgeRecipients,
    openNudgeCounts,
    openNudgeList,
    recentNudges,
    setNudgeQuiet,
    nudgeActivity,
  };
}
