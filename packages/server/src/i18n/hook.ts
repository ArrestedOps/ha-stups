import type { FastifyInstance } from 'fastify';
import { currentLanguage, parseLanguage, withLanguage } from './index.js';

/**
 * Jede Anfrage läuft in ihrer Sprache: `X-Stups-Language` (sendet die App), sonst `Accept-Language`, sonst die Standardsprache.
 * Am besten ganz früh einhängen (vor Anmeldung und Zugriffsprüfung), damit auch deren Fehlermeldungen stimmen.
 */
export function registerLanguageHook(app: FastifyInstance): void {
  app.addHook('onRequest', (req, _reply, done) => {
    const lang = parseLanguage(first(req.headers['x-stups-language'])) ?? parseLanguage(first(req.headers['accept-language'])) ?? currentLanguage();
    withLanguage(lang, done);
  });
}

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
