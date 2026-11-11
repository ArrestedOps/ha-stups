// Smoke-Test des gebauten Ergebnisses (nicht des Quellcodes): starten, auf Gesundheit prüfen, anmelden, etwas schreiben,
// neu starten und prüfen, dass es noch da ist.
//
//   node e2e/smoke.mjs --local          den gebauten Server (packages/server/dist/main.js) direkt starten (nach `pnpm build`)
//   node e2e/smoke.mjs --image <tag>    ein Docker-Image starten (die CI prüft damit jedes Image je Architektur vor dem Veröffentlichen)
//
// Beides führt dieselben Prüfungen aus; nur das Starten, Stoppen und Neustarten unterscheidet sich. Das Image läuft im Modus ohne Home
// Assistant mit einem Konto aus STUPS_ADMIN_USER/STUPS_ADMIN_PASSWORD, die Daten liegen in einem Volume (Docker) oder Ordner (lokal).
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const USER = 'smoke';
const PASSWORD = 'smoke-test-passwort';
const BOARD = `Smoke ${Date.now()}`;

const args = process.argv.slice(2);
const mode = args[0];
if (mode !== '--local' && !(mode === '--image' && args[1])) {
  console.error('Aufruf: node e2e/smoke.mjs --local | --image <tag>');
  process.exit(2);
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Ein Ziel: starten, stoppen, neu starten, aufräumen, Protokoll (nur für die Fehlersuche) */
async function localTarget(port) {
  const dir = mkdtempSync(join(tmpdir(), 'stups-smoke-'));
  const env = { ...process.env };
  for (const key of ['SUPERVISOR_TOKEN', 'HA_URL', 'HA_TOKEN', 'ENFORCE_INGRESS_IP', 'DEV_USER', 'DEV_ADMINS', 'OPTIONS_PATH', 'DATA_DIR', 'PORT']) delete env[key];
  Object.assign(env, { STUPS_DATA_DIR: dir, STUPS_SHARE_DIR: join(dir, 'share'), STUPS_PORT: String(port), STUPS_LOG_LEVEL: 'warn', STUPS_ADMIN_USER: USER, STUPS_ADMIN_PASSWORD: PASSWORD });
  let child = null;
  let log = '';
  const start = () => {
    child = spawn(process.execPath, [join(import.meta.dirname, '..', 'packages', 'server', 'dist', 'main.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const out of [child.stdout, child.stderr]) out.on('data', (c) => (log = (log + c).slice(-8000)));
  };
  const stop = async () => {
    if (!child) return;
    const done = new Promise((r) => child.once('exit', r));
    child.kill();
    await done;
    child = null;
  };
  return {
    start: async () => start(),
    restart: async () => {
      await stop();
      start();
    },
    stop,
    cleanup: async () => {
      await stop();
      rmSync(dir, { recursive: true, force: true });
    },
    logs: () => log,
    health: async () => 'n/a',
  };
}

async function imageTarget(port, image) {
  const name = `stups-smoke-${process.pid}`;
  const volume = `${name}-data`;
  const run = () =>
    docker('run', '-d', '--name', name, '-p', `127.0.0.1:${port}:8099`, '-v', `${volume}:/data`, '-e', `STUPS_ADMIN_USER=${USER}`, '-e', `STUPS_ADMIN_PASSWORD=${PASSWORD}`, '-e', 'STUPS_LOG_LEVEL=warn', image);
  return {
    start: async () => {
      docker('volume', 'create', volume);
      // wie eine bestehende Installation: Datenordner und Dateien gehören root (so legten frühere Versionen sie an)
      docker('run', '--rm', '-v', `${volume}:/data`, '--entrypoint', 'sh', image, '-c', 'mkdir -p /data/files && echo alt > /data/files/alt.txt && chown -R 0:0 /data');
      run();
    },
    // unter welchem Benutzer läuft die App, und gehören die alten Dateien jetzt ihm; im Add-on (SUPERVISOR_TOKEN) bleibt es root
    rights: async () => ({
      appUid: docker('exec', name, 'sh', '-c', "awk '/^Uid/{print $2}' /proc/1/status"),
      legacyOwner: docker('exec', name, 'stat', '-c', '%U', '/data/files/alt.txt'),
      noTokenUid: docker('run', '--rm', image, 'id', '-u'),
      addonUid: docker('run', '--rm', '-e', 'SUPERVISOR_TOKEN=x', image, 'id', '-u'),
    }),
    // stop + start: das Volume bleibt, die Datenbank wird sauber geschlossen und neu geöffnet
    restart: async () => {
      docker('stop', '-t', '10', name);
      docker('start', name);
    },
    stop: async () => docker('stop', '-t', '10', name),
    cleanup: async () => {
      for (const a of [['rm', '-f', name], ['volume', 'rm', '-f', volume]]) {
        try {
          docker(...a);
        } catch {
          /* schon weg */
        }
      }
    },
    logs: () => {
      try {
        return docker('logs', '--tail', '80', name);
      } catch {
        return '';
      }
    },
    // der HEALTHCHECK des Images (starting, healthy, unhealthy)
    health: async () => docker('inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}', name),
  };
}

async function waitHealthy(base, ms = 60_000) {
  const until = Date.now() + ms;
  let last = '';
  while (Date.now() < until) {
    try {
      const res = await fetch(`${base}/healthz`);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = String(e.cause?.code ?? e.message);
    }
    await sleep(500);
  }
  throw new Error(`/healthz antwortet nicht (zuletzt: ${last})`);
}

async function login(base) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-stups-client': '1' },
    body: JSON.stringify({ username: USER, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Anmeldung: HTTP ${res.status} ${await res.text()}`);
  const cookie = res.headers.getSetCookie()[0]?.split(';')[0];
  if (!cookie) throw new Error('Anmeldung: kein Sitzungs-Cookie');
  return cookie;
}

const api = async (base, cookie, method, path, body) => {
  const res = await fetch(`${base}/api/${path}`, {
    method,
    headers: { cookie, 'x-stups-client': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} /api/${path}: HTTP ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

const steps = [];
const ok = (text) => {
  steps.push(text);
  console.log(`  ✓ ${text}`);
};

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const target = mode === '--local' ? await localTarget(port) : await imageTarget(port, args[1]);
let failed = false;
try {
  console.log(`Smoke-Test (${mode === '--local' ? 'gebauter Server' : `Image ${args[1]}`}) auf ${base}`);
  await target.start();
  await waitHealthy(base);
  ok('startet und antwortet auf /healthz');

  let cookie = await login(base);
  ok('Anmeldung mit dem Konto aus der Umgebung');

  const created = await api(base, cookie, 'POST', 'boards', { name: BOARD });
  if (!created?.id) throw new Error('Board anlegen: keine Kennung in der Antwort');
  const column = (await api(base, cookie, 'GET', `boards/${created.id}`)).columns?.[0]?.id;
  if (!column) throw new Error('Das neue Board hat keine Spalte');
  const card = await api(base, cookie, 'POST', `boards/${created.id}/cards`, { columnId: column, title: 'Smoke-Karte' });
  if (!card?.id) throw new Error('Karte anlegen: keine Kennung in der Antwort');
  ok('Board und Karte angelegt');

  await target.restart();
  await waitHealthy(base);
  ok('startet nach dem Neustart wieder');

  cookie = await login(base);
  const boards = await api(base, cookie, 'GET', 'boards');
  if (!boards.some((b) => b.id === created.id && b.name === BOARD)) throw new Error('Das Board ist nach dem Neustart weg');
  const view = await api(base, cookie, 'GET', `boards/${created.id}`);
  if (!view.cards?.some((c) => c.id === card.id && c.title === 'Smoke-Karte')) throw new Error('Die Karte ist nach dem Neustart weg');
  ok('Board und Karte sind nach dem Neustart noch da (Daten bleiben erhalten)');

  if (mode === '--image') {
    // der HEALTHCHECK des Images wird erst nach start-period/interval gesund; hier genügt, dass er nicht „unhealthy" meldet
    const health = await target.health();
    if (health === 'unhealthy') throw new Error('Der HEALTHCHECK des Images meldet „unhealthy"');
    ok(`HEALTHCHECK des Images: ${health}`);

    const r = await target.rights();
    if (r.appUid === '0') throw new Error('Die App läuft im Container als root (erwartet: ein eigener Benutzer)');
    if (r.legacyOwner !== 'node') throw new Error(`Alte, root-eigene Daten wurden nicht übernommen (Besitzer: ${r.legacyOwner})`);
    if (r.noTokenUid === '0') throw new Error('Ohne Home Assistant startet der Container als root');
    if (r.addonUid !== '0') throw new Error(`Im Add-on (SUPERVISOR_TOKEN) soll der Container root bleiben, ist aber ${r.addonUid}`);
    ok(`App läuft als Benutzer ${r.appUid}, alte root-eigene Daten gehören jetzt node, im Add-on bleibt root`);
  }
} catch (e) {
  failed = true;
  console.error(`  ✗ ${e.message}`);
  const logs = target.logs();
  if (logs) console.error(`--- Protokoll des Servers ---\n${logs}`);
} finally {
  await target.cleanup().catch(() => undefined);
}
console.log(failed ? 'Smoke-Test FEHLGESCHLAGEN' : `Smoke-Test bestanden (${steps.length} Prüfungen)`);
process.exit(failed ? 1 : 0);
