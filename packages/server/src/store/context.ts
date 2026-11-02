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
  const run = (sql: string, ...p: unknown[]) => db.prepare(sql).run(...(p as never[]));

  let depth = 0;
  /** Geschlossene Stupse, die erst nach dem erfolgreichen Abschluss der Transaktion gemeldet werden */
  const pendingClosed: ClosedNudge[] = [];
  function tx<T>(fn: () => T): T {
    if (depth > 0) return fn();
    db.exec('begin');
    depth++;
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
      throw err;
    } finally {
      depth--;
    }
  }

  return { db, opts, now, timeZone, iso, one, all, run, tx, pendingClosed };
}

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
