import WebSocket from 'ws';

export interface NotificationAction {
  action: string;
  deviceId?: string;
  userId?: string;
}

export interface HaStatus {
  /** WebSocket open and authenticated */
  connected: boolean;
  /** Subscribed to mobile_app_notification_action */
  subscribed: boolean;
  lastError: string | null;
  eventsReceived: number;
  lastEventAt: string | null;
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
  private socket: WebSocket | undefined;
  private timer: NodeJS.Timeout | undefined;
  private closed = false;
  private state: HaStatus = {
    connected: false,
    subscribed: false,
    lastError: null,
    eventsReceived: 0,
    lastEventAt: null,
  };

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
      const timer = setTimeout(() => finish(new Error('Zeitüberschreitung bei Home Assistant')), timeoutMs);
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
          else finish(new Error(msg.error?.message ?? 'Befehl fehlgeschlagen'));
        }
      });
      ws.on('error', (err) => finish(err));
      ws.on('close', () => finish(new Error('Verbindung zu Home Assistant geschlossen')));
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

  connect(): void {
    this.closed = false;
    const ws = new WebSocket(this.wsUrl);
    this.socket = ws;

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as Record<string, any>;
      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: this.opts.token }));
      } else if (msg.type === 'auth_ok') {
        this.state.connected = true;
        this.state.lastError = null;
        ws.send(
          JSON.stringify({
            id: 1,
            type: 'subscribe_events',
            event_type: 'mobile_app_notification_action',
          }),
        );
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
      this.state.connected = false;
      this.state.subscribed = false;
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
