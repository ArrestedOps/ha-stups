import type { Changes } from './delta';

/** Was eine Meldung mitbringt; ohne Angabe lädt der Client alles neu */
export interface SyncInfo {
  changes?: Changes;
  /** Eine Meldung fehlt dazwischen: die Angaben reichen nicht */
  gap: boolean;
}

/**
 * Live-Sync: Der Server meldet jede Änderung per WebSocket und sagt dazu, welche Aufgaben sich geändert haben.
 * Der Client holt dann nur diese nach. Nach einem Verbindungsabbruch (z. B. iPhone im Hintergrund) wird
 * neu verbunden und alles neu geladen; ebenso, wenn eine Meldung fehlt.
 */
/** Was `startSync` von der Umgebung braucht; im Browser die echten Objekte, im Test Ersatz */
export interface SyncEnv {
  create(url: string): WebSocket;
  url(): string;
  /** `awayMs`: wie lange die App unsichtbar war (fehlt: unbekannt, zählt als kurz) */
  onVisible(cb: (awayMs?: number) => void): void;
}

/** Nach so langer Abwesenheit gilt eine „offene" Verbindung als tot (iOS beendet sie im Hintergrund still) */
const STALE_AFTER_MS = 5000;

const browserEnv: SyncEnv = {
  create: (url) => new WebSocket(url),
  url: () => {
    const u = new URL('api/events', location.href);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.toString();
  },
  onVisible: (cb) => {
    let hiddenAt: number | null = null;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else {
        cb(hiddenAt === null ? undefined : Date.now() - hiddenAt);
        hiddenAt = null;
      }
    });
    // Netz kommt zurück (z. B. WLAN nach dem Aufwachen): sofort neu verbinden
    window.addEventListener('online', () => cb(Infinity));
  },
};

export function startSync(
  onChange: (info?: SyncInfo) => void,
  setOnline: (online: boolean) => void,
  env: SyncEnv = browserEnv,
): void {
  let ws: WebSocket | null = null;
  let retry = 0;
  let first = true;
  /** Nummer der letzten Meldung; null: noch keine seit dem (Wieder-)Verbinden bekannt */
  let last: number | null = null;
  /** Höchstens ein geplanter Verbindungsversuch zugleich */
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule(ms: number) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      connect();
    }, ms);
  }

  function connect() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // Es gibt nie zwei Verbindungen: läuft eine (verbindend oder offen), bleibt es dabei
    if (ws && ws.readyState <= 1) return;
    let sock: WebSocket;
    try {
      sock = env.create(env.url());
    } catch {
      schedule(5000);
      return;
    }
    ws = sock;
    // Ereignisse einer ersetzten Verbindung zählen nicht (sonst „offline“ und falsche Lücken trotz offener Verbindung)
    const current = () => ws === sock;
    sock.onopen = () => {
      if (!current()) return;
      retry = 0;
      setOnline(true);
    };
    sock.onmessage = (e) => {
      if (!current()) return;
      let msg: { type?: string; seq?: number; changes?: Changes };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.type === 'hello') {
        last = typeof msg.seq === 'number' ? msg.seq : null;
        if (first) first = false;
        else onChange(); // nach dem Wiederverbinden alles neu laden
      } else if (msg.type === 'changed') {
        const seq = typeof msg.seq === 'number' ? msg.seq : null;
        const gap = seq === null || last === null || seq !== last + 1;
        last = seq;
        onChange({ changes: msg.changes, gap });
      }
    };
    sock.onclose = () => {
      if (!current()) return;
      setOnline(false);
      last = null;
      schedule(Math.min(1000 * 2 ** retry++, 15_000));
    };
    sock.onerror = () => sock.close();
  }

  env.onVisible((awayMs = 0) => {
    if (ws && ws.readyState <= 1 && awayMs >= STALE_AFTER_MS) {
      // Zombie-Verbindung: wirkt offen, ist aber tot. Verwerfen und frisch verbinden.
      const old = ws;
      ws = null; // ab jetzt zählen Ereignisse des alten Sockets nicht mehr
      retry = 0;
      try {
        old.close();
      } catch {
        /* schon zu */
      }
    }
    if (!ws || ws.readyState > 1) connect();
    onChange();
  });
  connect();
}
