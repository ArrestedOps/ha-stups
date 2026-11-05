import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';

/**
 * Abrufe fremder Adressen (Link-Titel, Kurzlinks) dürfen nie das eigene Netz erreichen: Loopback, private Bereiche,
 * Link-Local (auch die Cloud-Metadaten 169.254.169.254) und Namen ohne Punkt wie `homeassistant`.
 * Geprüft wird die aufgelöste Adresse, und die Verbindung geht genau an diese (kein zweites Auflösen: DNS-Rebinding).
 */
export type Resolve = (host: string) => Promise<string[]>;

export const defaultResolve: Resolve = async (host) => {
  const list = await dns.promises.lookup(host, { all: true, verbatim: true });
  return list.map((a) => a.address);
};

const V4_BLOCKED: [number, number][] = [
  [ip4('0.0.0.0'), 8],
  [ip4('10.0.0.0'), 8],
  [ip4('100.64.0.0'), 10], // Carrier-grade NAT (auch Tailscale)
  [ip4('127.0.0.0'), 8],
  [ip4('169.254.0.0'), 16], // Link-Local, Cloud-Metadaten
  [ip4('172.16.0.0'), 12],
  [ip4('192.0.0.0'), 24],
  [ip4('192.0.2.0'), 24],
  [ip4('192.88.99.0'), 24],
  [ip4('192.168.0.0'), 16],
  [ip4('198.18.0.0'), 15],
  [ip4('198.51.100.0'), 24],
  [ip4('203.0.113.0'), 24],
  [ip4('224.0.0.0'), 4], // Multicast
  [ip4('240.0.0.0'), 4], // reserviert und Broadcast
];

function ip4(s: string): number {
  const p = s.split('.').map(Number);
  return ((p[0]! << 24) | (p[1]! << 16) | (p[2]! << 8) | p[3]!) >>> 0;
}

function isPublicV4(ip: string): boolean {
  const n = ip4(ip);
  return !V4_BLOCKED.some(([base, bits]) => ((n ^ base) >>> (32 - bits)) === 0);
}

/** Acht 16-Bit-Gruppen einer IPv6-Adresse (null bei ungültiger Schreibweise) */
function groups6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const n = ip4(tail[1]!);
    s = s.slice(0, tail.index) + ((n >>> 16) & 0xffff).toString(16) + ':' + (n & 0xffff).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  const nums = parts.map((p) => (/^[0-9a-f]{1,4}$/.test(p) ? parseInt(p, 16) : NaN));
  return nums.length === 8 && nums.every((x) => !Number.isNaN(x)) ? nums : null;
}

function isPublicV6(ip: string): boolean {
  const g = groups6(ip);
  if (!g) return false;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  const zeros5 = g.slice(0, 5).every((x) => x === 0);
  if (zeros5 && (g[5] === 0xffff || g[5] === 0)) return isPublicV4(v4(g[6]!, g[7]!)); // ::ffff:a.b.c.d (und ::a.b.c.d, ::1 und :: fallen hier heraus)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicV4(v4(g[6]!, g[7]!)); // NAT64
  if ((g[0]! & 0xe000) !== 0x2000) return false; // nur globale Unicast-Adressen (2000::/3)
  if (g[0] === 0x2001 && (g[1]! < 0x200 || g[1] === 0xdb8)) return false; // 2001::/23 (Teredo, Dokumentation, …)
  if (g[0] === 0x2002) return false; // 6to4
  if (g[0] === 0x3fff) return false; // Dokumentation
  return true;
}

export function isPublicIp(ip: string): boolean {
  const kind = net.isIP(ip.replace(/^\[|\]$/g, '').replace(/%.*$/, ''));
  const bare = ip.replace(/^\[|\]$/g, '');
  if (kind === 4) return isPublicV4(bare);
  if (kind === 6) return isPublicV6(bare);
  return false;
}

const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.home.arpa', '.intranet', '.corp', '.private'];

/** Wirft, wenn die Adresse nicht http/https ist oder auf eine interne Adresse zeigt. Gibt die geprüften Adressen zurück. */
export async function assertPublicUrl(rawUrl: string | URL, resolve: Resolve = defaultResolve): Promise<string[]> {
  const url = typeof rawUrl === 'string' ? new URL(rawUrl) : rawUrl;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Nur http und https');
  if (url.username || url.password) throw new Error('Keine Zugangsdaten in der Adresse');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!host) throw new Error('Kein Rechnername');
  if (net.isIP(host)) {
    if (!isPublicIp(host)) throw new Error('Interne Adresse');
    return [host];
  }
  if (!host.includes('.') || host === 'localhost' || INTERNAL_SUFFIXES.some((s) => host.endsWith(s))) throw new Error('Interner Name');
  const addresses = await resolve(host);
  if (addresses.length === 0 || !addresses.every(isPublicIp)) throw new Error('Interne Adresse');
  return addresses;
}

/** fetch, das nur an vorher geprüfte öffentliche Adressen verbindet (Weiterleitungen folgt es nie selbst) */
export function pinnedFetch(resolve: Resolve = defaultResolve): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    await assertPublicUrl(url, resolve);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const lib = url.protocol === 'https:' ? https : http;
    return new Promise<Response>((done, fail) => {
      const req = lib.request(
        url,
        {
          method: 'GET',
          headers,
          signal: init?.signal ?? undefined,
          // Die Verbindung geht an genau die hier geprüfte Adresse (nicht an ein zweites Ergebnis der Namensauflösung)
          lookup: ((host: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) => {
            resolve(host.replace(/\.$/, '')).then(
              (list) => {
                const ok = list.filter(isPublicIp);
                if (ok.length === 0 || ok.length !== list.length) return cb(new Error('Interne Adresse'));
                const entries = ok.map((address) => ({ address, family: net.isIP(address) }));
                if (opts.all) cb(null, entries);
                else cb(null, entries[0]!.address, entries[0]!.family);
              },
              (err: unknown) => cb(err),
            );
          }) as never,
        },
        (msg) => {
          const h = new Headers();
          for (const [k, v] of Object.entries(msg.headers)) {
            if (Array.isArray(v)) v.forEach((x) => h.append(k, x));
            else if (v !== undefined) h.set(k, v);
          }
          const status = msg.statusCode ?? 0;
          const body = [204, 205, 304].includes(status) || status < 200 ? null : (Readable.toWeb(msg) as unknown as ReadableStream);
          done(new Response(body, { status, headers: h }));
        },
      );
      req.on('error', fail);
      req.end();
    });
  }) as typeof fetch;
}
