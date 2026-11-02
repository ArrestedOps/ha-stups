// Startet den echten Server (gebaut) als Beta-App: STUPS_CHANNEL=beta wie im Image von „Stups (Beta)", dazu ein nachgebautes
// Home Assistant (e2e/mock-ha.mjs). Wie im Add-on: Supervisor-Token, Ingress-Kopfzeilen vom Entwicklungs-Benutzer.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMockHa } from './mock-ha.mjs';

const PORT = Number(process.env.PORT ?? 18450);
const HA_PORT = PORT + 1;

const { cap } = await startMockHa({ port: HA_PORT, first: 'rene', second: 'conny' });

const dir = mkdtempSync(join(tmpdir(), 'stups-e2e-beta-'));
writeFileSync(
  join(dir, 'options.json'),
  JSON.stringify({ users: [], dashboard_path: '/lovelace/0', daily_summary_time: '23:59', overdue_nag_time: '18:00', log_level: 'warn' }),
);

const dist = join(import.meta.dirname, '..', 'packages', 'server', 'dist');
const { openDb } = await import(pathToFileURL(join(dist, 'db.js')).href);
const { createStore } = await import(pathToFileURL(join(dist, 'store.js')).href);
const seedDb = openDb(join(dir, 'stups.sqlite'));
const seed = createStore(seedDb);
seed.importLegacyPeople([{ name: cap('rene'), notify: [] }, { name: cap('conny'), notify: [] }]);
seedDb.close();

process.env.DATA_DIR = dir;
process.env.OPTIONS_PATH = join(dir, 'options.json');
process.env.PORT = String(PORT);
process.env.ENFORCE_INGRESS_IP = 'false';
process.env.DEV_USER = 'rene';
process.env.SUPERVISOR_TOKEN = 'e2e-token';
process.env.HA_URL = `http://127.0.0.1:${HA_PORT}`;
process.env.STUPS_CHANNEL = 'beta';

await import(pathToFileURL(join(dist, 'main.js')).href);
