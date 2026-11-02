// Startet den echten Server (gebaut) zusammen mit einem nachgebauten Home Assistant für die Wächter-Tests
// (e2e/mock-ha.mjs), wie er als Add-on läuft: Supervisor-Token, Ingress-Kopfzeilen vom Entwicklungs-Benutzer.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMockHa } from './mock-ha.mjs';

const PORT = Number(process.env.PORT ?? 18410);
// Die Personen (die erste ist der angemeldete Administrator); für die Screenshots mit erfundenen Namen überschreibbar
const [FIRST, SECOND] = (process.env.MOCK_NAMES ?? 'rene,conny').split(',');
const HA_PORT = PORT + 1;

const { cap } = await startMockHa({ port: HA_PORT, first: FIRST, second: SECOND });
// ---------- Stups ----------

const dir = mkdtempSync(join(tmpdir(), 'stups-e2e-ha-'));
writeFileSync(
  join(dir, 'options.json'),
  JSON.stringify({ users: [], dashboard_path: '/lovelace/0', daily_summary_time: '23:59', overdue_nag_time: '18:00', log_level: 'warn' }),
);

const dist = join(import.meta.dirname, '..', 'packages', 'server', 'dist');
const { openDb } = await import(pathToFileURL(join(dist, 'db.js')).href);
const { createStore } = await import(pathToFileURL(join(dist, 'store.js')).href);
const seedDb = openDb(join(dir, 'stups.sqlite'));
const seed = createStore(seedDb);
seed.importLegacyPeople([{ name: cap(FIRST), notify: [] }, { name: cap(SECOND), notify: [] }]);
seedDb.close();

process.env.DATA_DIR = dir;
process.env.OPTIONS_PATH = join(dir, 'options.json');
process.env.PORT = String(PORT);
process.env.ENFORCE_INGRESS_IP = 'false';
process.env.DEV_USER = FIRST;
process.env.SUPERVISOR_TOKEN = 'e2e-token';
process.env.HA_URL = `http://127.0.0.1:${HA_PORT}`;

await import(pathToFileURL(join(dist, 'main.js')).href);
