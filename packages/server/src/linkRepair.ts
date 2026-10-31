import { resolveMapsLink } from './links.js';
import type { Store } from './store.js';

type Resolve = (url: string) => Promise<{ url: string; title: string | null } | null>;

/**
 * Früher gespeicherte Google-Kurzlinks (maps.app.goo.gl) lehnt die Google-Maps-App aus der Companion App ab.
 * Sie werden beim Start durch die offizielle Maps-URL ersetzt. Ein selbst vergebener Titel bleibt erhalten.
 * Gibt die Zahl der reparierten Links zurück.
 */
export async function repairShortMapsLinks(
  store: Pick<Store, 'listShortMapsLinks' | 'updateLink'>,
  resolve: Resolve = (url) => resolveMapsLink(url),
  log: { info: (msg: string) => void; warn: (msg: string) => void } = { info: () => undefined, warn: () => undefined },
): Promise<number> {
  let fixed = 0;
  for (const link of store.listShortMapsLinks()) {
    try {
      const resolved = await resolve(link.url);
      if (!resolved) continue;
      const generic = !link.title || link.title.trim().toLowerCase() === 'google maps';
      store.updateLink(link.id, { url: resolved.url, ...(generic && resolved.title ? { title: resolved.title } : {}) });
      fixed += 1;
    } catch (err) {
      log.warn(`Maps-Link konnte nicht repariert werden: ${String(err)}`);
    }
  }
  if (fixed > 0) log.info(`${fixed} Google-Kurzlinks durch die Maps-URL ersetzt`);
  return fixed;
}
