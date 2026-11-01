import type { FastifyInstance } from 'fastify';
import { identityAuth, type Identity, type Principal } from './identity.js';

export type HaUser = Principal;

export interface IngressOptions {
  /** Only accept the Supervisor ingress proxy (172.30.32.2). Disable for local development. */
  enforceIp: boolean;
  /** Nur für die lokale Entwicklung (enforceIp: false): Nutzer, wenn kein Header mitkommt. */
  devUser?: { id: string; name: string; displayName: string };
}

const INGRESS_IP = '172.30.32.2';

function header(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** Anmeldung im Add-on: Home Assistant meldet den Benutzer über Kopfzeilen, die nur der Ingress-Proxy setzt. */
export function createIngressIdentity(opts: IngressOptions): Identity {
  return {
    authenticate(req) {
      const ip = req.ip.replace(/^::ffff:/, '');
      if (opts.enforceIp && ip !== INGRESS_IP) {
        return { ok: false, status: 403, error: 'Nur über Home Assistant Ingress erreichbar' };
      }

      const id = header(req.headers['x-remote-user-id']);
      if (!id) {
        if (!opts.enforceIp && opts.devUser) return { ok: true, principal: { ...opts.devUser, ingressPath: '' } };
        return { ok: false, status: 401, error: 'Kein Home-Assistant-Nutzer erkannt' };
      }
      const name = header(req.headers['x-remote-user-name']);
      return {
        ok: true,
        principal: {
          id,
          name,
          displayName: header(req.headers['x-remote-user-display-name']) || name,
          ingressPath: header(req.headers['x-ingress-path']),
        },
      };
    },
  };
}

export async function ingressAuth(app: FastifyInstance, opts: IngressOptions): Promise<void> {
  await identityAuth(app, { identity: createIngressIdentity(opts) });
}

(ingressAuth as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;
