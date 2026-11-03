// Nachgebautes Home Assistant für die Browser-Tests: REST (Zustände, Dienste), WebSocket (Zustände lesen, Auslöser
// abonnieren, Benutzer, Personen) und eine kleine Fernsteuerung unter /mock/… (Zustand setzen, Push-Nachrichten ansehen).
// Der WebSocket antwortet unter /websocket (Supervisor, Add-on) und unter /api/websocket (direkter Zugang mit Token).
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// „ws" gehört zum Server-Paket (pnpm legt es nur dort ab)
const { WebSocketServer } = createRequire(join(import.meta.dirname, '..', 'packages', 'server', 'package.json'))('ws');

const cap = (n) => n[0].toUpperCase() + n.slice(1);

/**
 * @param {{ port: number; first: string; second: string; token?: string }} opts
 * first ist die erste Person (der angemeldete Administrator), second die zweite.
 * token: Long-Lived-Token, den das nachgebaute Home Assistant verlangt (ohne Angabe jeder).
 */
export async function startMockHa({ port, first, second, token }) {
  const iso = () => new Date().toISOString();
  const states = new Map();
  const subs = new Set(); // { ws, id, entities: string[], to?: string }
  const pushes = [];
  const published = []; // POST /api/states/<entity> der App (Sensoren)
  const eventSubs = new Set(); // { ws, id, eventType }
  let wrongTokens = 0;

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

  setState(`person.${first}`, 'home', { friendly_name: cap(first), user_id: `dev-${first}` });
  setState(`person.${second}`, 'home', { friendly_name: cap(second), user_id: `ha-${second}-e2e` });
  setState('sensor.waschmaschine_leistung', '120', { friendly_name: 'Waschmaschine Leistung', unit_of_measurement: 'W' });
  setState('binary_sensor.waschmaschine_tuer', 'off', { friendly_name: 'Waschmaschine Tür' });
  // Haus-Kanäle: ein Lautsprecher, eine Lampe und ein Sprachdienst
  setState('media_player.kinderzimmer', 'idle', { friendly_name: 'Kinderzimmer', volume_level: 0.3 });
  setState('light.flur', 'off', { friendly_name: 'Flur' });
  setState('tts.piper', 'unknown', { friendly_name: 'Piper' });
  /** Aufrufe von tts, media_player, light und scene, abrufbar unter /mock/calls */
  const calls = [];
  /** gemerkte Zustände der Szenen (scene.create) */
  const scenes = new Map();

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
    const mock = url.pathname.startsWith('/mock/');
    if (!mock && token && req.headers.authorization !== `Bearer ${token}`) {
      wrongTokens += 1;
      return send({ message: '401: Unauthorized' }, 401);
    }
    if (req.method === 'GET' && url.pathname === '/api/config') return send({ time_zone: 'Europe/Berlin' });
    if (req.method === 'GET' && url.pathname === '/api/services') {
      return send([{ domain: 'notify', services: { [`mobile_app_${first}_e2e`]: {}, [`mobile_app_${second}_e2e`]: {} } }]);
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/states/')) {
      const b = await body(req);
      published.push({ entityId: url.pathname.split('/').pop(), state: b.state });
      return send({});
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/services/notify/')) {
      pushes.push({ service: url.pathname.split('/').pop(), ...(await body(req)) });
      return send([]);
    }
    if (req.method === 'POST' && /^\/api\/services\/(tts|media_player|light|scene)\//.test(url.pathname)) {
      const [, , , domain, service] = url.pathname.split('/');
      const b = await body(req);
      calls.push({ domain, service, data: b });
      // Ein bisschen Verhalten, damit sich „Lampe leuchtet und wird zurückgestellt" prüfen lässt
      if (domain === 'scene' && service === 'create') {
        scenes.set(b.scene_id, (b.snapshot_entities ?? []).map((id) => ({ ...states.get(id) })));
        setState(`scene.${b.scene_id}`, 'scening', { friendly_name: b.scene_id });
      } else if (domain === 'scene' && service === 'turn_on') {
        for (const snap of scenes.get(String(b.entity_id).slice('scene.'.length)) ?? []) setState(snap.entity_id, snap.state, snap.attributes);
      } else if (domain === 'scene' && service === 'delete') {
        scenes.delete(String(b.entity_id).slice('scene.'.length));
        states.delete(b.entity_id);
      } else if (domain === 'light' && service === 'turn_on') {
        setState(b.entity_id, 'on', { rgb_color: b.rgb_color, brightness_pct: b.brightness_pct });
      } else if (domain === 'media_player' && service === 'volume_set') {
        setState(b.entity_id, states.get(b.entity_id)?.state ?? 'idle', { volume_level: b.volume_level });
      }
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
    if (req.method === 'GET' && url.pathname === '/mock/calls') return send(calls);
    if (req.method === 'POST' && url.pathname === '/mock/calls/clear') {
      calls.length = 0;
      return send({ ok: true });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/mock/entity/')) return send(states.get(url.pathname.slice('/mock/entity/'.length)) ?? null);
    if (req.method === 'GET' && url.pathname === '/mock/pushes') return send(pushes);
    if (req.method === 'GET' && url.pathname === '/mock/published') return send(published);
    if (req.method === 'GET' && url.pathname === '/mock/wrong-tokens') return send({ count: wrongTokens });
    if (req.method === 'POST' && url.pathname === '/mock/pushes/clear') {
      pushes.length = 0;
      return send({ ok: true });
    }
    return send({ error: 'unbekannt' }, 404);
  });

  const wss = new WebSocketServer({ noServer: true });
  http.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path !== '/websocket' && path !== '/api/websocket') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
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
          if (token && msg.access_token !== token) {
            wrongTokens += 1;
            return ws.send(JSON.stringify({ type: 'auth_invalid', message: 'Invalid access token' }));
          }
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
          return ok([{ id: `dev-${first}`, is_owner: true, is_active: true, system_generated: false, group_ids: ['system-admin'] }]);
        case 'person/list':
          return ok({ storage: [{ name: cap(first), user_id: `dev-${first}` }, { name: cap(second), user_id: `ha-${second}-e2e` }], config: [] });
        case 'lovelace/dashboards/list':
          return ok([]);
        default:
          return ws.send(JSON.stringify({ id: msg.id, type: 'result', success: false, error: { message: `unbekannter Befehl ${msg.type}` } }));
      }
    });
  });
  await new Promise((resolve) => http.listen(port, '127.0.0.1', resolve));
  return { cap, setState };
}
