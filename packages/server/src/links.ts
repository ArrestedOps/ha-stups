import { ValidationError } from './errors.js';
import { t } from './i18n/index.js';
import { assertPublicUrl, defaultResolve, pinnedFetch, type Resolve } from './safe-fetch.js';

export type LinkKind = 'web' | 'maps';

const BAD_SCHEMES = /^(javascript|data|vbscript|file|mailto|tel|blob):/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

export function normalizeUrl(input: string): string {
  const raw = input.trim();
  if (!raw) throw new ValidationError(t('Die Adresse fehlt'));
  if (BAD_SCHEMES.test(raw)) throw new ValidationError(t('Nur Adressen mit http oder https sind erlaubt'));
  const withScheme = HAS_SCHEME.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ValidationError(t('Das ist keine gültige Adresse'));
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError(t('Nur Adressen mit http oder https sind erlaubt'));
  }
  return url.toString();
}

export function detectLinkKind(rawUrl: string): LinkKind {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return 'web';
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  if (host === 'maps.apple.com') return 'maps';
  if (/^maps\.google\.[a-z.]+$/.test(host)) return 'maps';
  if (/^(www\.)?google\.[a-z.]+$/.test(host) && path.startsWith('/maps')) return 'maps';
  if (host === 'goo.gl' && path.startsWith('/maps')) return 'maps';
  if (host === 'maps.app.goo.gl') return 'maps';
  return 'web';
}

const isShortMapsLink = (u: URL) =>
  u.hostname === 'maps.app.goo.gl' || (u.hostname === 'goo.gl' && u.pathname.startsWith('/maps'));

/** Ort aus einer ausgeschriebenen Google-Maps-Adresse (?q=… oder /maps/place/Name/…) */
function placeFromGoogleMapsUrl(u: URL): { url: string; title: string | null } | null {
  const host = u.hostname.toLowerCase();
  const isMaps =
    /^maps\.google\.[a-z.]+$/.test(host) || (/^(www\.)?google\.[a-z.]+$/.test(host) && u.pathname.startsWith('/maps'));
  if (!isMaps) return null;

  let query = u.searchParams.get('q');
  if (!query) {
    const m = /^\/maps\/place\/([^/]+)/.exec(u.pathname);
    if (m) query = decodeURIComponent(m[1]!.replace(/\+/g, ' '));
  }
  query = query?.trim() ?? '';
  if (!query) return null;

  // Die offizielle Maps-URL: Sie öffnet die Google-Maps-App aus der Companion App zuverlässig
  const link = new URL('https://www.google.com/maps/search/');
  link.searchParams.set('api', '1');
  link.searchParams.set('query', query);
  const isCoordinates = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(query);
  return { url: link.toString(), title: isCoordinates ? null : query.split(',')[0]!.trim().slice(0, 200) || null };
}

/**
 * Google-Kurzlinks (maps.app.goo.gl) lehnt die Google-Maps-App ab, wenn die Companion App sie öffnet
 * („Unsupported link"). Hier wird der Kurzlink aufgelöst und durch die offizielle Such-URL ersetzt.
 * Gibt null zurück, wenn es kein Kurzlink ist oder sich nichts auflösen lässt (dann bleibt der Link, wie er ist).
 */
export async function resolveMapsLink(
  rawUrl: string,
  fetchFn: typeof fetch = pinnedFetch(),
  timeoutMs = 4000,
  resolve: Resolve = defaultResolve,
): Promise<{ url: string; title: string | null } | null> {
  let start: URL;
  try {
    start = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!isShortMapsLink(start)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = start.toString();
    for (let hop = 0; hop < 5; hop++) {
      await assertPublicUrl(current, resolve); // jede Weiterleitung neu prüfen: nie ins eigene Netz
      const res = await fetchFn(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { accept: 'text/html', 'user-agent': 'Stups/1.0 (+maps-link)' },
      });
      void res.body?.cancel().catch(() => undefined);
      const location = res.headers.get('location');
      if (res.status < 300 || res.status >= 400 || !location) return null;
      const next = new URL(location, current);
      const place = placeFromGoogleMapsUrl(next);
      if (place) return place;
      current = next.toString();
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const MAX_READ_BYTES = 200_000;

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const MAX_REDIRECTS = 3;

/**
 * Best effort: gibt bei jedem Problem null zurück (offline, Zeitlimit, kein HTML, kein Titel).
 * Nur öffentliche Adressen: Jede Adresse, auch nach jeder Weiterleitung (höchstens 3), wird vor dem Abruf geprüft;
 * die Standardverbindung geht an genau die geprüfte Adresse (siehe safe-fetch.ts).
 */
export async function fetchPageTitle(
  url: string,
  fetchFn: typeof fetch = pinnedFetch(),
  timeoutMs = 3000,
  resolve: Resolve = defaultResolve,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = url;
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(current, resolve);
      const r = await fetchFn(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { accept: 'text/html', 'user-agent': 'Stups/1.0 (+link-title)' },
      });
      const location = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && location) {
        void r.body?.cancel().catch(() => undefined);
        current = new URL(location, current).toString();
        continue;
      }
      res = r;
      break;
    }
    if (!res || !res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;

    let text = '';
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      while (bytes < MAX_READ_BYTES && !/<\/title>/i.test(text)) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        text += decoder.decode(value, { stream: true });
      }
      void reader.cancel().catch(() => undefined);
    } else {
      text = (await res.text()).slice(0, MAX_READ_BYTES);
    }
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text);
    const title = m ? decodeEntities(m[1]!).replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    return title || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
