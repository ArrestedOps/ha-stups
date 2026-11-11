// Alle Funktionen der Teile der Wächter zusammen. Die Teile rufen einander darüber auf (siehe context.ts und ../watchers.ts, lazy).
import type { createCards } from './cards.js';
import type { createEvaluate } from './evaluate.js';
import type { createExternal } from './external.js';
import type { createSubscriptions } from './subscriptions.js';
import type { createSuggest } from './suggest.js';
import type { createTick } from './tick.js';
import type { createViews } from './views.js';
import type { createWaiting } from './waiting.js';

export type Parts = ReturnType<typeof createCards> &
  ReturnType<typeof createEvaluate> &
  ReturnType<typeof createExternal> &
  ReturnType<typeof createSubscriptions> &
  ReturnType<typeof createSuggest> &
  ReturnType<typeof createTick> &
  ReturnType<typeof createViews> &
  ReturnType<typeof createWaiting>;
