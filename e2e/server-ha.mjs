// Startet den echten Server (gebaut) zusammen mit einem nachgebauten Home Assistant für die Wächter-Tests:
// REST (Zustände, Dienste), WebSocket (Zustände lesen, Auslöser abonnieren, Benutzer, Personen) und eine kleine
// Fernsteuerung unter /mock/… (Zustand setzen, Push-Nachrichten ansehen).
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// „ws" gehört zum Server-Paket (pnpm legt es nur dort ab)
const { WebSocketServer } = createRequire(join(import.meta.dirname, '..', 'packages', 'server', 'package.json'))('ws');

const PORT = Number(process.env.PORT ?? 18410);
// Die beiden Personen (die erste ist der angemeldete Administrator); für die Screenshots mit erfundenen Namen überschreibbar
const [FIRST, SECOND] = (process.env.MOCK_NAMES ?? 'rene,conny').split(',');
const cap = (n) => n[0].toUpperCase() + n.slice(1);
const HA_PORT = PORT + 1;

// ---------- nachgebautes Home Assistant ----------

const iso = () => new Date().toISOString();
const states = new Map();
const subs = new Set(); // { ws, id, entities: string[], to?: string }
const pushes = [];
const eventSubs = new Set(); // { ws, id, eventType }

const setState = (entityId, state, attributes = {}) => {
  const old = states.get(entityId);
  const next = { entity_id: entityId, state, last_changed: iso(), attributes: { ...(old?.attributes ?? {}), ...attributes } };
  states.set(entityId, next);
  for (const s of subs) {
    if (!s.entities.includes(entityId)) continue;
    if (s.to !== undefined && s.to !== state) continue;
    s.ws.send(
      JSON.stringify({
        id: s.id,
        type: 'event',
        event: { variables: { trigger: { platform: 'state', entity_id: entityId, from_state: old ?? null, to_state: next } } },
      }),
    );
  }
};

setState(`person.${FIRST}`, 'home', { friendly_name: cap(FIRST), user_id: `dev-${FIRST}` });
setState(`person.${SECOND}`, 'home', { friendly_name: cap(SECOND), user_id: `ha-${SECOND}-e2e` });
setState('sensor.waschmaschine_leistung', '120', { friendly_name: 'Waschmaschine Leistung', unit_of_measurement: 'W' });
setState('binary_sensor.waschmaschine_tuer', 'off', { friendly_name: 'Waschmaschine Tür' });

const body = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });

const http = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (data, code = 200) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  if (req.method === 'GET' && url.pathname === '/api/config') return send({ time_zone: 'Europe/Berlin' });
  if (req.method === 'GET' && url.pathname === '/api/services') {
    return send([{ domain: 'notify', services: { [`mobile_app_${FIRST}_e2e`]: {}, [`mobile_app_${SECOND}_e2e`]: {} } }]);
  }
  if (req.method === 'POST' && url.pathname.startsWith('/api/states/')) {
    await body(req);
    return send({});
  }
  if (req.method === 'POST' && url.pathname.startsWith('/api/services/notify/')) {
    pushes.push({ service: url.pathname.split('/').pop(), ...(await body(req)) });
    return send([]);
  }
  // Fernsteuerung für die Tests
  if (req.method === 'POST' && url.pathname === '/mock/state') {
    const b = await body(req);
    setState(b.entityId, b.state, b.attributes ?? {});
    return send({ ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/mock/event') {
    const b = await body(req);
    for (const s of eventSubs) {
      if (s.eventType === b.type) s.ws.send(JSON.stringify({ id: s.id, type: 'event', event: { event_type: b.type, data: b.data ?? {} } }));
    }
    return send({ ok: true });
  }
  if (req.method === 'GET' && url.pathname === '/mock/pushes') return send(pushes);
  if (req.method === 'POST' && url.pathname === '/mock/pushes/clear') {
    pushes.length = 0;
    return send({ ok: true });
  }
  return send({ error: 'unbekannt' }, 404);
});

const wss = new WebSocketServer({ server: http, path: '/websocket' });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'auth_required' }));
  ws.on('close', () => {
    for (const s of subs) if (s.ws === ws) subs.delete(s);
    for (const s of eventSubs) if (s.ws === ws) eventSubs.delete(s);
  });
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const ok = (result = null) => ws.send(JSON.stringify({ id: msg.id, type: 'result', success: true, result }));
    switch (msg.type) {
      case 'auth':
        return ws.send(JSON.stringify({ type: 'auth_ok' }));
      case 'get_states':
        return ok([...states.values()]);
      case 'subscribe_events':
        eventSubs.add({ ws, id: msg.id, eventType: msg.event_type });
        return ok();
      case 'subscribe_trigger': {
        const t = msg.trigger;
        subs.add({ ws, id: msg.id, entities: [].concat(t.entity_id), to: t.to });
        return ok();
      }
      case 'unsubscribe_events':
        for (const s of subs) if (s.ws === ws && s.id === msg.subscription) subs.delete(s);
        return ok();
      case 'config/auth/list':
        return ok([{ id: `dev-${FIRST}`, is_owner: true, is_active: true, system_generated: false, group_ids: ['system-admin'] }]);
      case 'person/list':
        return ok({ storage: [{ name: cap(FIRST), user_id: `dev-${FIRST}` }, { name: cap(SECOND), user_id: `ha-${SECOND}-e2e` }], config: [] });
      case 'lovelace/dashboards/list':
        return ok([]);
      default:
        return ws.send(JSON.stringify({ id: msg.id, type: 'result', success: false, error: { message: `unbekannter Befehl ${msg.type}` } }));
    }
  });
});
await new Promise((resolve) => http.listen(HA_PORT, '127.0.0.1', resolve));

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
