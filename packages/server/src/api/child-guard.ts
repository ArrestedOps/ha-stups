import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ForbiddenError, NotFoundError } from '../errors.js';
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

/**
 * Wie eine Route prüft, ob die Anfrage zur eigenen Karte gehört. Dazu das eigene Board: ein Board „nur ich", das das Kind selbst angelegt
 * hat (`board`, `column`, `category`; `boardcard` für Karten darin; `create` für das Anlegen, das nur „nur ich" erlaubt). In einem solchen
 * Board darf das Kind frei arbeiten, in allen anderen nur an den ihm zugewiesenen Karten.
 */
type Own = 'none' | 'card' | 'checklist' | 'completion' | 'create' | 'board' | 'column' | 'category' | 'boardcard';

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
  // Eigene Boards („nur ich"): anlegen, einrichten und darin Karten pflegen
  'POST /api/boards': 'create',
  'PATCH /api/boards/:id': 'board',
  'DELETE /api/boards/:id': 'board',
  'GET /api/boards/:id/archive': 'board',
  'POST /api/boards/:id/cards': 'board',
  'POST /api/boards/:id/columns': 'board',
  'POST /api/boards/:id/categories': 'board',
  'PATCH /api/columns/:id': 'column',
  'POST /api/columns/:id/move': 'column',
  'DELETE /api/columns/:id': 'column',
  'PATCH /api/categories/:id': 'category',
  'DELETE /api/categories/:id': 'category',
  'PATCH /api/cards/:id': 'boardcard',
  'DELETE /api/cards/:id': 'boardcard',
  'POST /api/cards/:id/move': 'boardcard',
  'POST /api/cards/:id/duplicate': 'boardcard',
  'POST /api/cards/:id/archive': 'boardcard',
  'POST /api/cards/:id/restore-archived': 'boardcard',
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
  // Mitteilungen: der Store filtert auf Einträge zu eigenen Karten (store/inbox.ts)
  'GET /api/inbox': 'none',
  'PUT /api/me/inbox-seen': 'none',
  'GET /api/me': 'none',
  'GET /api/people': 'none',
  'GET /api/people/:id/avatar': 'none',
  'GET /api/schedule': 'none',
  'GET /api/settings': 'none',
  'GET /api/today': 'none',
};

export function registerChildGuard(app: FastifyInstance, store: Store): void {
  const deny = () => new ForbiddenError(t('Das darf ein Kind nicht'));

  /** Ein Board „nur ich", das dieses Kind angelegt hat (unbekannt: ja, die Route antwortet selbst mit „nicht gefunden") */
  function ownsBoard(req: FastifyRequest, boardId: string | null): boolean {
    if (!boardId) return true;
    try {
      const board = store.getBoard(boardId);
      return board.visibility === 'private' && board.ownerId === req.user!.id;
    } catch {
      return true;
    }
  }

  function isOwn(req: FastifyRequest, own: Own): boolean {
    if (own === 'none') return true;
    const id = (req.params as { id?: string }).id ?? '';
    if (own === 'create') return (req.body as { visibility?: unknown } | null)?.visibility === 'private';
    if (own === 'board') return ownsBoard(req, id);
    if (own === 'column') return ownsBoard(req, store.boardIdOfColumn(id));
    if (own === 'category') return ownsBoard(req, store.boardIdOfCategory(id));
    const cardId = own === 'card' || own === 'boardcard' ? id : own === 'checklist' ? store.cardIdOfChecklistItem(id) : store.cardIdOfCompletion(id);
    if (!cardId) return true; // gibt es nicht: die Route antwortet selbst mit „nicht gefunden"
    // Karten im eigenen Board gehören dem Kind ganz; sonst nur, was ihm zugewiesen ist (und nur für Erledigen, Checkliste, Kommentare …)
    if (ownsBoard(req, store.boardIdOfCardAny(cardId)) && store.boardIdOfCardAny(cardId)) return true;
    if (own === 'boardcard') return false;
    try {
      return store.getCard(cardId).assigneeIds.includes(req.user!.id);
    } catch {
      return true;
    }
  }

  /** Boards, die dieses Kind sehen darf; null = alle (Kind mit „alle Boards", Mitglied, Administrator). Die eigenen Boards „nur ich" kommen immer dazu. */
  function visibleBoards(req: FastifyRequest): Set<string> | null {
    if (!req.access?.isChild || !req.user || req.user.childScope !== 'assigned') return null;
    const own = store.listBoards(req.user.id).filter((b) => b.visibility === 'private' && b.ownerId === req.user!.id).map((b) => b.id);
    return new Set([...store.boardIdsWithCardsOf(req.user.id), ...own]);
  }

  /** Die Karte (oder der Anhang) liegt in einem Board, das das Kind nicht sieht: für das Kind gibt es sie nicht */
  function hidden(req: FastifyRequest, cardId: string | null, what: string): void {
    const visible = visibleBoards(req);
    if (!visible || !cardId) return;
    const board = store.boardIdOfCard(cardId);
    if (board && !visible.has(board)) throw new NotFoundError(what);
  }

  // Läuft nach dem Haken, der den Benutzer und seine Rolle bestimmt (req.access)
  app.addHook('preHandler', async (req) => {
    if (!req.access?.isChild || !req.user) return;
    const route = `${req.method} ${req.routeOptions.url ?? ''}`;
    const own = ALLOWED[route];
    if (own === undefined || !isOwn(req, own)) throw deny();

    // Sichtbarkeit: einzelne Boards, Karten und Anhänge, die das Kind nicht sehen darf
    const id = (req.params as { id?: string }).id ?? '';
    if (route === 'GET /api/boards/:id') {
      const visible = visibleBoards(req);
      if (visible && !visible.has(id)) throw new NotFoundError(t('Board nicht gefunden'));
    } else if (route.startsWith('GET /api/cards/:id')) {
      hidden(req, id, t('Karte nicht gefunden'));
    } else if (route.startsWith('GET /api/attachments/:id')) {
      // Gibt es den Anhang nicht, wirft das schon hier „nicht gefunden" (derselbe 404 wie in der Route)
      hidden(req, store.getAttachment(id).cardId, t('Anhang nicht gefunden'));
    }
  });

  // Listen: die Einträge fremder Boards fallen weg, auch wenn das Kind sie ausdrücklich verlangt
  app.addHook('preSerialization', async (req, _reply, payload) => {
    const visible = visibleBoards(req);
    if (!visible || !Array.isArray(payload)) return payload;
    const route = `${req.method} ${req.routeOptions.url ?? ''}`;
    if (route === 'GET /api/boards') return payload.filter((b: { id: string }) => visible.has(b.id));
    if (route === 'GET /api/schedule' || route === 'GET /api/cards') return payload.filter((c: { boardId: string }) => visible.has(c.boardId));
    return payload;
  });
}
