import type { FastifyInstance } from 'fastify';
import type { IncomingHttpHeaders } from 'node:http';

/** Wer die Anfrage stellt, so wie der Anmeldeweg ihn kennt (Ingress, später auch eigene Anmeldung) */
export interface Principal {
  id: string;
  name: string;
  displayName: string;
  /** Pfad, unter dem Home Assistant die App einbindet; leer außerhalb von Ingress */
  ingressPath: string;
}

export type IdentityResult = { ok: true; principal: Principal } | { ok: false; status: 401 | 403; error: string };

export interface IdentityRequest {
  ip: string;
  url: string;
  headers: IncomingHttpHeaders;
}

/** Port: bestimmt aus einer Anfrage den angemeldeten Benutzer. Adapter: Ingress, später Sitzung und Proxy. */
export interface Identity {
  authenticate(req: IdentityRequest): IdentityResult | Promise<IdentityResult>;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

/** Ohne Anmeldung erreichbar */
const OPEN_PATHS = new Set(['/healthz']);

export async function identityAuth(app: FastifyInstance, opts: { identity: Identity }): Promise<void> {
  app.decorateRequest('principal', null);

  app.addHook('onRequest', async (req, reply) => {
    if (OPEN_PATHS.has(req.url.split('?')[0] ?? '')) return;
    const result = await opts.identity.authenticate({ ip: req.ip, url: req.url, headers: req.headers });
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    req.principal = result.principal;
  });
}

// Hooks must apply to routes registered on the parent instance, so skip Fastify's encapsulation.
(identityAuth as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;
