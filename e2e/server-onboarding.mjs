// Startet den echten Server (gebaut) zusammen mit einem nachgebauten Home Assistant (e2e/mock-ha.mjs) für die Einrichtung beim ersten Start:
// leere Datenbank und OHNE DEV_NO_ONBOARDING, wie ein frisch installiertes Stups im Add-on (Supervisor-Token, Ingress-Kopfzeilen vom
// Entwicklungs-Benutzer). Home Assistant kennt Rene (Administrator), Conny und Mia; Conny hat zwei Anmeldungen der Companion App (doppeltes Gerät wie in echten Installationen), Mia hat kein Handy.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMockHa } from './mock-ha.mjs';

const PORT = Number(process.env.PORT ?? 18460);
const [FIRST, SECOND] = ['rene', 'conny'];
const HA_PORT = PORT + 1;

await startMockHa({ port: HA_PORT, first: FIRST, second: SECOND, extraPersons: ['mia'], duplicateDevice: true });
// ---------- Stups ----------

const dir = mkdtempSync(join(tmpdir(), 'stups-e2e-onb-'));
writeFileSync(
  join(dir, 'options.json'),
  JSON.stringify({ users: [], dashboard_path: '/lovelace/0', daily_summary_time: '23:59', overdue_nag_time: '18:00', log_level: 'warn' }),
);

const dist = join(import.meta.dirname, '..', 'packages', 'server', 'dist');

process.env.DATA_DIR = dir;
process.env.OPTIONS_PATH = join(dir, 'options.json');
process.env.PORT = String(PORT);
process.env.ENFORCE_INGRESS_IP = 'false';
process.env.DEV_USER = FIRST;
process.env.SUPERVISOR_TOKEN = 'e2e-token';
process.env.HA_URL = `http://127.0.0.1:${HA_PORT}`;

await import(pathToFileURL(join(dist, 'main.js')).href);
