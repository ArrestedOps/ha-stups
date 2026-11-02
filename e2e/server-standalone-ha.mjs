// Startet den echten Server (gebaut) so, wie er in einem eigenen Container MIT Verbindung zu Home Assistant läuft:
// HA_URL und HA_TOKEN (Long-Lived-Token) zeigen auf ein nachgebautes Home Assistant (e2e/mock-ha.mjs), Anmeldung mit eigenem Konto.
// Den Einrichtungscode aus dem Protokoll legt das Skript in eine Datei, damit der Browser-Test ihn lesen kann.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMockHa } from './mock-ha.mjs';

export const CODE_FILE = join(tmpdir(), 'stups-e2e-standalone-ha-code.txt');
export const HA_TOKEN = 'e2e-long-lived-token';

const PORT = Number(process.env.PORT ?? 18440);
const HA_PORT = PORT + 1;

// Die Personen in Home Assistant; die Namen müssen zu den Personen in Stups passen (Wächter: „wer ist zu Hause")
await startMockHa({ port: HA_PORT, first: 'anna', second: 'ben', token: HA_TOKEN });

const dir = mkdtempSync(join(tmpdir(), 'stups-e2e-standalone-ha-'));
writeFileSync(CODE_FILE, '');

const env = { ...process.env };
for (const key of ['SUPERVISOR_TOKEN', 'ENFORCE_INGRESS_IP', 'DEV_USER', 'DEV_ADMINS', 'OPTIONS_PATH', 'DATA_DIR', 'PORT']) delete env[key];
Object.assign(env, {
  HA_URL: `http://127.0.0.1:${HA_PORT}`,
  HA_TOKEN,
  STUPS_DATA_DIR: dir,
  STUPS_PORT: String(PORT),
  // localhost statt 127.0.0.1: nur mit einem Namen sind Passkeys erlaubt (der Server mit IP in server-standalone.mjs zeigt das Gegenteil)
  STUPS_PUBLIC_URL: `http://localhost:${PORT}`,
  STUPS_LOG_LEVEL: 'warn',
  STUPS_DAILY_SUMMARY_TIME: '23:59',
  TZ: 'Europe/Berlin',
});

const child = spawn(process.execPath, [join(import.meta.dirname, '..', 'packages', 'server', 'dist', 'main.js')], {
  env,
  stdio: ['ignore', 'pipe', 'inherit'],
});

let buffer = '';
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  buffer += chunk.toString();
  const m = /Code ein: ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(buffer);
  if (m) writeFileSync(CODE_FILE, m[1]);
  if (buffer.length > 20_000) buffer = buffer.slice(-2_000);
});

const stop = () => child.kill();
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('exit', stop);
child.on('exit', (code) => process.exit(code ?? 0));
