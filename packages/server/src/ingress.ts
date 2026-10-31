import type { FastifyInstance } from 'fastify';

export interface HaUser {
  id: string;
  name: string;
  displayName: string;
  ingressPath: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    haUser: HaUser | null;
  }
}

export interface IngressOptions {
  /** Only accept the Supervisor ingress proxy (172.30.32.2). Disable for local development. */
  enforceIp: boolean;
  /** Nur für die lokale Entwicklung (enforceIp: false): Nutzer, wenn kein Header mitkommt. */
  devUser?: { id: string; name: string; displayName: string };
}

const INGRESS_IP = '172.30.32.2';
const OPEN_PATHS = new Set(['/healthz']);

function header(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export async function ingressAuth(app: FastifyInstance, opts: IngressOptions): Promise<void> {
  app.decorateRequest('haUser', null);

  app.addHook('onRequest', async (req, reply) => {
    if (OPEN_PATHS.has(req.url.split('?')[0] ?? '')) return;

    const ip = req.ip.replace(/^::ffff:/, '');
    if (opts.enforceIp && ip !== INGRESS_IP) {
      return reply.code(403).send({ error: 'Nur über Home Assistant Ingress erreichbar' });
    }

    const id = header(req.headers['x-remote-user-id']);
    if (!id) {
      if (!opts.enforceIp && opts.devUser) {
        req.haUser = { ...opts.devUser, ingressPath: '' };
        return;
      }
      return reply.code(401).send({ error: 'Kein Home-Assistant-Nutzer erkannt' });
    }
    const name = header(req.headers['x-remote-user-name']);
    req.haUser = {
      id,
      name,
      displayName: header(req.headers['x-remote-user-display-name']) || name,
      ingressPath: header(req.headers['x-ingress-path']),
    };
  });
}

// Hooks must apply to routes registered on the parent instance, so skip Fastify's encapsulation.
(ingressAuth as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;
