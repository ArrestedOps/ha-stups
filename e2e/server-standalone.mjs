// Startet den echten Server (gebaut) so, wie er in einem eigenen Container ohne Home Assistant läuft:
// leere Datenbank, keine Entwicklungs-Schalter, Anmeldung mit eigenem Konto.
// Den Einrichtungscode aus dem Protokoll legt das Skript in eine Datei, damit der Browser-Test ihn lesen kann.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CODE_FILE = join(tmpdir(), 'stups-e2e-standalone-code.txt');

const dir = mkdtempSync(join(tmpdir(), 'stups-e2e-standalone-'));
writeFileSync(CODE_FILE, '');

const env = { ...process.env };
for (const key of ['SUPERVISOR_TOKEN', 'HA_URL', 'HA_TOKEN', 'ENFORCE_INGRESS_IP', 'DEV_USER', 'DEV_ADMINS', 'OPTIONS_PATH', 'DATA_DIR', 'PORT']) delete env[key];
Object.assign(env, {
  STUPS_DATA_DIR: dir,
  STUPS_PORT: process.env.PORT ?? '18430',
  STUPS_LOG_LEVEL: 'warn',
  STUPS_DAILY_SUMMARY_TIME: '23:59',
  TZ: 'Europe/Berlin',
});

// Nachgebauter ntfy-Server: nimmt Veröffentlichungen und Löschungen an und zeigt sie unter /__published und /__deleted
const MAIN_PORT = Number(process.env.PORT ?? 18430);
const NTFY_PORT = MAIN_PORT + 1;
const published = [];
const deleted = [];
createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const json = (value, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (req.url === '/__published') return json(published);
    if (req.url === '/__deleted') return json(deleted);
    if (req.url === '/__reset') {
      published.length = 0;
      deleted.length = 0;
      return json({});
    }
    if (req.method === 'POST' && req.url === '/') {
      published.push({ ...JSON.parse(raw), authorization: req.headers.authorization ?? null });
      return json({ id: String(published.length) });
    }
    if (req.method === 'DELETE') {
      deleted.push(req.url);
      return json({});
    }
    json({ error: 'nicht gefunden' }, 404);
  });
}).listen(NTFY_PORT, '127.0.0.1');

Object.assign(env, {
  STUPS_NTFY_URL: `http://127.0.0.1:${NTFY_PORT}`,
  STUPS_NTFY_TOKEN: 'tk_e2e',
  STUPS_PUBLIC_URL: `http://127.0.0.1:${MAIN_PORT}`,
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
