// Startet den echten Server (gebaut) wie im Add-on, mit einer options.json aus der Zeit vor 1.41: gefüllte Personenliste, Zugriff „selected",
// abweichende Uhrzeit fürs Nachhaken. Frische Datenbank: der erste Start übernimmt die Optionen in die App (47-optionen-uebernahme.spec.ts).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startMockHa } from './mock-ha.mjs';

const PORT = Number(process.env.PORT ?? 18470);
const HA_PORT = PORT + 1;

const { cap } = await startMockHa({ port: HA_PORT, first: 'rene', second: 'conny' });

const dir = mkdtempSync(join(tmpdir(), 'stups-e2e-options-'));
writeFileSync(
  join(dir, 'options.json'),
  JSON.stringify({
    users: [
      { name: cap('rene'), notify: ['mobile_app_rene'] },
      { name: 'Ben', notify: ['mobile_app_ben'] },
    ],
    access_mode: 'selected',
    dashboard_path: '/',
    daily_summary_time: '23:59',
    overdue_nag_time: '19:30',
    log_level: 'warn',
  }),
);

const dist = join(import.meta.dirname, '..', 'packages', 'server', 'dist');

process.env.DATA_DIR = dir;
process.env.OPTIONS_PATH = join(dir, 'options.json');
process.env.PORT = String(PORT);
process.env.ENFORCE_INGRESS_IP = 'false';
process.env.DEV_NO_ONBOARDING = '1';
process.env.DEV_USER = 'rene';
process.env.SUPERVISOR_TOKEN = 'e2e-token';
process.env.HA_URL = `http://127.0.0.1:${HA_PORT}`;

await import(pathToFileURL(join(dist, 'main.js')).href);
