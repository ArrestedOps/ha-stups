import Fastify from 'fastify';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { apiRoutes } from '../src/api.js';
import { parseOptions } from '../src/config.js';
import { openDb } from '../src/db.js';
import { createEventBus } from '../src/events.js';
import { ingressAuth } from '../src/ingress.js';
import { spikeRoutes } from '../src/spike.js';
import { createStore } from '../src/store.js';
import { ensureWebsocket } from '../src/ws.js';

let app: ReturnType<typeof Fastify> | undefined;
afterEach(async () => {
  await app?.close();
});

/** Baut den Server wie main.ts: Diagnose- und API-Routen teilen sich denselben HTTP-Server. */
async function start(warnings: string[]) {
  app = Fastify({
    logger: {
      level: 'warn',
      stream: { write: (line: string) => void warnings.push(line) },
    },
  });
  await ensureWebsocket(app);
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(spikeRoutes, {
    options: parseOptions({ users: [] }),
    ha: {
      callService: async () => undefined,
      listNotifyServices: async () => [],
      getConfig: async () => ({ time_zone: 'Europe/Berlin' }),
      status: () => ({ connected: true, subscribed: true, lastError: null, eventsReceived: 0, lastEventAt: null }),
      onNotificationAction: () => undefined,
    },
    now: () => new Date(),
  });
  await app.register(apiRoutes, { store: createStore(openDb(':memory:')), bus: createEventBus() });
  await app.listen({ port: 0, host: '127.0.0.1' });
  return (app.server.address() as AddressInfo).port;
}

function firstMessage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: { 'x-remote-user-id': 'u1', 'x-remote-user-name': 'rene', 'x-remote-user-display-name': 'René' },
    });
    ws.on('message', (m) => {
      ws.close();
      resolve(String(m));
    });
    ws.on('error', reject);
  });
}

describe('WebSocket (Live-Sync)', () => {
  it('verbindet, ohne dass der Upgrade doppelt bearbeitet wird', async () => {
    const warnings: string[] = [];
    const port = await start(warnings);

    expect(JSON.parse(await firstMessage(`ws://127.0.0.1:${port}/api/events`))).toMatchObject({ type: 'hello' });
    expect(await firstMessage(`ws://127.0.0.1:${port}/api/spike/ws`)).toBeTruthy();

    expect(warnings.filter((w) => w.includes('upgrade failed'))).toEqual([]);
  });
});
