import { t } from '../i18n/index.js';
import type { FastifyInstance } from 'fastify';
import { ConflictError, ForbiddenError, ValidationError } from '../errors.js';
import { hasPermission, requirePermission } from '../permissions.js';
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
        effort: b.effort,
        icon: b.icon,
        iconColor: b.iconColor,
        iconSource: b.iconSource,
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
    return store.getCards(ids, req.user?.id ?? null);
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
      'effort',
      'icon',
      'iconColor',
      'iconSource',
      'confirm',
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
  app.get<{ Querystring: { from?: string; to?: string; boards?: string; done?: string; undated?: string } }>('/api/schedule', async (req) => {
    const q = req.query;
    const time = (v: string | undefined, what: string): string | undefined => {
      if (v === undefined || v === '') return undefined;
      if (!/^\d{4}-\d{2}-\d{2}T/.test(v) || Number.isNaN(Date.parse(v))) throw new ValidationError(t('„{what}" braucht Datum und Uhrzeit', { what }));
      return new Date(v).toISOString();
    };
    const boardIds = q.boards ? q.boards.split(',').filter(Boolean) : undefined;
    return store
      .listSchedule({ viewer: req.user?.id ?? null, from: time(q.from, 'from'), to: time(q.to, 'to'), boardIds, includeDone: q.done === '1', undated: q.undated === '1' })
      .slice(0, 2000);
  });
  app.post<{ Params: Params }>('/api/cards/:id/complete', async (req) => {
    const by = req.user?.id ?? null;
    // Ein Kind, dessen „Erledigt" bestätigt werden muss, löst nur eine Anfrage aus: die Karte bleibt offen und zählt noch nicht.
    // Ausgenommen die Karten im eigenen Board „nur ich": dort sieht niemand sonst, was zu bestätigen wäre.
    const boardId = store.boardIdOfCardAny(req.params.id);
    const inPrivateBoard = boardId !== null && store.getBoard(boardId).visibility === 'private';
    if (by && req.access?.isChild && !inPrivateBoard && store.needsConfirmation(req.params.id, by)) {
      const asked = store.requestConfirmation(req.params.id, by);
      if (asked.created) void deps.notifier?.confirmationRequested?.(asked.card.id);
      return { card: asked.card, completionId: null, nextDueAt: null, nextCardId: null, awaitingConfirmation: true };
    }
    const res = store.completeCard(req.params.id, { by, source: 'app' });
    if (res.completionId) void deps.notifier?.clearFor(res.card.id);
    return res;
  });
  // Weitergeben: eine Karte vom Haus an die nächste Person der Rotation (nicht für Kinder: die Erlaubnisliste verweigert es)
  app.post<{ Params: Params }>('/api/cards/:id/pass', async (req) => {
    if (!deps.watchers) throw new ConflictError(t('Wächter brauchen die Verbindung zu Home Assistant'));
    return deps.watchers.pass(req.params.id, req.user!.id);
  });
  // Übernehmen: bei „Erst vorschlagen" bekommt die erste Person die Karte (nicht für Kinder: die Erlaubnisliste verweigert es)
  app.post<{ Params: Params }>('/api/cards/:id/claim', async (req) => {
    if (!deps.watchers) throw new ConflictError(t('Wächter brauchen die Verbindung zu Home Assistant'));
    await deps.watchers.claim(req.params.id, req.user!.id);
    return store.getCard(req.params.id);
  });
  // Bestätigen und „Nochmal": die gewählten Personen des Kindes und Administratoren
  for (const answer of ['confirm', 'reject'] as const) {
    app.post<{ Params: Params }>(`/api/cards/:id/${answer}`, async (req) => {
      const card = store.getCard(req.params.id);
      if (card.confirmRequestedAt === null) throw new ConflictError(t('Es wartet nichts auf Bestätigung'));
      if (!req.user || !store.mayConfirm(req.user.id, card.confirmRequestedBy, hasPermission(req.access, 'confirm'))) {
        throw new ForbiddenError(t('Das dürfen nur die Bestätiger dieses Kindes'));
      }
      const res = store.answerConfirmation(card.id, answer, 'app');
      void deps.notifier?.confirmationAnswered?.({ cardId: card.id, childId: res.childId, byId: req.user.id, outcome: answer === 'confirm' ? 'confirmed' : 'rejected' });
      return res.result ?? res.card;
    });
  }
  app.post<{ Params: Params }>('/api/completions/:id/undo', async (req) => store.undoCompletion(req.params.id));
  app.get<{ Params: Params }>('/api/cards/:id/completions', async (req) => store.listCompletions(req.params.id));
  app.post<{ Params: Params }>('/api/cards/:id/restore-archived', async (req) =>
    store.restoreArchived(req.params.id, body(req).columnId, req.user?.id ?? null),
  );
  // Symbole aus Titeln erkennen (Einstellungen, Administratoren und Recht „settings“, von der Person selbst ausgelöst). Erkannt wird in der
  // Oberfläche (die Bibliothek und die Suchwörter liegen dort): Der Server liefert die Karten ohne Symbol und nimmt das Ergebnis an.
  app.get('/api/icons/candidates', async (req) => {
    requirePermission(req, 'settings');
    return store.cardsWithoutIcon();
  });
  app.post('/api/icons/apply', async (req) => {
    requirePermission(req, 'settings');
    const result = store.applyDetectedIcons(body(req).items);
    if (result.updated > 50) store.markAllChanged(); // viele Karten auf einmal: die Geräte laden alles neu
    return result;
  });
  app.post<{ Params: Params }>('/api/cards/:id/duplicate', async (req, reply) =>
    reply.code(201).send(store.duplicateCard(req.params.id, req.user?.id ?? null)),
  );
  app.post<{ Params: Params }>('/api/cards/:id/archive', async (req, reply) => {
    store.setArchived(req.params.id, body(req).archived !== false);
    return noContent(reply);
  });
}
