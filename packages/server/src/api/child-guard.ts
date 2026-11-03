import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ForbiddenError } from '../errors.js';
import { t } from '../i18n/index.js';
import type { Store } from '../store.js';

/**
 * Rolle „Kind": Ein Filter für alle Anfragen eines Kindes mit **Erlaubnisliste**: Was nicht ausdrücklich dasteht, ist verboten,
 * auch jede künftige Route. Gleiches gilt im Server, nicht nur in der Oberfläche. Der Test `child-guard.test.ts` geht alle Routen durch.
 *
 * Erlaubt ist, was ein Kind für seine eigenen (zugewiesenen) Karten braucht: ansehen, erledigen (und zurücknehmen), Checkliste
 * abhaken, kommentieren, Fotos und Links anhängen; dazu Sprache und Farbe der eigenen Oberfläche. Welche Boards und Karten es
 * sehen darf, entscheidet die Abfrage (siehe store/visibility.ts), hier geht es um die Routen.
 */

/** Wie eine Route prüft, ob die Anfrage zur eigenen Karte gehört */
type Own = 'none' | 'card' | 'checklist' | 'completion';

const ALLOWED: Record<string, Own> = {
  // Schreiben: nur an eigenen Karten
  'POST /api/cards/:id/complete': 'card',
  'POST /api/cards/:id/checklist': 'card',
  'POST /api/cards/:id/comments': 'card',
  'POST /api/cards/:id/attachments': 'card',
  'POST /api/cards/:id/links': 'card',
  'PATCH /api/checklist/:id': 'checklist',
  'POST /api/completions/:id/undo': 'completion',
  // Sprache und Farbe der eigenen Oberfläche
  'PUT /api/me/language': 'none',
  'PUT /api/me/accent': 'none',
  // Lesen (gefiltert in den Abfragen)
  'GET /api/attachments/:id': 'none',
  'GET /api/attachments/:id/thumb': 'none',
  'GET /api/boards': 'none',
  'GET /api/boards/:id': 'none',
  'GET /api/capabilities': 'none',
  'GET /api/cards': 'none',
  'GET /api/cards/:id': 'none',
  'GET /api/cards/:id/comments': 'none',
  'GET /api/cards/:id/completions': 'none',
  'GET /api/events': 'none',
  'GET /api/me': 'none',
  'GET /api/people': 'none',
  'GET /api/schedule': 'none',
  'GET /api/settings': 'none',
};

export function registerChildGuard(app: FastifyInstance, store: Store): void {
  const deny = () => new ForbiddenError(t('Das darf ein Kind nicht'));

  function isOwn(req: FastifyRequest, own: Own): boolean {
    if (own === 'none') return true;
    const id = (req.params as { id?: string }).id ?? '';
    const cardId = own === 'card' ? id : own === 'checklist' ? store.cardIdOfChecklistItem(id) : store.cardIdOfCompletion(id);
    if (!cardId) return true; // gibt es nicht: die Route antwortet selbst mit „nicht gefunden"
    try {
      return store.getCard(cardId).assigneeIds.includes(req.user!.id);
    } catch {
      return true;
    }
  }

  // Läuft nach dem Haken, der den Benutzer und seine Rolle bestimmt (req.access)
  app.addHook('preHandler', async (req) => {
    if (!req.access?.isChild || !req.user) return;
    const route = `${req.method} ${req.routeOptions.url ?? ''}`;
    const own = ALLOWED[route];
    if (own === undefined || !isOwn(req, own)) throw deny();
  });
}
