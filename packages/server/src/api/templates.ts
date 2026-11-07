import type { FastifyInstance } from 'fastify';
import { currentLanguage } from '../i18n/index.js';
import { hasPermission } from '../permissions.js';
import { type ApiKit, type Params } from './kit.js';

/** Board-Vorlagen: auflisten, ein Board als Vorlage speichern, eigene Vorlagen löschen (das Anlegen aus einer Vorlage steht in boards.ts) */
export function registerTemplateRoutes(app: FastifyInstance, k: ApiKit): void {
  const { store, body, noContent } = k;

  // Eingebaute und eigene, die eingebauten in der Sprache der Anfrage
  app.get('/api/templates', async () => store.listTemplates(currentLanguage()));

  app.post<{ Params: Params }>('/api/boards/:id/save-as-template', async (req, reply) => {
    const b = body(req);
    return reply.code(201).send(store.saveBoardAsTemplate(req.params.id, b.name, req.user?.id ?? null, { withCards: b.withCards !== false }));
  });

  // Löschen darf der Ersteller, ein Administrator und wer das Recht „settings“ hat (der Datenteil prüft das)
  app.delete<{ Params: Params }>('/api/templates/:id', async (req, reply) => {
    store.deleteTemplate(req.params.id, req.user?.id ?? null, hasPermission(req.access, 'settings'));
    return noContent(reply);
  });
}
