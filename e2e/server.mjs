// Startet den echten Server (gebaut) mit leerer Datenbank und ohne Home Assistant für die Browser-Tests.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'stups-e2e-'));
writeFileSync(
  join(dir, 'options.json'),
  JSON.stringify({
    users: [],
    dashboard_path: '/lovelace/0',
    daily_summary_time: '23:59',
    overdue_nag_time: '18:00',
    log_level: 'warn',
  }),
);

// Rene und Conny stehen als Personen in der Datenbank (Zugriff: alle), nicht in der Konfiguration: sonst wären sie dort verwaltet und in der App gesperrt
const dist = join(import.meta.dirname, '..', 'packages', 'server', 'dist');
const { openDb } = await import(pathToFileURL(join(dist, 'db.js')).href);
const { createStore } = await import(pathToFileURL(join(dist, 'store.js')).href);
const seedDb = openDb(join(dir, 'stups.sqlite'));
const seed = createStore(seedDb);
seed.importLegacyPeople([{ name: 'Rene', notify: [] }, { name: 'Conny', notify: [] }]);
seedDb.close();

process.env.DATA_DIR = dir;
process.env.OPTIONS_PATH = join(dir, 'options.json');
process.env.PORT = process.env.PORT ?? '18400';
process.env.ENFORCE_INGRESS_IP = 'false';
process.env.DEV_USER = 'rene';
// Nur rene ist Administrator, wer sonst dazukommt, ist Mitglied (sonst gälten ohne Home Assistant alle Personen als Administratoren)
process.env.DEV_ADMINS = 'dev-rene';
delete process.env.SUPERVISOR_TOKEN;

await import(pathToFileURL(join(import.meta.dirname, '..', 'packages', 'server', 'dist', 'main.js')).href);
