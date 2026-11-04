import type { FastifyInstance } from 'fastify';
import { ValidationError } from '../errors.js';
import { t } from '../i18n/index.js';
import { normalizeUrl } from '../links.js';
import { type ApiKit, type Params } from './kit.js';

/** Kommentare, Checkliste und Links */
export function registerCardExtraRoutes(app: FastifyInstance, k: ApiKit): void {
  const { store, body, noContent, fetchTitle, resolveMapsLink } = k;

  // ----- comments -----
  app.get<{ Params: Params }>('/api/cards/:id/comments', async (req) => store.listComments(req.params.id));
  app.post<{ Params: Params }>('/api/cards/:id/comments', async (req, reply) =>
    reply.code(201).send(store.addComment(req.params.id, req.user?.id ?? null, body(req).text)),
  );
  app.patch<{ Params: Params }>('/api/comments/:id', async (req) => store.updateComment(req.params.id, body(req).text));
  app.delete<{ Params: Params }>('/api/comments/:id', async (req, reply) => {
    store.deleteComment(req.params.id);
    return noContent(reply);
  });
  // ----- checklist -----
  app.post<{ Params: Params }>('/api/cards/:id/checklist', async (req, reply) =>
    reply.code(201).send(store.addChecklistItem(req.params.id, body(req).text)),
  );
  app.patch<{ Params: Params }>('/api/checklist/:id', async (req) => {
    const b = body(req);
    return store.updateChecklistItem(req.params.id, { text: b.text, done: b.done });
  });
  app.delete<{ Params: Params }>('/api/checklist/:id', async (req, reply) => {
    store.deleteChecklistItem(req.params.id);
    return noContent(reply);
  });
  // ----- links -----
  app.post<{ Params: Params }>('/api/cards/:id/links', async (req, reply) => {
    const b = body(req);
    // Zuerst prüfen, damit nie etwas Ungültiges abgerufen wird
    const normalized = normalizeUrl(typeof b.url === 'string' ? b.url : '');
    // Google-Kurzlinks werden durch die Maps-URL ersetzt, die die Maps-App aus der Companion App öffnet
    const resolved = await resolveMapsLink(normalized);
    const url = resolved?.url ?? normalized;
    if (b.title !== undefined && b.title !== null && typeof b.title !== 'string') throw new ValidationError(t('Der Titel muss Text sein'));
    const title: string | null | undefined = typeof b.title === 'string' && b.title.trim() ? b.title : resolved?.title;
    if (!title?.trim()) {
      const probe = store.addLink(req.params.id, { url });
      const fetched = await fetchTitle(probe.url);
      return reply.code(201).send(fetched ? store.updateLink(probe.id, { title: fetched }) : probe);
    }
    return reply.code(201).send(store.addLink(req.params.id, { url, title }));
  });
  app.patch<{ Params: Params }>('/api/links/:id', async (req) => {
    const b = body(req);
    return store.updateLink(req.params.id, { url: b.url, title: b.title });
  });
  app.delete<{ Params: Params }>('/api/links/:id', async (req, reply) => {
    store.deleteLink(req.params.id);
    return noContent(reply);
  });
}
