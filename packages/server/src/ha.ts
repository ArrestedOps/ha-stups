import { t } from './i18n/index.js';
import WebSocket from 'ws';

export interface NotificationAction {
  action: string;
  deviceId?: string;
  userId?: string;
}

/** Zustand einer Entität, wie ihn `get_states` liefert */
export interface HaState {
  entity_id: string;
  state: string;
  last_changed?: string;
  attributes?: Record<string, any>;
}

interface Sub {
  key: string;
  payload: Record<string, unknown>;
  onEvent: (event: Record<string, any>) => void;
  onResult?: (ok: boolean, error?: string) => void;
  id?: number;
  active?: boolean;
}

export interface ProbeStep {
  ok: boolean;
  error?: string;
}

/** Ergebnis des Wächter-Tests (Diagnose-Seite) */
export interface WatcherProbe {
  /** Darf die App alle Zustände lesen? */
  states: ProbeStep & { count?: number };
  /** Personen aus Home Assistant mit Zustand und Benutzer (für „wer ist zu Hause") */
  persons: { entityId: string; name: string; state: string; userId: string | null }[];
  /** Die gewählte Entität, falls es sie gibt */
  entity: { entityId: string; state: string; unit: string | null; lastChanged: string | null } | null;
  /** Entität, auf der die Auslöser probeweise abonniert wurden */
  triggerEntity: string | null;
  /** subscribe_trigger mit Zustandswechsel und „für mindestens" */
  stateTrigger: ProbeStep;
  /** subscribe_trigger mit Zahlenwert und „für mindestens" */
  numericTrigger: ProbeStep;
}

export interface HaStatus {
  /** WebSocket open and authenticated */
  connected: boolean;
  /** Subscribed to mobile_app_notification_action */
  subscribed: boolean;
  lastError: string | null;
  eventsReceived: number;
  lastEventAt: string | null;
  /** Seit wann die Verbindung fehlt (null, solange sie steht); beim Start gilt der Start als Beginn */
  lostSince: string | null;
}

export interface HaClientOptions {
  /** e.g. http://supervisor/core */
  baseUrl: string;
  token: string;
  fetchFn?: typeof fetch;
  /** Defaults to baseUrl with ws scheme + /websocket */
  wsUrl?: string;
  reconnectDelayMs?: number;
  /** Zeitlimit je REST-Anfrage; ohne eines würde ein hängender Aufruf alle Erinnerungen blockieren. */
  requestTimeoutMs?: number;
}

export class HaClient {
  private readonly fetchFn: typeof fetch;
  private readonly wsUrl: string;
  private readonly reconnectDelayMs: number;
  private readonly listeners: ((a: NotificationAction) => void)[] = [];
  private readonly subs = new Map<string, Sub>();
  private readonly byId = new Map<number, Sub>();
  private readonly connectedListeners: (() => void)[] = [];
  private ready = false;
  private nextId = 2;
  private socket: WebSocket | undefined;
  private timer: NodeJS.Timeout | undefined;
  private closed = false;
  private state: HaStatus = {
    connected: false,
    subscribed: false,
    lastError: null,
    eventsReceived: 0,
    lastEventAt: null,
    lostSince: new Date().toISOString(),
  };

  /** Steht die Verbindung, und seit wann fehlt sie? (für „Zuhause") */
  connection(): { connected: boolean; lostSince: string | null } {
    return { connected: this.state.connected, lostSince: this.state.lostSince };
  }

  status(): HaStatus {
    return { ...this.state };
  }

  constructor(private readonly opts: HaClientOptions) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.wsUrl = opts.wsUrl ?? `${opts.baseUrl.replace(/^http/, 'ws')}/websocket`;
    this.reconnectDelayMs = opts.reconnectDelayMs ?? 5000;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await this.fetchFn(`${this.opts.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.opts.token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.opts.requestTimeoutMs ?? 15_000),
    });
    if (!res.ok) {
      throw new Error(`HA ${method} ${path} -> ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async callService(domain: string, service: string, data: Record<string, unknown>): Promise<void> {
    await this.request('POST', `/api/services/${domain}/${service}`, data);
  }

  async listNotifyServices(): Promise<string[]> {
    const all = (await this.request('GET', '/api/services')) as {
      domain: string;
      services: Record<string, unknown>;
    }[];
    return Object.keys(all.find((d) => d.domain === 'notify')?.services ?? {}).sort();
  }

  async getConfig(): Promise<{ time_zone: string }> {
    return (await this.request('GET', '/api/config')) as { time_zone: string };
  }

  async setState(entityId: string, state: string, attributes: Record<string, unknown>): Promise<void> {
    await this.request('POST', `/api/states/${entityId}`, { state, attributes });
  }

  /** Einmaliger WebSocket-Befehl auf eigener Verbindung (z. B. für Listen, die es per REST nicht gibt). */
  wsCommand<T>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      const timer = setTimeout(() => finish(new Error(t('Zeitüberschreitung bei Home Assistant'))), timeoutMs);
      let settled = false;
      const finish = (err: Error | null, value?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.terminate();
        if (err) reject(err);
        else resolve(value as T);
      };
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as Record<string, any>;
        if (msg.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: this.opts.token }));
        else if (msg.type === 'auth_ok') ws.send(JSON.stringify({ id: 1, type, ...payload }));
        else if (msg.type === 'auth_invalid') finish(new Error(`Anmeldung abgelehnt: ${msg.message ?? ''}`));
        else if (msg.type === 'result' && msg.id === 1) {
          if (msg.success) finish(null, msg.result as T);
          else finish(new Error(msg.error?.message ?? t('Befehl fehlgeschlagen')));
        }
      });
      ws.on('error', (err) => finish(err));
      ws.on('close', () => finish(new Error(t('Verbindung zu Home Assistant geschlossen'))));
    });
  }

  /**
   * Prüft am echten System, ob Wächter möglich sind: Darf die App alle Zustände lesen (`get_states`) und
   * Auslöser abonnieren (`subscribe_trigger`, mit Wartezeit, auch für Zahlenwerte)? Nur lesend, das Abo wird sofort beendet.
   */
  async probeWatchers(entityId?: string, timeoutMs = 10_000): Promise<WatcherProbe> {
    return new Promise<WatcherProbe>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      const timer = setTimeout(() => finish(new Error(t('Zeitüberschreitung bei Home Assistant'))), timeoutMs);
      let settled = false;
      let nextId = 1;
      const waiting = new Map<number, (m: Record<string, any>) => void>();
      const finish = (err: Error | null, value?: WatcherProbe) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.terminate();
        if (err) reject(err);
        else resolve(value as WatcherProbe);
      };
      const send = (type: string, payload: Record<string, unknown> = {}) =>
        new Promise<{ id: number; success: boolean; result?: any; error?: string }>((res) => {
          const id = nextId++;
          waiting.set(id, (m) => res({ id, success: m.success === true, result: m.result, error: m.error?.message }));
          ws.send(JSON.stringify({ id, type, ...payload }));
        });
      const trigger = async (t: Record<string, unknown>): Promise<ProbeStep> => {
        const r = await send('subscribe_trigger', { trigger: t });
        if (!r.success) return { ok: false, error: r.error ?? 'abgelehnt' };
        await send('unsubscribe_events', { subscription: r.id });
        return { ok: true };
      };
      const run = async () => {
        const probe: WatcherProbe = {
          states: { ok: false },
          persons: [],
          entity: null,
          triggerEntity: null,
          stateTrigger: { ok: false },
          numericTrigger: { ok: false },
        };
        const states = await send('get_states');
        if (states.success) {
          const list = states.result as { entity_id: string; state: string; last_changed?: string; attributes?: Record<string, any> }[];
          probe.states = { ok: true, count: list.length };
          probe.persons = list
            .filter((s) => s.entity_id.startsWith('person.'))
            .map((s) => ({
              entityId: s.entity_id,
              name: String(s.attributes?.friendly_name ?? s.entity_id),
              state: s.state,
              userId: typeof s.attributes?.user_id === 'string' ? s.attributes.user_id : null,
            }));
          const e = entityId ? list.find((s) => s.entity_id === entityId) : undefined;
          if (e) {
            probe.entity = {
              entityId: e.entity_id,
              state: e.state,
              unit: typeof e.attributes?.unit_of_measurement === 'string' ? e.attributes.unit_of_measurement : null,
              lastChanged: e.last_changed ?? null,
            };
          }
        } else {
          probe.states = { ok: false, error: states.error ?? 'abgelehnt' };
        }
        const target = entityId || probe.persons[0]?.entityId || 'sun.sun';
        probe.triggerEntity = target;
        probe.stateTrigger = await trigger({ platform: 'state', entity_id: target, to: 'on', for: { minutes: 1 } });
        probe.numericTrigger = await trigger({ platform: 'numeric_state', entity_id: target, below: 5, for: { minutes: 3 } });
        return probe;
      };
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as Record<string, any>;
        if (msg.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: this.opts.token }));
        else if (msg.type === 'auth_ok') run().then((p) => finish(null, p), (e: Error) => finish(e));
        else if (msg.type === 'auth_invalid') finish(new Error(`Anmeldung abgelehnt: ${msg.message ?? ''}`));
        else if (msg.type === 'result') waiting.get(msg.id)?.(msg);
      });
      ws.on('error', (err) => finish(err));
      ws.on('close', () => finish(new Error(t('Verbindung zu Home Assistant geschlossen'))));
    });
  }

  /** Dashboards von Home Assistant: das Standard-Dashboard plus alle eigenen. */
  async listDashboards(): Promise<{ title: string; path: string }[]> {
    const list = await this.wsCommand<{ url_path: string; title: string }[]>('lovelace/dashboards/list');
    return [
      { title: 'Standard-Dashboard', path: '/' },
      ...list.map((d) => ({ title: d.title || d.url_path, path: `/${d.url_path}` })),
    ];
  }

  onNotificationAction(cb: (a: NotificationAction) => void): void {
    this.listeners.push(cb);
  }

  /**
   * Holt ein Bild von Home Assistant (z. B. das `entity_picture` einer Person: /api/image_proxy/… oder /local/…). Nur Pfade auf
   * Home Assistant selbst, keine fremden Adressen. null, wenn es das Bild nicht gibt.
   */
  async fetchPicture(path: string, maxBytes = 2 * 1024 * 1024): Promise<Buffer | null> {
    if (!path.startsWith('/') || path.startsWith('//')) return null;
    const res = await this.fetchFn(`${this.opts.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.opts.token}` },
      signal: AbortSignal.timeout(this.opts.requestTimeoutMs ?? 15_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HA GET ${path} -> ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    return bytes.length > maxBytes ? null : bytes;
  }

  /** Alle Zustände (für die Suche und für den Abgleich nach einem Verbindungsabbruch) */
  async getStates(): Promise<HaState[]> {
    return (await this.wsCommand<HaState[]>('get_states', {}, 15_000)) ?? [];
  }

  /**
   * Abo auf der dauerhaften Verbindung, z. B. `{ type: 'subscribe_trigger', trigger: { … } }` oder
   * `{ type: 'subscribe_events', event_type: '…' }`. Es wird nach jedem Verbindungsabbruch von selbst neu angelegt.
   * Unter demselben Schlüssel ersetzt ein neues Abo das alte. Gibt eine Funktion zum Beenden zurück.
   */
  subscribe(key: string, payload: Record<string, unknown>, onEvent: (event: Record<string, any>) => void, onResult?: (ok: boolean, error?: string) => void): () => void {
    this.unsubscribe(key);
    const sub: Sub = { key, payload, onEvent, onResult };
    this.subs.set(key, sub);
    this.startSub(sub);
    return () => this.unsubscribe(key);
  }

  unsubscribe(key: string): void {
    const sub = this.subs.get(key);
    if (!sub) return;
    this.subs.delete(key);
    if (sub.id !== undefined) {
      this.byId.delete(sub.id);
      if (this.ready) this.socket?.send(JSON.stringify({ id: this.nextId++, type: 'unsubscribe_events', subscription: sub.id }));
    }
  }

  /** Läuft nach jeder (Wieder-)Verbindung, wenn alle Abos wieder angelegt sind */
  onConnected(cb: () => void): void {
    this.connectedListeners.push(cb);
  }

  /** Schlüssel der Abos, die Home Assistant gerade bestätigt hat */
  activeSubscriptions(): string[] {
    return [...this.subs.values()].filter((s) => s.active).map((s) => s.key);
  }

  private startSub(sub: Sub): void {
    if (!this.ready || !this.socket) return;
    sub.id = this.nextId++;
    sub.active = false;
    this.byId.set(sub.id, sub);
    this.socket.send(JSON.stringify({ id: sub.id, ...sub.payload }));
  }

  connect(): void {
    this.closed = false;
    const ws = new WebSocket(this.wsUrl);
    this.socket = ws;

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as Record<string, any>;
      const sub = typeof msg.id === 'number' ? this.byId.get(msg.id) : undefined;
      if (sub) {
        if (msg.type === 'result') {
          sub.active = msg.success === true;
          const error = msg.success === true ? undefined : `${msg.error?.message ?? 'abgelehnt'}`;
          if (error) this.state.lastError = `Abo „${sub.key}" fehlgeschlagen: ${error}`;
          sub.onResult?.(msg.success === true, error);
        } else if (msg.type === 'event') {
          try {
            sub.onEvent(msg.event ?? {});
          } catch (err) {
            this.state.lastError = `Abo „${sub.key}": ${err instanceof Error ? err.message : String(err)}`;
          }
        }
        return;
      }
      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: this.opts.token }));
      } else if (msg.type === 'auth_ok') {
        this.state.connected = true;
        this.state.lostSince = null;
        this.state.lastError = null;
        ws.send(
          JSON.stringify({
            id: 1,
            type: 'subscribe_events',
            event_type: 'mobile_app_notification_action',
          }),
        );
        // alle angemeldeten Abos neu anlegen (die Nummern gelten nur je Verbindung)
        this.ready = true;
        this.nextId = 2;
        this.byId.clear();
        for (const s of this.subs.values()) this.startSub(s);
        for (const cb of this.connectedListeners) {
          try {
            cb();
          } catch (err) {
            this.state.lastError = `Nach dem Verbinden: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
      } else if (msg.type === 'auth_invalid') {
        this.state.lastError = `Anmeldung abgelehnt: ${msg.message ?? 'unbekannt'}`;
      } else if (msg.type === 'result' && msg.id === 1) {
        this.state.subscribed = msg.success === true;
        if (msg.success !== true) {
          this.state.lastError = `Abo fehlgeschlagen: ${msg.error?.message ?? 'unbekannt'}`;
        }
      } else if (msg.type === 'event' && msg.event?.event_type === 'mobile_app_notification_action') {
        this.state.eventsReceived += 1;
        this.state.lastEventAt = new Date().toISOString();
        const d = msg.event.data ?? {};
        const action: NotificationAction = {
          action: String(d.action ?? ''),
          deviceId: d.device_id,
          userId: msg.event.context?.user_id,
        };
        for (const l of this.listeners) l(action);
      }
    });
    ws.on('error', (err) => {
      this.state.lastError = `Verbindungsfehler: ${err.message}`;
    });
    ws.on('close', () => {
      if (this.state.connected || this.state.lostSince === null) this.state.lostSince = new Date().toISOString();
      this.state.connected = false;
      this.state.subscribed = false;
      this.ready = false;
      for (const s of this.subs.values()) {
        s.active = false;
        s.id = undefined;
      }
      this.byId.clear();
      if (this.closed) return;
      this.timer = setTimeout(() => this.connect(), this.reconnectDelayMs);
    });
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.socket?.terminate();
  }
}
