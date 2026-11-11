import { createCards } from './watchers/cards.js';
import { createContext } from './watchers/context.js';
import { createEvaluate } from './watchers/evaluate.js';
import { createExternal } from './watchers/external.js';
import type { Parts } from './watchers/parts.js';
import { createSubscriptions } from './watchers/subscriptions.js';
import { createSuggest } from './watchers/suggest.js';
import { createTick } from './watchers/tick.js';
import type { Seen, WatcherDeps } from './watchers/types.js';
import { createViews } from './watchers/views.js';
import { createWaiting } from './watchers/waiting.js';
import type { WatchTrigger } from './watcher-types.js';

export type { MetNow, WatcherDeps, WatcherHa } from './watchers/types.js';

/**
 * Die Wächter: beobachten Entitäten in Home Assistant und legen Karten an. Die Arbeit liegt in watchers/ (wie beim Store in store/):
 * `context` hält den Stand im Speicher und die Warteschlange, die übrigen Teile bekommen ihn und rufen einander über `Parts` auf.
 */
export function createWatchers(deps: WatcherDeps) {
  const ctx = createContext(deps);
  const calls = (): Parts => parts;
  const parts: Parts = {
    ...createCards(ctx, calls),
    ...createEvaluate(ctx, calls),
    ...createExternal(ctx, calls),
    ...createSubscriptions(ctx, calls),
    ...createSuggest(ctx),
    ...createTick(ctx, calls),
    ...createViews(ctx, calls),
    ...createWaiting(ctx, calls),
  };
  const { guarded, idle, counterOf } = ctx;
  const { start, presentPersonIds, order, onSaved, syncSubscriptions, snapshot, tick, test, fireNow, resetCounter, view, homeState, pass, claim, activity, arrival, evaluate } = parts;
  return {
    start,
    presentPersonIds,
    order,
    onSaved,
    syncSubscriptions,
    snapshot,
    tick,
    test,
    fireNow,
    resetCounter,
    view,
    homeState,
    pass,
    claim,
    activity,
    idle,
    arrival,
    counterOf,
    evaluate: (id: string, s: Seen | null) => guarded('Auswerten', () => evaluate(deps.data.get(id), s)),
  };
}

export type Watchers = ReturnType<typeof createWatchers>;
export type { WatchTrigger };
