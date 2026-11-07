import type { FastifyInstance, FastifyRequest } from 'fastify';
import { NotFoundError } from '../errors.js';
import { t } from '../i18n/index.js';
import type { Store } from '../store.js';
import type { Changes } from '../store/context.js';

/**
 * Sichtbarkeit von Boards an der Tür: Jede Anfrage, die ein Board, eine Spalte, eine Kategorie, eine Karte oder etwas an einer Karte
 * (Checkliste, Link, Kommentar, Anhang, Erledigung, Papierkorb-Eintrag) trifft, wird abgewiesen, wenn die Person das Board nicht sehen
 * darf: **404 statt 403**, damit nicht einmal die Existenz verrät, was dahinter liegt. Auch Administratoren sehen fremde private oder
 * ausgewählte Boards nicht. Wer ein Board sieht, entscheidet allein `store.canSeeBoard` (store/visibility.ts).
 *
 * Listen (Boards, Termine, Karten, Heute, Mitteilungen, Papierkorb, Statistik) filtert die Abfrage im Store; hier geht es um die Routen mit
 * einer Kennung. Der Test `board-visibility.test.ts` geht alle Routen mit Kennung durch.
 */

/** Wohin eine Route zeigt: das Board dahinter (null: gibt es nicht, die Route antwortet selbst mit „nicht gefunden") und der Text für den 404 */
interface Target {
  board: string | null;
  what: string;
  /** Die Route betrifft ein archiviertes Board (Wiederherstellen): es zählt nur die Sichtbarkeit, nicht das Archiv */
  archived?: boolean;
}

export function boardOfRoute(store: Store, req: FastifyRequest): Target | null {
  const url = req.routeOptions.url ?? '';
  const params = req.params as { id?: string; type?: string };
  const id = params.id ?? '';
  const card = (cardId: string | null): Target => ({ board: cardId ? store.boardIdOfCardAny(cardId) : null, what: t('Karte nicht gefunden') });

  if (/^\/api\/boards\/:id(\/|$)/.test(url)) return { board: id, what: t('Board nicht gefunden'), archived: url === '/api/boards/:id/unarchive' };
  if (/^\/api\/columns\/:id(\/|$)/.test(url)) return { board: store.boardIdOfColumn(id), what: t('Spalte nicht gefunden') };
  if (/^\/api\/categories\/:id(\/|$)/.test(url)) return { board: store.boardIdOfCategory(id), what: t('Kategorie nicht gefunden') };
  if (/^\/api\/cards\/:id(\/|$)/.test(url)) return card(id);
  if (/^\/api\/checklist\/:id(\/|$)/.test(url)) return card(store.cardIdOfChecklistItem(id));
  if (/^\/api\/links\/:id(\/|$)/.test(url)) return card(store.cardIdOfLink(id));
  if (/^\/api\/comments\/:id(\/|$)/.test(url)) return card(store.cardIdOfComment(id));
  if (/^\/api\/completions\/:id(\/|$)/.test(url)) return card(store.cardIdOfCompletion(id));
  if (/^\/api\/attachments\/:id(\/|$)/.test(url)) {
    // Anhänge gibt es nur an Karten; ohne Anhang antwortet die Route selbst mit 404
    const cardId = ((): string | null => {
      try {
        return store.getAttachment(id).cardId;
      } catch {
        return null;
      }
    })();
    return { board: cardId ? store.boardIdOfCardAny(cardId) : null, what: t('Anhang nicht gefunden') };
  }
  if (/^\/api\/trash\/:type\/:id(\/|$)/.test(url)) return { board: store.boardIdOfTrash(params.type ?? '', id), what: t('Nicht im Papierkorb') };
  return null;
}

/** Nur die Karten aus einer Meldung des Live-Sync, die diese Person sehen darf (bei „alles" bleibt es: die Ansichten laden gefiltert nach) */
export function visibleChanges(store: Store, changes: Changes | undefined, viewer: string | null): Changes | undefined {
  if (!changes || changes.full) return changes;
  return { full: false, cards: changes.cards.filter((id) => store.canSeeCard(viewer, id)) };
}

export function registerBoardGuard(app: FastifyInstance, store: Store): void {
  app.addHook('preHandler', async (req) => {
    if (!req.principal) return;
    const target = boardOfRoute(store, req);
    if (!target || target.board === null) return;
    const allowed = target.archived ? store.canAccessBoard(req.user?.id ?? null, target.board) : store.canSeeBoard(req.user?.id ?? null, target.board);
    if (!allowed) throw new NotFoundError(target.what);
  });
}
