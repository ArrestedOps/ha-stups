import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { NotFoundError } from './errors.js';
import type { AssignRule, CardTemplate, DoneTrigger, WatchTrigger, WatcherConfig, WatcherNudge, WatcherStatus } from './watcher-types.js';
import { t } from './i18n/index.js';
import { categoryKey, mergeCategory } from './watcher-categories.js';

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

export type RunResult =
  | 'created'
  | 'retriggered'
  | 'counted'
  | 'cooldown'
  | 'waiting'
  | 'assigned'
  | 'auto_done'
  | 'nudged'
  | 'test'
  | 'error'
  /** die Person hat die Karte weitergegeben */
  | 'passed'
  /** „Erst vorschlagen": die Karte entstand ohne Zuständige, alle Anwesenden wurden gefragt */
  | 'suggested'
  /** jemand hat die vorgeschlagene Karte übernommen */
  | 'claimed'
  /** niemand hat sich in 30 Minuten gemeldet: der Rückfall des Wächters greift */
  | 'suggest_fallback'
  /** Der Wächter braucht neue Zuständige (Status `assignees_missing`): es wurde keine Karte angelegt */
  | 'no_assignees';

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

/** Eine vorgeschlagene Karte, die auf ein „Übernehmen" wartet */
export interface Suggestion {
  cardId: string;
  watcherId: string;
  since: string;
}

const KEEP_RUNS = 50;

type Row = Record<string, any>;

/** `onWrite` meldet jeden Schreibzugriff (der Store schreibt mit, was sich für den Live-Sync geändert hat: bei Wächtern „alles") */
export function createWatcherData(db: DatabaseSync, now: () => Date = () => new Date(), onWrite: () => void = () => undefined) {
  const iso = () => now().toISOString();
  const one = (sql: string, ...p: unknown[]) => db.prepare(sql).get(...(p as never[])) as Row | undefined;
  const all = (sql: string, ...p: unknown[]) => db.prepare(sql).all(...(p as never[])) as Row[];
  const run = (sql: string, ...p: unknown[]) => {
    onWrite();
    return db.prepare(sql).run(...(p as never[]));
  };

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
    nudge: r.nudge_json ? (JSON.parse(r.nudge_json) as WatcherNudge) : null,
    category: r.category ?? null,
    countsForFairness: r.counts_for_fairness !== 0,
    // „keine Zuständigen" ist ein eigener Merker (Spalte assignees_missing); ein fehlendes Ziel oder eine fehlende Entität geht vor
    status: r.status !== 'ok' ? r.status : r.assignees_missing === 1 ? 'assignees_missing' : 'ok',
    lastFiredAt: r.last_fired_at,
    lastAssignees: JSON.parse(r.last_assignees) as string[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  const list = (): Watcher[] => all('select * from watchers order by position, created_at, rowid').map(toWatcher);

  function get(id: string): Watcher {
    const r = one('select * from watchers where id = ?', id);
    if (!r) throw new NotFoundError(t('Wächter nicht gefunden'));
    return toWatcher(r);
  }

  /** Die vorhandenen Kategorien, ohne Doppelte (gleiche Namen ohne Beachtung der Schreibweise), in der Reihenfolge der Wächter; ohne die von `exceptId` */
  function categories(exceptId?: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of all('select id, category from watchers where category is not null order by position, created_at, rowid')) {
      if (r.id === exceptId) continue;
      const k = categoryKey(r.category);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(r.category);
      }
    }
    return out;
  }

  const columns = (c: WatcherConfig, exceptId?: string) => [
    c.name,
    c.active ? 1 : 0,
    JSON.stringify(c.trigger),
    JSON.stringify(c.card),
    JSON.stringify(c.assign),
    c.done ? JSON.stringify(c.done) : null,
    c.cooldownMin,
    c.dedupe ? 1 : 0,
    c.nudge ? JSON.stringify(c.nudge) : null,
    mergeCategory(c.category, categories(exceptId)),
    c.countsForFairness ? 1 : 0,
  ];

  function create(c: WatcherConfig): Watcher {
    const id = randomUUID();
    const t = iso();
    const position = ((one('select max(position) as m from watchers')?.m as number | null) ?? -1) + 1;
    run(
      `insert into watchers (id, name, active, trigger_json, card_json, assign_json, done_json, cooldown_min, dedupe, nudge_json,
                             category, counts_for_fairness, position, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      ...columns(c),
      position,
      t,
      t,
    );
    run('insert into watcher_state (watcher_id) values (?)', id);
    return get(id);
  }

  /**
   * `clearMissing`: gültige Zuständige sind gespeichert, der Status „braucht neue Zuständige" (assignees_missing) fällt weg. Bleibt er
   * `false` (zum Beispiel beim Umbenennen eines Wächters ohne Zuständige), bleibt der Merker stehen.
   */
  function update(id: string, c: WatcherConfig, clearMissing = true): Watcher {
    get(id);
    run(
      `update watchers set name = ?, active = ?, trigger_json = ?, card_json = ?, assign_json = ?, done_json = ?, cooldown_min = ?,
                           dedupe = ?, nudge_json = ?, category = ?, counts_for_fairness = ?, updated_at = ?, status = 'ok'${
                             clearMissing ? ', assignees_missing = 0' : ''
                           } where id = ?`,
      ...columns(c, id),
      iso(),
      id,
    );
    return get(id);
  }

  function remove(id: string): void {
    get(id);
    run('delete from watchers where id = ?', id);
  }

  /** „keine Zuständigen" ist ein eigener Merker und lässt `status` (Entität oder Ziel fehlt) in Ruhe; alles andere setzt `status` */
  const setStatus = (id: string, status: WatcherStatus) =>
    status === 'assignees_missing'
      ? run('update watchers set assignees_missing = 1 where id = ?', id)
      : run('update watchers set status = ? where id = ?', status === 'ok' ? 'ok' : status, id);
  const setActive = (id: string, active: boolean) => run('update watchers set active = ?, updated_at = ? where id = ?', active ? 1 : 0, iso(), id);

  /** Nur die Kategorie ändern (Liste, „Kategorien vorschlagen"): kein erneutes Anmelden, kein Zurücksetzen des Status */
  function setCategory(id: string, category: string | null): void {
    get(id);
    run('update watchers set category = ?, updated_at = ? where id = ?', mergeCategory(category, categories(id)), iso(), id);
  }

  /** Nur Name und Titel der Kartenvorlage (Aufräumen alter Gerätenamen): kein erneutes Anmelden, nichts sonst; null lässt den Text, wie er ist */
  function setNames(id: string, to: { name: string | null; cardTitle: string | null }): void {
    const w = get(id);
    if (to.name !== null) run('update watchers set name = ? where id = ?', to.name, id);
    if (to.cardTitle !== null) run('update watchers set card_json = ? where id = ?', JSON.stringify({ ...w.card, title: to.cardTitle }), id);
  }

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

  /** Die letzten Läufe aller Wächter mit deren Namen, neueste zuerst (ohne reines Zählen und Sperrzeit) */
  const recentRuns = (limit = 20): (WatcherRun & { watcherName: string })[] =>
    all(
      `select r.*, w.name as watcher_name from watcher_runs r join watchers w on w.id = r.watcher_id
       where r.result not in ('counted', 'cooldown') order by r.at desc, r.rowid desc limit ?`,
      limit,
    ).map((r) => ({ ...toRun(r), watcherName: r.watcher_name }));

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

  // ---------- Vorschläge ("Erst vorschlagen") ----------

  const toSuggest = (r: Row): Suggestion => ({ cardId: r.card_id, watcherId: r.watcher_id, since: r.since });
  const addSuggest = (cardId: string, watcherId: string) =>
    run('insert or replace into watcher_suggest (card_id, watcher_id, since) values (?, ?, ?)', cardId, watcherId, iso());
  const getSuggest = (cardId: string): Suggestion | null => {
    const r = one('select * from watcher_suggest where card_id = ?', cardId);
    return r ? toSuggest(r) : null;
  };
  const listSuggest = (): Suggestion[] => all('select * from watcher_suggest order by since, rowid').map(toSuggest);
  const removeSuggest = (cardId: string) => run('delete from watcher_suggest where card_id = ?', cardId);

  // ---------- Ausgeblendete Treffer von „Gefunden" ----------

  const hide = (templateId: string, entityId: string) =>
    run('insert or ignore into watcher_hidden (template_id, entity_id, at) values (?, ?, ?)', templateId, entityId, iso());
  const unhide = (templateId: string, entityId: string) => run('delete from watcher_hidden where template_id = ? and entity_id = ?', templateId, entityId);
  const hidden = (): { templateId: string; entityId: string }[] =>
    all('select template_id, entity_id from watcher_hidden order by at, rowid').map((r) => ({ templateId: r.template_id, entityId: r.entity_id }));

  return {
    list,
    get,
    create,
    update,
    remove,
    setStatus,
    setActive,
    setCategory,
    setNames,
    categories,
    markFired,
    getState,
    patchState,
    addRun,
    runs,
    runsOfCard,
    recentRuns,
    addWaiting,
    listWaiting,
    markFirstAssigned,
    removeWaiting,
    addSuggest,
    getSuggest,
    listSuggest,
    removeSuggest,
    hide,
    unhide,
    hidden,
  };
}

export type WatcherData = ReturnType<typeof createWatcherData>;
