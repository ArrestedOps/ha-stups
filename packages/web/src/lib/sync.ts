import type { Changes } from './delta';

/** Was eine Meldung mitbringt; ohne Angabe lädt der Client alles neu */
export interface SyncInfo {
  changes?: Changes;
  /** Eine Meldung fehlt dazwischen: die Angaben reichen nicht */
  gap: boolean;
}

/**
 * Live-Sync: Der Server meldet jede Änderung per WebSocket und sagt dazu, welche Karten sich geändert haben.
 * Der Client holt dann nur diese nach. Nach einem Verbindungsabbruch (z. B. iPhone im Hintergrund) wird
 * neu verbunden und alles neu geladen; ebenso, wenn eine Meldung fehlt.
 */
export function startSync(onChange: (info?: SyncInfo) => void, setOnline: (online: boolean) => void): void {
  let ws: WebSocket | null = null;
  let retry = 0;
  let first = true;
  /** Nummer der letzten Meldung; null: noch keine seit dem (Wieder-)Verbinden bekannt */
  let last: number | null = null;

  const url = () => {
    const u = new URL('api/events', location.href);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.toString();
  };

  function connect() {
    try {
      ws = new WebSocket(url());
    } catch {
      setTimeout(connect, 5000);
      return;
    }
    ws.onopen = () => {
      retry = 0;
      setOnline(true);
    };
    ws.onmessage = (e) => {
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
    ws.onclose = () => {
      setOnline(false);
      last = null;
      setTimeout(connect, Math.min(1000 * 2 ** retry++, 15_000));
    };
    ws.onerror = () => ws?.close();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!ws || ws.readyState > 1) connect();
    onChange();
  });
  connect();
}
