import type { FastifyInstance } from 'fastify';
import { ValidationError } from '../errors.js';
import { currentLanguage, t } from '../i18n/index.js';
import { type ApiKit, type Params } from './kit.js';

/** Boards, Spalten und Kategorien */
export function registerBoardRoutes(app: FastifyInstance, k: ApiKit): void {
  const { store, body, noContent } = k;

  // ----- boards -----
  app.get('/api/boards', async () => store.listBoards());
  app.post('/api/boards', async (req, reply) => {
    const b = body(req);
    if (b.template !== undefined && b.template !== null) {
      if (typeof b.template !== 'string') throw new ValidationError(t('Die Vorlage ist ungültig'));
      const board = store.createBoardFromTemplate({ name: b.name, template: b.template, lang: currentLanguage(), by: req.user?.id ?? null });
      return reply.code(201).send(board);
    }
    // Neue Boards bekommen die Spalte „Geplant", außer es wird ausdrücklich abgelehnt
    return reply
      .code(201)
      .send(store.createBoard({ name: b.name, icon: b.icon, color: b.color, withPlanned: b.withPlanned !== false }));
  });
  app.get<{ Params: Params }>('/api/boards/:id', async (req) => store.getBoardView(req.params.id));
  app.patch<{ Params: Params }>('/api/boards/:id', async (req) => {
    const b = body(req);
    return store.updateBoard(req.params.id, {
      name: b.name,
      icon: b.icon,
      color: b.color,
      archiveAfterDays: b.archiveAfterDays,
    });
  });
  app.delete<{ Params: Params }>('/api/boards/:id', async (req, reply) => {
    store.deleteBoard(req.params.id);
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
