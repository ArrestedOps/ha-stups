import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { createStore } from '../src/store.js';

/**
 * Hält die Form fest, die store.ts und api.ts nach außen haben: alle Methoden des Stores und alle Routen der API.
 * Beim Aufteilen in kleinere Dateien (Stups 1.12.0) darf nichts verloren gehen oder dazukommen.
 * Bewusst geändert wird die Form nur zusammen mit diesen Dateien: UPDATE_SHAPE=1 pnpm test schreibt sie neu.
 */
const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const update = process.env.UPDATE_SHAPE === '1';

function check(file: string, actual: string[]): void {
  const path = join(dir, file);
  if (update || !existsSync(path)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(actual, null, 2) + '\n');
  }
  expect(actual).toEqual(JSON.parse(readFileSync(path, 'utf8')));
}

describe('Form von Store und API', () => {
  it('der Store bietet genau diese Methoden', () => {
    const store = createStore(openDb(':memory:'));
    const keys = Object.keys(store).sort();
    expect(keys.length).toBeGreaterThan(80);
    check('store-methods.json', keys);
  });

  it('die API bietet genau diese Routen (mit allen Teilen, die es nur mit bestimmten Abhängigkeiten gibt)', async () => {
    const routes: string[] = [];
    const app = Fastify();
    app.addHook('onRoute', (r) => {
      for (const m of ([] as string[]).concat(r.method)) routes.push(`${m} ${r.url}`);
    });
    const store = createStore(openDb(':memory:'));
    // Handler laufen hier nicht: es genügt, dass die Abhängigkeiten da sind, damit ihre Routen angemeldet werden
    await app.register(apiRoutes, {
      store,
      accounts: {} as never,
      passkeys: {} as never,
      betaGate: { enabled: true } as never,
      files: {} as never,
      watchers: {} as never,
      watcherData: {} as never,
      exportData: () => ({ dir: '', bytes: 0, files: false }),
      push: {} as never,
      ntfy: { url: 'https://ntfy.example.org', roundTrip: () => null },
      ha: { listDashboards: async () => [], probeWatchers: async () => ({}) as never, getStates: async () => [] },
    });
    await app.ready();
    const sorted = [...new Set(routes)].sort();
    expect(sorted.length).toBeGreaterThan(100);
    check('api-routes.json', sorted);
    await app.close();
  });
});
