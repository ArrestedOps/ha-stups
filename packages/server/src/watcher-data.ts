import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { NotFoundError } from './errors.js';
import type { AssignRule, CardTemplate, DoneTrigger, WatchTrigger, WatcherConfig, WatcherStatus } from './watcher-types.js';

export interface Watcher extends WatcherConfig {
  id: string;
  position: number;
  status: WatcherStatus;
  lastFiredAt: string | null;
  lastAssignees: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WatcherState {
  /** darf wieder auslösen (die Bedingung war seit dem letzten Auslösen einmal nicht erfüllt) */
  armed: boolean;
  /** seit wann die Bedingung ununterbrochen erfüllt ist */
  metSince: string | null;
  counter: number;
  counterSince: string | null;
  /** zuletzt gewählte Person (Reihenfolge der Rotation) */
  lastPerson: string | null;
  lastFireAt: string | null;
}

export type RunResult = 'created' | 'retriggered' | 'counted' | 'cooldown' | 'waiting' | 'assigned' | 'auto_done' | 'test' | 'error';

export interface WatcherRun {
  id: string;
  watcherId: string;
  at: string;
  result: RunResult;
  cardId: string | null;
  assignedTo: string[];
  note: string | null;
}

/** Karte, die auf die erste Person wartet, die heimkommt */
export interface Waiting {
  cardId: string;
  watcherId: string;
  since: string;
  /** Zeitpunkt der ersten Zuweisung; danach können noch 2 Minuten lang weitere Personen dazukommen */
  firstAssignedAt: string | null;
}

const KEEP_RUNS = 50;

type Row = Record<string, any>;

export function createWatcherData(db: DatabaseSync, now: () => Date = () => new Date()) {
  const iso = () => now().toISOString();
  const one = (sql: string, ...p: unknown[]) => db.prepare(sql).get(...(p as never[])) as Row | undefined;
  const all = (sql: string, ...p: unknown[]) => db.prepare(sql).all(...(p as never[])) as Row[];
  const run = (sql: string, ...p: unknown[]) => db.prepare(sql).run(...(p as never[]));

  const toWatcher = (r: Row): Watcher => ({
    id: r.id,
    name: r.name,
    active: r.active === 1,
    position: r.position,
    trigger: JSON.parse(r.trigger_json) as WatchTrigger,
    card: JSON.parse(r.card_json) as CardTemplate,
    assign: JSON.parse(r.assign_json) as AssignRule,
    done: r.done_json ? (JSON.parse(r.done_json) as DoneTrigger) : null,
    cooldownMin: r.cooldown_min,
    dedupe: r.dedupe === 1,
    nudgeAfterMin: r.nudge_after_min,
    status: r.status,
    lastFiredAt: r.last_fired_at,
    lastAssignees: JSON.parse(r.last_assignees) as string[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  const list = (): Watcher[] => all('select * from watchers order by position, created_at, rowid').map(toWatcher);

  function get(id: string): Watcher {
    const r = one('select * from watchers where id = ?', id);
    if (!r) throw new NotFoundError('Wächter nicht gefunden');
    return toWatcher(r);
  }

  const columns = (c: WatcherConfig) => [
    c.name,
    c.active ? 1 : 0,
    JSON.stringify(c.trigger),
    JSON.stringify(c.card),
    JSON.stringify(c.assign),
    c.done ? JSON.stringify(c.done) : null,
    c.cooldownMin,
    c.dedupe ? 1 : 0,
    c.nudgeAfterMin,
  ];

  function create(c: WatcherConfig): Watcher {
    const id = randomUUID();
    const t = iso();
    const position = ((one('select max(position) as m from watchers')?.m as number | null) ?? -1) + 1;
    run(
      `insert into watchers (id, name, active, trigger_json, card_json, assign_json, done_json, cooldown_min, dedupe, nudge_after_min,
                             position, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      ...columns(c),
      position,
      t,
      t,
    );
    run('insert into watcher_state (watcher_id) values (?)', id);
    return get(id);
  }

  function update(id: string, c: WatcherConfig): Watcher {
    get(id);
    run(
      `update watchers set name = ?, active = ?, trigger_json = ?, card_json = ?, assign_json = ?, done_json = ?, cooldown_min = ?,
                           dedupe = ?, nudge_after_min = ?, updated_at = ?, status = 'ok' where id = ?`,
      ...columns(c),
      iso(),
      id,
    );
    return get(id);
  }

  function remove(id: string): void {
    get(id);
    run('delete from watchers where id = ?', id);
  }

  const setStatus = (id: string, status: WatcherStatus) => run('update watchers set status = ? where id = ?', status, id);
  const setActive = (id: string, active: boolean) => run('update watchers set active = ?, updated_at = ? where id = ?', active ? 1 : 0, iso(), id);

  function markFired(id: string, assignees: string[]): void {
    run('update watchers set last_fired_at = ?, last_assignees = ? where id = ?', iso(), JSON.stringify(assignees), id);
  }

  // ---------- Zustand ----------

  const toState = (r: Row): WatcherState => ({
    armed: r.armed === 1,
    metSince: r.met_since,
    counter: r.counter,
    counterSince: r.counter_since,
    lastPerson: r.last_person,
    lastFireAt: r.last_fire_at,
  });

  function getState(id: string): WatcherState {
    let r = one('select * from watcher_state where watcher_id = ?', id);
    if (!r) {
      run('insert into watcher_state (watcher_id) values (?)', id);
      r = one('select * from watcher_state where watcher_id = ?', id)!;
    }
    return toState(r);
  }

  function patchState(id: string, patch: Partial<WatcherState>): void {
    getState(id);
    const sets: string[] = [];
    const params: unknown[] = [];
    const map: Record<keyof WatcherState, string> = {
      armed: 'armed',
      metSince: 'met_since',
      counter: 'counter',
      counterSince: 'counter_since',
      lastPerson: 'last_person',
      lastFireAt: 'last_fire_at',
    };
    for (const [k, v] of Object.entries(patch) as [keyof WatcherState, unknown][]) {
      sets.push(`${map[k]} = ?`);
      params.push(k === 'armed' ? (v ? 1 : 0) : v);
    }
    if (sets.length > 0) run(`update watcher_state set ${sets.join(', ')} where watcher_id = ?`, ...params, id);
  }

  // ---------- Läufe ----------

  function addRun(r: { watcherId: string; result: RunResult; cardId?: string | null; assignedTo?: string[]; note?: string | null }): void {
    run(
      'insert into watcher_runs (id, watcher_id, at, result, card_id, assigned_to, note) values (?, ?, ?, ?, ?, ?, ?)',
      randomUUID(),
      r.watcherId,
      iso(),
      r.result,
      r.cardId ?? null,
      JSON.stringify(r.assignedTo ?? []),
      r.note ?? null,
    );
    run(
      `delete from watcher_runs where watcher_id = ? and rowid not in
         (select rowid from watcher_runs where watcher_id = ? order by at desc, rowid desc limit ${KEEP_RUNS})`,
      r.watcherId,
      r.watcherId,
    );
  }

  const toRun = (r: Row): WatcherRun => ({
    id: r.id,
    watcherId: r.watcher_id,
    at: r.at,
    result: r.result,
    cardId: r.card_id,
    assignedTo: JSON.parse(r.assigned_to) as string[],
    note: r.note,
  });

  const runs = (watcherId: string, limit = KEEP_RUNS): WatcherRun[] =>
    all('select * from watcher_runs where watcher_id = ? order by at desc, rowid desc limit ?', watcherId, limit).map(toRun);

  /** Läufe zu einer Karte, älteste zuerst (Verlauf der Karte) */
  const runsOfCard = (cardId: string): WatcherRun[] =>
    all('select * from watcher_runs where card_id = ? order by at, rowid', cardId).map(toRun);

  // ---------- Warteliste ----------

  const toWaiting = (r: Row): Waiting => ({ cardId: r.card_id, watcherId: r.watcher_id, since: r.since, firstAssignedAt: r.first_assigned_at });
  const addWaiting = (cardId: string, watcherId: string) =>
    run('insert or replace into watcher_waiting (card_id, watcher_id, since) values (?, ?, ?)', cardId, watcherId, iso());
  const listWaiting = (): Waiting[] => all('select * from watcher_waiting order by since, rowid').map(toWaiting);
  const markFirstAssigned = (cardId: string) => run('update watcher_waiting set first_assigned_at = ? where card_id = ?', iso(), cardId);
  const removeWaiting = (cardId: string) => run('delete from watcher_waiting where card_id = ?', cardId);

  return {
    list,
    get,
    create,
    update,
    remove,
    setStatus,
    setActive,
    markFired,
    getState,
    patchState,
    addRun,
    runs,
    runsOfCard,
    addWaiting,
    listWaiting,
    markFirstAssigned,
    removeWaiting,
  };
}

export type WatcherData = ReturnType<typeof createWatcherData>;
