import type { FastifyInstance } from 'fastify';
import { ForbiddenError, ValidationError } from '../errors.js';
import { t } from '../i18n/index.js';
import { hasPermission } from '../permissions.js';
import { type ApiKit } from './kit.js';

/**
 * Mitteilungen (Glocke): der Posteingang der angemeldeten Person und ihr Gelesen-Marker.
 * Kind: erlaubt, aber der Store filtert auf Einträge zu eigenen (zugewiesenen) Aufgaben (store/inbox.ts); fremde Boards erscheinen nie.
 */
export function registerInboxRoutes(app: FastifyInstance, k: ApiKit): void {
  const { store } = k;

  // ?before=<Zeitpunkt>: nur ältere Einträge (zum Nachladen); höchstens 14 Tage und 100 Einträge je Antwort
  app.get<{ Querystring: { before?: string } }>('/api/inbox', async (req) => {
    if (!req.user) throw new ForbiddenError();
    const raw = req.query.before;
    let before: string | null = null;
    if (raw !== undefined) {
      if (typeof raw !== 'string' || !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(raw) || Number.isNaN(Date.parse(raw))) {
        throw new ValidationError(t('„before“ muss ein Zeitpunkt wie 2026-11-04T10:00:00.000Z sein'));
      }
      before = raw;
    }
    return store.inbox(req.user.id, { confirmAll: hasPermission(req.access, 'confirm'), before });
  });

  // „Alle gelesen": der Marker der Person springt auf jetzt
  app.put('/api/me/inbox-seen', async (req) => {
    if (!req.user) throw new ForbiddenError();
    return { seenAt: store.markInboxSeen(req.user.id) };
  });
}
