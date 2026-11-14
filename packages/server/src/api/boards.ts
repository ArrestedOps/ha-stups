import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ForbiddenError, ValidationError } from '../errors.js';
import { currentLanguage, t } from '../i18n/index.js';
import type { Board, BoardEffects } from '../store.js';
import { type ApiKit, type Params } from './kit.js';

/** Boards, Spalten und Kategorien */
export function registerBoardRoutes(app: FastifyInstance, k: ApiKit): void {
  const { deps, store, body, noContent, requireAdmin } = k;

  /** Darf diese Anfrage Sichtbarkeit, Fairness und Mitglieder des Boards ändern? Der Besitzer; bei Boards ohne (aktiven) Besitzer ein Administrator. */
  function mayChangeAccess(req: FastifyRequest, board: Board): boolean {
    const me = req.user?.id;
    if (!me) return false;
    if (board.ownerId === me) return true;
    const ownerActive = board.ownerId !== null && store.people().some((p) => p.id === board.ownerId);
    return !ownerActive && req.access?.isAdmin === true;
  }

  /**
   * Darf diese Anfrage das Board verwalten (löschen, archivieren)? Der Besitzer und Administratoren; ein Board ohne Besitzer (Bestand) darf
   * jeder Erwachsene verwalten wie bisher. Sonst 403 mit dem Namen des Besitzers.
   */
  function requireManage(req: FastifyRequest, board: Board, verb: 'delete' | 'archive'): void {
    const me = req.user?.id;
    if (req.access?.isAdmin === true || (me && board.ownerId === me) || (board.ownerId === null && req.access?.isChild !== true)) return;
    const owner = board.ownerId ? store.people().find((p) => p.id === board.ownerId) : undefined;
    if (verb === 'delete') {
      throw new ForbiddenError(owner ? t('Nur {owner} oder ein Administrator darf löschen.', { owner: owner.displayName }) : t('Nur ein Administrator darf löschen.'));
    }
    throw new ForbiddenError(owner ? t('Nur {owner} oder ein Administrator darf archivieren.', { owner: owner.displayName }) : t('Nur ein Administrator darf archivieren.'));
  }

  /** Nach einer Aktion am Board: die Abos der Wächter abgleichen (pausierte, umgezogene und gelöschte Wächter) */
  function syncWatchers(): void {
    deps.watchers?.syncSubscriptions();
  }

  /**
   * Wer von den Personen eine Mitteilung bekommt, wenn ein Wächter neue Zuständige braucht: die Person, die geändert hat, der Besitzer des
   * Boards, alle mit dem Recht „Wächter" und alle Administratoren; ohne Doppelte, ohne Kinder (Wächter sehen Erwachsene, auch wenn das
   * Board nicht ihres ist: die Mitteilung nennt nur Wächter, Board und die entfernte Person).
   */
  async function noticeRecipients(boardId: string, by: string | null): Promise<string[]> {
    const ids = new Set<string>();
    const board = store.getBoard(boardId);
    for (const p of store.people()) {
      if (p.isChild) continue;
      let admin = !deps.directory; // ohne Verzeichnis (Entwicklung) gelten Personen als Administratoren
      if (deps.directory) admin = p.haUserId ? (await deps.directory.isAdmin(p.haUserId)) === true : false;
      if (p.id === by || p.id === board.ownerId || admin || store.permissionsOf(p.id).includes('watchers')) ids.add(p.id);
    }
    return [...ids];
  }

  /** Mitteilungen für die Glocke zu den Wächtern, die eine Änderung der Personen eines Boards getroffen hat */
  async function announce(board: Board, effects: BoardEffects, by: string | null): Promise<void> {
    if (effects.watchers.length === 0) return;
    const names = new Map(store.people().map((p) => [p.id, p.displayName]));
    const nameOf = (id: string) => names.get(id) ?? '?';
    const recipients = await noticeRecipients(board.id, by);
    for (const w of effects.watchers) {
      const removed = effects.removedIds.filter((id) => w.before.includes(id));
      if (removed.length === 0) continue;
      store.addWatcherNotice({
        watcherId: w.watcherId,
        kind: w.missing ? 'assignees_missing' : 'shrunk',
        byUser: by,
        recipients,
        detail: { boardId: board.id, boardName: board.name, removedNames: removed.map(nameOf), remainingNames: w.after.map(nameOf) },
      });
    }
  }

  // ----- boards -----
  app.get('/api/boards', async (req) => store.listBoards(req.user?.id ?? null));
  app.post('/api/boards', async (req, reply) => {
    const b = body(req);
    // Ein Kind darf nur Boards „nur für mich" anlegen
    if (req.access?.isChild && b.visibility !== 'private') throw new ForbiddenError(t('Das darf ein Kind nicht'));
    if (b.template !== undefined && b.template !== null) {
      if (typeof b.template !== 'string') throw new ValidationError(t('Die Vorlage ist ungültig'));
      const board = store.createBoardFromTemplate({
        name: b.name,
        template: b.template,
        lang: currentLanguage(),
        by: req.user?.id ?? null,
        visibility: b.visibility,
        countsForFairness: b.countsForFairness,
        memberIds: b.memberIds,
      });
      return reply.code(201).send(board);
    }
    // Neue Boards bekommen die Spalte „Geplant", außer es wird ausdrücklich abgelehnt
    return reply.code(201).send(
      store.createBoard({
        name: b.name,
        icon: b.icon,
        color: b.color,
        withPlanned: b.withPlanned !== false,
        visibility: b.visibility,
        ownerId: req.user?.id ?? null,
        countsForFairness: b.countsForFairness,
        memberIds: b.memberIds,
      }),
    );
  });
  app.get<{ Params: Params }>('/api/boards/:id', async (req) => store.getBoardView(req.params.id));
  app.patch<{ Params: Params }>('/api/boards/:id', async (req) => {
    const b = body(req);
    const touchesAccess = b.visibility !== undefined || b.countsForFairness !== undefined || b.memberIds !== undefined;
    if (touchesAccess) {
      if (!mayChangeAccess(req, store.getBoard(req.params.id))) throw new ForbiddenError(t('Das darf nur der Besitzer des Boards'));
      if (req.access?.isChild && b.visibility !== undefined && b.visibility !== 'private') throw new ForbiddenError(t('Das darf ein Kind nicht'));
    }
    const by = req.user?.id ?? null;
    const { board, effects } = store.updateBoardWithEffects(
      req.params.id,
      { name: b.name, icon: b.icon, color: b.color, archiveAfterDays: b.archiveAfterDays, visibility: b.visibility, countsForFairness: b.countsForFairness, memberIds: b.memberIds },
      by,
    );
    if (effects) await announce(board, effects, by);
    return board;
  });
  /**
   * Was eine Änderung der Sichtbarkeit oder der Mitglieder bewirken würde, ohne sie auszuführen (für den Bestätigungsdialog): wer das
   * Board nicht mehr sieht, welche Wächter das trifft (Zuständige jetzt und danach), wie viele Aufgaben Zuständige verlieren und welche
   * Wächter verhindern, dass das Board privat wird. Query: `visibility`, `members` (Kennungen, getrennt durch Komma).
   */
  app.get<{ Params: Params; Querystring: { visibility?: string; members?: string } }>('/api/boards/:id/access-preview', async (req) => {
    if (!mayChangeAccess(req, store.getBoard(req.params.id))) throw new ForbiddenError(t('Das darf nur der Besitzer des Boards'));
    const q = req.query;
    const plan = store.previewBoardAccess(
      req.params.id,
      { visibility: typeof q.visibility === 'string' ? q.visibility : undefined, memberIds: typeof q.members === 'string' ? q.members.split(',').filter(Boolean) : undefined },
      req.user?.id ?? null,
    );
    const { rules: _rules, ...summary } = plan;
    return summary;
  });
  /**
   * Was das Löschen trifft (für den Bestätigungsdialog): Aufgaben, wiederkehrende Aufgaben, Wächter, persönliche Erinnerungen; dazu, ob
   * die Person es verwalten darf (`mayManage`, sonst mit Besitzer) und ob es das letzte sichtbare Board ist (`lock`).
   */
  app.get<{ Params: Params }>('/api/boards/:id/delete-preview', async (req) => {
    const board = store.getBoard(req.params.id);
    let mayManage = true;
    let ownerName: string | null = null;
    try {
      requireManage(req, board, 'delete');
    } catch {
      mayManage = false;
      ownerName = store.people().find((p) => p.id === board.ownerId)?.displayName ?? null;
    }
    return { ...store.deletePreview(req.params.id, req.user?.id ?? null), mayManage, ownerName };
  });
  // Löschen mit der Wahl je Wächter: { watchers: { [id]: { action: 'pause' } | { action: 'move', boardId } | { action: 'delete' } } }; ohne Angabe pausieren sie
  app.post<{ Params: Params }>('/api/boards/:id/delete', async (req) => {
    requireManage(req, store.getBoard(req.params.id), 'delete');
    const effects = store.deleteBoardWith(req.params.id, body(req).watchers, req.user?.id ?? null);
    syncWatchers();
    return effects;
  });
  app.delete<{ Params: Params }>('/api/boards/:id', async (req, reply) => {
    requireManage(req, store.getBoard(req.params.id), 'delete');
    store.deleteBoardWith(req.params.id, undefined, req.user?.id ?? null);
    syncWatchers();
    return noContent(reply);
  });
  // Archivieren: das Board verschwindet aus Auswahl und Listen, bleibt unverändert gespeichert; seine Wächter pausieren
  app.post<{ Params: Params }>('/api/boards/:id/archive-board', async (req) => {
    requireManage(req, store.getBoard(req.params.id), 'archive');
    const effects = store.archiveBoard(req.params.id, req.user?.id ?? null);
    syncWatchers();
    return effects;
  });
  app.post<{ Params: Params }>('/api/boards/:id/unarchive', async (req) => {
    const result = store.unarchiveBoard(req.params.id);
    syncWatchers();
    // Die Wächter laufen wieder: Startzustand prüfen und abonnieren
    for (const id of result.resumed) await deps.watchers?.onSaved(id);
    return result;
  });
  app.get('/api/boards/archived', async (req) => store.listArchivedBoards(req.user?.id ?? null));
  // Reihenfolge der Boards (gilt für alle): { ids: [...] } mit genau den Boards, die die Person sieht
  app.post('/api/boards/order', async (req, reply) => {
    store.reorderBoards(body(req).ids, req.user?.id ?? null);
    return noContent(reply);
  });
  // Kopie: { name?, structure?, openCards?, keepVisibility? }; Besitzer ist, wer kopiert
  app.post<{ Params: Params }>('/api/boards/:id/duplicate', async (req, reply) => {
    const b = body(req);
    return reply.code(201).send(store.duplicateBoard(req.params.id, { name: b.name, structure: b.structure, openCards: b.openCards, keepVisibility: b.keepVisibility }, req.user?.id ?? null));
  });
  // Boards ohne Besitzer (die Person ist entfernt): niemand sieht sie; ein Administrator sieht nur Name und Zahl der Aufgaben und darf sie löschen
  app.get('/api/admin/orphan-boards', async (req) => {
    requireAdmin(req);
    return store.orphanBoards();
  });
  app.delete<{ Params: Params }>('/api/admin/orphan-boards/:id', async (req, reply) => {
    requireAdmin(req);
    store.deleteOrphanBoard(req.params.id);
    return noContent(reply);
  });
  app.get<{ Params: Params }>('/api/boards/:id/archive', async (req) => store.listArchived(req.params.id));
  // ----- columns -----
  app.post<{ Params: Params }>('/api/boards/:id/columns', async (req, reply) => {
    const b = body(req);
    return reply.code(201).send(store.addColumn(req.params.id, { name: b.name, isDone: b.isDone, isPlanned: b.isPlanned }));
  });
  app.patch<{ Params: Params }>('/api/columns/:id', async (req) => {
    const b = body(req);
    return store.updateColumn(req.params.id, { name: b.name, isDone: b.isDone, isPlanned: b.isPlanned });
  });
  app.post<{ Params: Params }>('/api/columns/:id/move', async (req) => {
    const b = body(req);
    return store.moveColumn(req.params.id, b.afterId ?? null);
  });
  app.delete<{ Params: Params; Querystring: { moveTo?: string } }>('/api/columns/:id', async (req, reply) => {
    store.deleteColumn(req.params.id, req.query.moveTo);
    return noContent(reply);
  });
  // ----- categories -----
  app.post<{ Params: Params }>('/api/boards/:id/categories', async (req, reply) => {
    const b = body(req);
    return reply.code(201).send(store.addCategory(req.params.id, { name: b.name, color: b.color }));
  });
  app.patch<{ Params: Params }>('/api/categories/:id', async (req) => {
    const b = body(req);
    return store.updateCategory(req.params.id, { name: b.name, color: b.color });
  });
  app.delete<{ Params: Params }>('/api/categories/:id', async (req, reply) => {
    store.deleteCategory(req.params.id);
    return noContent(reply);
  });
}
