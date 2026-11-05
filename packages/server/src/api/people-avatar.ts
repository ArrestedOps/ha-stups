import type { FastifyInstance } from 'fastify';
import { AppError, ForbiddenError, NotFoundError } from '../errors.js';
import { MAX_AVATAR_BYTES } from '../avatars.js';
import { t } from '../i18n/index.js';
import { hasPermission } from '../permissions.js';
import type { AccessResult } from '../access.js';
import { type ApiKit, type Params } from './kit.js';
import { createUploadQuota } from '../upload-quota.js';

/** Bilder der Personen: ansehen darf jeder (auch ein Kind), ändern nur die Person selbst und Administratoren */
export function registerAvatarRoutes(app: FastifyInstance, k: ApiKit): void {
  const { deps, store, noContent } = k;
  const quota = createUploadQuota(deps.now);
  const avatars = () => {
    if (!deps.avatars) throw new AppError(t('Die Dateiablage ist nicht verfügbar'), 501);
    return deps.avatars;
  };

  // Das Bild kommt als reine Bytes; welcher Typ es wirklich ist, entscheidet der Inhalt (siehe avatars.ts), nicht der Kopf der Anfrage
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: MAX_AVATAR_BYTES + 1024 }, (_req, payload, done) => done(null, payload));

  const person = (id: string) => {
    const p = store.userById(id);
    if (!p || !p.isPerson) throw new NotFoundError(t('Person nicht gefunden'));
    return p;
  };
  const mayChange = (req: { user: { id: string } | null; access: Pick<AccessResult, 'permissions'> | null }, id: string) => {
    if (req.user?.id !== id && !hasPermission(req.access, 'people')) throw new ForbiddenError(t('Das dürfen nur Administratoren'));
  };

  app.get<{ Params: Params; Querystring: { rev?: string } }>('/api/people/:id/avatar', async (req, reply) => {
    const img = avatars().read(req.params.id);
    if (!img) return reply.code(404).send({ error: t('Kein Bild vorhanden') });
    return reply
      .header('content-type', img.mime)
      .header('x-content-type-options', 'nosniff')
      // mit ?rev= ändert sich die Adresse bei jedem neuen Bild: dann darf der Browser es lange behalten
      .header('cache-control', req.query.rev ? 'private, max-age=31536000, immutable' : 'private, no-cache')
      .send(img.data);
  });

  app.put<{ Params: Params }>('/api/people/:id/avatar', { bodyLimit: MAX_AVATAR_BYTES + 1024 }, async (req) => {
    const p = person(req.params.id);
    mayChange(req, p.id);
    quota.avatar(req.user?.id ?? 'anonym'); // höchstens 20 Bilder je Person und Stunde
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    avatars().save(p.id, bytes);
    return store.userById(p.id);
  });

  app.delete<{ Params: Params }>('/api/people/:id/avatar', async (req, reply) => {
    const p = person(req.params.id);
    mayChange(req, p.id);
    await avatars().remove(p.id);
    return noContent(reply);
  });
}
