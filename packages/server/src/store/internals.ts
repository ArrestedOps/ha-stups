// Alle Funktionen der Teile des Stores zusammen. Die Teile rufen einander darüber auf (siehe context.ts, lazy).
import type { createPeople } from './people.js';
import type { createBoards } from './boards.js';
import type { createCards } from './cards.js';
import type { createCardExtras } from './card-extras.js';
import type { createCompletion } from './completion.js';
import type { createNotifications } from './notifications.js';
import type { createNudgesPart } from './nudges.js';
import type { createWatcherCards } from './watchers.js';
import type { createTrash } from './trash.js';
import type { createHouse } from './house.js';

export type Internals = ReturnType<typeof createPeople> &
  ReturnType<typeof createBoards> &
  ReturnType<typeof createCards> &
  ReturnType<typeof createCardExtras> &
  ReturnType<typeof createCompletion> &
  ReturnType<typeof createNotifications> &
  ReturnType<typeof createNudgesPart> &
  ReturnType<typeof createWatcherCards> &
  ReturnType<typeof createTrash> &
  ReturnType<typeof createHouse>;
