import type { DatabaseSync } from 'node:sqlite';
import type { ClosedNudge, Row, StoreOptions } from './types.js';

/**
 * Was alle Teile des Stores gemeinsam brauchen: Datenbank, Uhr, Zeitzone, Abfragen und die Transaktion.
 * Die Teile (people, boards, cards, …) bekommen diesen Kontext und rufen einander über `Internals` auf (siehe internals.ts).
 */
export function createContext(db: DatabaseSync, opts: StoreOptions = {}) {
  const now = opts.now ?? (() => new Date());
  const timeZone = opts.timeZone ?? (() => 'Europe/Berlin');
  const iso = () => now().toISOString();

  const one = (sql: string, ...p: unknown[]) => db.prepare(sql).get(...(p as never[])) as Row | undefined;
  const all = (sql: string, ...p: unknown[]) => db.prepare(sql).all(...(p as never[])) as Row[];
  // ----- Änderungen mitschreiben (für den Live-Sync mit Änderungen, siehe Changes) -----
  let full = false;
  let partWrites = false;
  const cards = new Set<string>();
  function track(sql: string, params: unknown[]): void {
    const m = WRITE.exec(sql);
    if (!m) return;
    const table = m[1]!.toLowerCase();
    if (table === 'cards') {
      // Karten werden immer einzeln über ihre Kennung geschrieben: neu (Kennung zuerst) oder „where id = ?" (Kennung zuletzt).
      // Alles andere (mehrere Karten auf einmal) sagt „alles neu laden", statt Karten zu verpassen.
      const id = /^\s*insert/i.test(sql) ? params[0] : BY_ID.test(sql) ? params[params.length - 1] : undefined;
      if (typeof id === 'string') cards.add(id);
      else full = true;
    } else if (CARD_PARTS.has(table)) partWrites = true;
    else if (!QUIET_TABLES.has(table)) full = true;
  }
  /**
   * Was sich seit dem letzten Abholen geändert hat: einzelne Karten, oder „alles" (Boards, Spalten, Kategorien, Personen, Stupse …).
   * Schreibt eine Anfrage nur an Teilen einer Karte (Checkliste, Kommentar …) ohne die Karte selbst zu berühren, gilt das auch als „alles".
   */
  function takeChanges(): Changes {
    const out = { full: full || (partWrites && cards.size === 0), cards: [...cards] };
    full = false;
    partWrites = false;
    cards.clear();
    return out;
  }

  /** Für Schreibzugriffe, die nicht über `run` laufen (zum Beispiel die Wächter-Daten): alles neu laden */
  const markAllChanged = () => {
    full = true;
  };

  const run = (sql: string, ...p: unknown[]) => {
    track(sql, p);
    return db.prepare(sql).run(...(p as never[]));
  };

  let depth = 0;
  /** Geschlossene Stupse, die erst nach dem erfolgreichen Abschluss der Transaktion gemeldet werden */
  const pendingClosed: ClosedNudge[] = [];
  function tx<T>(fn: () => T): T {
    if (depth > 0) return fn();
    db.exec('begin');
    depth++;
    // Was bis hierher gemeldet werden soll, bleibt; was die Transaktion schreibt, nur wenn sie durchgeht
    const before = { full, partWrites, cards: new Set(cards) };
    try {
      const result = fn();
      db.exec('commit');
      const announce = pendingClosed.splice(0);
      try {
        if (announce.length > 0) opts.onNudgesClosed?.(announce);
      } catch {
        /* eine fehlgeschlagene Rückmeldung darf das Erledigen nicht zurückrollen */
      }
      return result;
    } catch (err) {
      db.exec('rollback');
      pendingClosed.length = 0;
      // Zurückgerollte Schreibzugriffe haben nichts geändert: sie dürfen nicht an der nächsten Meldung hängen bleiben
      full = before.full;
      partWrites = before.partWrites;
      cards.clear();
      for (const id of before.cards) cards.add(id);
      throw err;
    } finally {
      depth--;
    }
  }

  return { db, opts, now, timeZone, iso, one, all, run, tx, pendingClosed, takeChanges, markAllChanged };
}

/** Was sich geändert hat: einzelne Karten (ihre Kennungen) oder „alles" (dann lädt der Client die Ansicht neu) */
export interface Changes {
  full: boolean;
  cards: string[];
}

const WRITE = /^\s*(?:insert\s+(?:or\s+\w+\s+)?into|update|delete\s+from)\s+(\w+)/i;
const BY_ID = /where\s+id\s*=\s*\?\s*$/i;
/** Teile einer Karte: ihre Zahlen und Zähler stehen auf der Karte selbst */
const CARD_PARTS = new Set(['card_categories', 'card_assignees', 'checklist_items', 'links', 'comments', 'attachments', 'completions', 'card_events']);
/** Ändert sich laufend, ohne dass sich eine Ansicht ändert */
const QUIET_TABLES = new Set(['sent_notifications', 'sessions', 'passkeys', 'local_accounts', 'house_pending', 'feedback']);

export type Ctx = ReturnType<typeof createContext>;

/**
 * Funktionen aus einem anderen Teil des Stores: Der Aufruf schlägt erst beim Gebrauch nach, denn beim Aufbau eines Teils
 * sind die anderen noch nicht da. So bleiben die Rümpfe der Funktionen unverändert, auch wenn sie in verschiedenen Dateien stehen.
 */
export function lazy<S extends object, K extends keyof S>(s: S, keys: readonly K[]): Pick<S, K> {
  const out = {} as Record<K, unknown>;
  for (const k of keys) out[k] = (...args: unknown[]) => (s[k] as (...a: unknown[]) => unknown)(...args);
  return out as Pick<S, K>;
}
