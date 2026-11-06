import type { FastifyInstance } from 'fastify';
import { ValidationError } from '../errors.js';
import { type TrashType } from '../store.js';
import { type ApiKit } from './kit.js';
import { t } from '../i18n/index.js';

/** Papierkorb */
export function registerTrashRoutes(app: FastifyInstance, k: ApiKit): void {
  const { store, noContent } = k;

  // ----- trash -----
  app.get('/api/trash', async (req) => store.listTrash(req.user?.id ?? null));
  app.post<{ Params: { type: string; id: string } }>('/api/trash/:type/:id/restore', async (req, reply) => {
    const { type, id } = req.params;
    if (!['board', 'column', 'category', 'card'].includes(type)) throw new ValidationError(t('Unbekannter Typ'));
    store.restoreFromTrash(type as TrashType, id);
    return noContent(reply);
  });
}
