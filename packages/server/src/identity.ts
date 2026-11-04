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

/** Port: bestimmt aus einer Anfrage den angemeldeten Benutzer. Adapter: Ingress, Sitzung (eigene Anmeldung). */
export interface Identity {
  authenticate(req: IdentityRequest): IdentityResult | Promise<IdentityResult>;
  /** Pfade, die ohne Anmeldung erreichbar sind (Oberfläche, Anmeldeseite); /healthz ist es immer */
  isPublic?(path: string): boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

/** Ohne Anmeldung erreichbar */
const OPEN_PATHS = new Set(['/healthz']);

/**
 * Der Pfad einer Anfrage so, wie ihn das Routing sieht: ohne Abfrage und prozentdecodiert.
 * Fastify decodiert erst beim Routing; wer den rohen Pfad prüft, lässt `/%61pi/boards` als „kein API-Pfad“ durch.
 * Mehrfach codierte Pfade werden bis zum festen Stand decodiert (lieber zu streng als zu offen).
 * Ungültige Codierung ergibt `null`: Der Aufrufer behandelt sie wie einen geschützten Pfad.
 */
export function requestPath(url: string): string | null {
  let path = url.split('?')[0] ?? '';
  try {
    for (let i = 0; i < 4; i++) {
      const next = decodeURIComponent(path);
      if (next === path) return path;
      path = next;
    }
  } catch {
    return null;
  }
  return path;
}

export async function identityAuth(app: FastifyInstance, opts: { identity: Identity }): Promise<void> {
  app.decorateRequest('principal', null);

  app.addHook('onRequest', async (req, reply) => {
    const path = requestPath(req.url);
    if (path !== null && (OPEN_PATHS.has(path) || opts.identity.isPublic?.(path))) return;
    const result = await opts.identity.authenticate({ ip: req.ip, url: req.url, headers: req.headers });
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    req.principal = result.principal;
  });
}

// Hooks must apply to routes registered on the parent instance, so skip Fastify's encapsulation.
(identityAuth as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;
