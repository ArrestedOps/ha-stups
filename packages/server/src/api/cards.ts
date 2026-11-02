import { t } from '../i18n/index.js';
import type { FastifyInstance } from 'fastify';
import { ValidationError } from '../errors.js';
import { type ApiKit, type Params } from './kit.js';

const MAX_IDS = 50;

/** Karten, Termine über alle Boards, Erledigen und Archiv */
export function registerCardRoutes(app: FastifyInstance, k: ApiKit): void {
  const { deps, store, body, noContent } = k;

  // ----- cards -----
  app.post<{ Params: Params }>('/api/boards/:id/cards', async (req, reply) => {
    const b = body(req);
    const card = store.createCard(
      req.params.id,
      {
        columnId: b.columnId,
        title: b.title,
        description: b.description,
        priority: b.priority,
        dueAt: b.dueAt,
        recurrence: b.recurrence,
        remindBeforeMin: b.remindBeforeMin,
        overdueNag: b.overdueNag,
        costCents: b.costCents,
        carryOver: b.carryOver,
        assigneeIds: b.assigneeIds,
        categoryIds: b.categoryIds,
      },
      req.user?.id ?? null,
    );
    return reply.code(201).send(card);
  });
  // Mehrere Karten in einem Aufruf (für den Live-Sync: nur holen, was sich geändert hat). Unbekannte und gelöschte fehlen.
  app.get<{ Querystring: { ids?: string } }>('/api/cards', async (req) => {
    const ids = [...new Set((req.query.ids ?? '').split(',').filter((x) => x !== ''))];
    if (ids.length > MAX_IDS) throw new ValidationError(t('Höchstens {max} Karten auf einmal', { max: MAX_IDS }));
    return store.getCards(ids);
  });
  app.get<{ Params: Params }>('/api/cards/:id', async (req) => store.getCard(req.params.id));
  app.patch<{ Params: Params }>('/api/cards/:id', async (req) => {
    const b = body(req);
    const patch: Record<string, unknown> = {};
    for (const key of [
      'title',
      'description',
      'priority',
      'dueAt',
      'recurrence',
      'remindBeforeMin',
      'overdueNag',
      'costCents',
      'carryOver',
      'assigneeIds',
      'categoryIds',
    ]) {
      if (key in b) patch[key] = b[key];
    }
    return store.updateCard(req.params.id, patch, req.user?.id ?? null);
  });
  app.delete<{ Params: Params }>('/api/cards/:id', async (req, reply) => {
    store.deleteCard(req.params.id);
    return noContent(reply);
  });
  app.post<{ Params: Params }>('/api/cards/:id/move', async (req) => {
    const b = body(req);
    const before = store.getCard(req.params.id);
    const after = store.moveCard(req.params.id, { columnId: b.columnId, afterId: b.afterId }, req.user?.id ?? null);
    // Durch das Ablegen in "Erledigt" kann eine Karte erledigt worden sein: offene Pushes aufräumen.
    if (after.completedAt !== before.completedAt || after.dueAt !== before.dueAt) {
      void deps.notifier?.clearFor(after.id);
    }
    return after;
  });
  // ----- Termine über alle Boards (Agenda, Kalender) -----
  app.get<{ Querystring: { from?: string; to?: string; boards?: string; done?: string } }>('/api/schedule', async (req) => {
    const q = req.query;
    const time = (v: string | undefined, what: string): string | undefined => {
      if (v === undefined || v === '') return undefined;
      if (!/^\d{4}-\d{2}-\d{2}T/.test(v) || Number.isNaN(Date.parse(v))) throw new ValidationError(t('„{what}" braucht Datum und Uhrzeit', { what }));
      return new Date(v).toISOString();
    };
    const boardIds = q.boards ? q.boards.split(',').filter(Boolean) : undefined;
    return store
      .listSchedule({ from: time(q.from, 'from'), to: time(q.to, 'to'), boardIds, includeDone: q.done === '1' })
      .slice(0, 2000);
  });
  app.post<{ Params: Params }>('/api/cards/:id/complete', async (req) => {
    const res = store.completeCard(req.params.id, { by: req.user?.id ?? null, source: 'app' });
    if (res.completionId) void deps.notifier?.clearFor(res.card.id);
    return res;
  });
  app.post<{ Params: Params }>('/api/completions/:id/undo', async (req) => store.undoCompletion(req.params.id));
  app.get<{ Params: Params }>('/api/cards/:id/completions', async (req) => store.listCompletions(req.params.id));
  app.post<{ Params: Params }>('/api/cards/:id/restore-archived', async (req) =>
    store.restoreArchived(req.params.id, body(req).columnId, req.user?.id ?? null),
  );
  app.post<{ Params: Params }>('/api/cards/:id/duplicate', async (req, reply) =>
    reply.code(201).send(store.duplicateCard(req.params.id, req.user?.id ?? null)),
  );
  app.post<{ Params: Params }>('/api/cards/:id/archive', async (req, reply) => {
    store.setArchived(req.params.id, body(req).archived !== false);
    return noContent(reply);
  });
}
