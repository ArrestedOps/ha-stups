import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createAccess } from './access.js';
import { AppError, ForbiddenError } from './errors.js';
import { fetchPageTitle, resolveMapsLink as resolveShortMapsLink } from './links.js';
import { ensureWebsocket } from './ws.js';
import { body, type ApiDeps, type ApiKit } from './api/kit.js';
import { registerSettingsRoutes } from './api/settings.js';
import { registerAccessRoutes } from './api/access.js';
import { registerBoardRoutes } from './api/boards.js';
import { registerCardRoutes } from './api/cards.js';
import { registerNudgeRoutes } from './api/nudges.js';
import { registerWatcherRoutes } from './api/watchers.js';
import { registerAttachmentRoutes } from './api/attachments.js';
import { registerCardExtraRoutes } from './api/card-extras.js';
import { registerTrashRoutes } from './api/trash.js';

export type { ApiDeps } from './api/kit.js';

/** Auch ohne Zugriff erreichbar: damit die Oberfläche erklären kann, warum nichts angezeigt wird */
const OPEN_PATHS = new Set(['/api/me']);

/**
 * Die API. Hier stehen nur Einrichtung, Zugriffsprüfung und Live-Sync; die Routen selbst liegen seit 1.12.0 nach Themen
 * in api/*.ts (Einstellungen, Zugriff, Boards, Karten, Stupsen, Wächter, Anhänge, Kommentare und Co., Papierkorb).
 */
export async function apiRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const { store } = deps;
  const fetchTitle = deps.fetchTitle ?? ((url: string) => fetchPageTitle(url));
  const resolveMapsLink = deps.resolveMapsLink ?? ((url: string) => resolveShortMapsLink(url));

  const access = deps.access ?? createAccess({ store, directory: deps.directory });
  app.decorateRequest('user', null);
  app.decorateRequest('access', null);

  const requireAdmin = (req: FastifyRequest) => {
    if (!req.access?.isAdmin) throw new ForbiddenError('Das dürfen nur Administratoren');
  };

  app.setErrorHandler((err: Error & { statusCode?: number }, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Interner Fehler' });
  });

  app.addHook('preHandler', async (req) => {
    const u = req.principal;
    if (!u) return;
    const result = await access.evaluate({ id: u.id, name: u.name, displayName: u.displayName });
    req.user = result.user;
    req.access = result;
    if (!result.allowed && !OPEN_PATHS.has(req.url.split('?')[0] ?? '')) {
      throw new ForbiddenError('Kein Zugriff: Bitte einen Administrator, dich freizugeben');
    }
  });

  // Jede erfolgreiche Änderung wird allen Geräten gemeldet, die sie dann nachladen.
  app.addHook('onResponse', async (req, reply) => {
    if (req.method !== 'GET' && reply.statusCode < 400) deps.bus?.emit({ by: req.user?.id ?? null });
  });

  await ensureWebsocket(app);
  app.get('/api/events', { websocket: true }, (socket) => {
    const bus = deps.bus;
    socket.send(JSON.stringify({ type: 'hello', seq: bus?.seq ?? 0 }));
    const off = bus?.subscribe((e) => socket.send(JSON.stringify({ type: 'changed', seq: e.seq, by: e.by, changes: e.changes })));
    const ping = setInterval(() => socket.ping(), 25_000);
    socket.on('close', () => {
      off?.();
      clearInterval(ping);
    });
  });

  const noContent = (reply: FastifyReply) => reply.code(204).send();

  const k: ApiKit = { deps, store, access, body, requireAdmin, noContent, fetchTitle, resolveMapsLink };
  registerSettingsRoutes(app, k);
  registerAccessRoutes(app, k);
  registerBoardRoutes(app, k);
  registerCardRoutes(app, k);
  registerNudgeRoutes(app, k);
  registerWatcherRoutes(app, k);
  await registerAttachmentRoutes(app, k);
  registerCardExtraRoutes(app, k);
  registerTrashRoutes(app, k);
}
