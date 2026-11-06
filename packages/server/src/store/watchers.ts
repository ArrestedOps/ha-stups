import { type Card, type ActivityEntry } from './types.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import { PUBLIC_BOARD } from './constants.js';

/** Karten der Wächter */
export function createWatcherCards(c: Ctx, late: unknown) {
  // Erst hier auf den vollen Typ gebracht: stünde Internals schon im Kopf, hinge sein Typ von sich selbst ab
  const s = late as Internals;
  const { one, all, run } = c;
  // Funktionen aus anderen Themen: erst beim Aufruf nachgeschlagen (alle Teile sind bei der Verwendung zusammengesetzt)
  const { getCard, visibleCardRow } = lazy(s, ['getCard', 'visibleCardRow'] as const);

  /** Was ein Wächter mit der Karte gemacht hat (Läufe), ohne das Anlegen selbst (das steht schon im Eintrag „Angelegt") */
  function watcherActivity(cardId: string): ActivityEntry[] {
    const out: ActivityEntry[] = [];
    for (const r of all(`select * from watcher_runs where card_id = ? and result not in ('created', 'test') order by at, rowid`, cardId)) {
      const names = (JSON.parse(r.assigned_to) as string[])
        .map((id) => one('select display_name from users where id = ?', id)?.display_name)
        .filter(Boolean)
        .join(', ');
      const note = r.note ? ` · ${r.note}` : '';
      const text =
        r.result === 'retriggered'
          ? `Erneut ausgelöst${note}`
          : r.result === 'waiting'
            ? 'Wartet auf die erste Person, die heimkommt'
            : r.result === 'assigned'
              ? `Zugewiesen: ${names}${note}`
              : r.result === 'passed'
                ? `Weitergegeben an ${names}${note}`
                : r.result === 'suggested'
                  ? 'Vorgeschlagen: alle, die zu Hause sind, wurden gefragt'
                  : r.result === 'claimed'
                    ? `Übernommen von ${names}`
                    : r.result === 'suggest_fallback'
                      ? `Niemand hat sich gemeldet, zugewiesen: ${names || 'niemand'}`
              : r.result === 'auto_done'
                ? 'Automatisch erledigt, weil die Bedingung eingetreten ist'
                : r.result === 'nudged'
                  ? `Erinnerung gesendet, weil die Karte noch offen war${note}`
                  : null;
      if (text) out.push({ id: r.id, kind: 'watcher', at: r.at, byName: null, text });
    }
    return out;
  }

  /** Markiert eine Karte als vom Wächter angelegt (für die Doppelkarten-Regel und den Verlauf) */
  function setCardOrigin(id: string, origin: { watcherId?: string | null; dedupeKey?: string | null }): void {
    visibleCardRow(id);
    run('update cards set watcher_id = ?, dedupe_key = ? where id = ?', origin.watcherId ?? null, origin.dedupeKey ?? null, id);
  }

  /** Offene Karte (nicht erledigt, nicht gelöscht, nicht archiviert) eines Wächters */
  function openCardOfWatcher(watcherId: string): Card | undefined {
    const r = one(
      'select id from cards where watcher_id = ? and completed_at is null and deleted_at is null and archived_at is null order by created_at desc, rowid desc',
      watcherId,
    );
    return r ? getCard(r.id) : undefined;
  }

  /** Wurde eine Karte dieses Wächters seit diesem Zeitpunkt erledigt? (setzt den Zähler zurück) */
  function watcherCardCompletedSince(watcherId: string, sinceIso: string): boolean {
    return !!one('select 1 as ok from cards where watcher_id = ? and completed_at is not null and completed_at >= ?', watcherId, sinceIso);
  }

  /** Wie viele offene Karten ein Wächter angelegt hat (Sensor) */
  function openWatcherCardCount(opts: { publicOnly?: boolean } = {}): number {
    return (
      one(
        `select count(*) as n from cards c where c.watcher_id is not null and c.completed_at is null and c.deleted_at is null and c.archived_at is null${opts.publicOnly ? PUBLIC_BOARD : ''}`,
      )?.n ?? 0
    );
  }

  /** Gibt es zu diesem Schlüssel schon eine Karte, auch eine erledigte oder gelöschte (Papierkorb)? Ein Termin im Kalender bekommt nur eine Karte. */
  function hasCardWithDedupeKey(key: string): boolean {
    return !!one('select 1 as ok from cards where dedupe_key = ?', key);
  }

  /** Offene Karte mit diesem Schlüssel (für Automationen über das Ereignis stups_create_card) */
  function openCardByDedupeKey(key: string): Card | undefined {
    const r = one(
      'select id from cards where dedupe_key = ? and completed_at is null and deleted_at is null and archived_at is null order by created_at desc, rowid desc',
      key,
    );
    return r ? getCard(r.id) : undefined;
  }

  return {
    watcherActivity,
    setCardOrigin,
    openCardOfWatcher,
    watcherCardCompletedSince,
    openWatcherCardCount,
    openCardByDedupeKey,
    hasCardWithDedupeKey,
  };
}
