/**
 * Live-Sync: Der Server meldet jede Änderung per WebSocket, der Client lädt dann nach.
 * Nach einem Verbindungsabbruch (z. B. iPhone im Hintergrund) wird neu verbunden und alles neu geladen.
 */
export function startSync(onChange: () => void, setOnline: (online: boolean) => void): void {
  let ws: WebSocket | null = null;
  let retry = 0;
  let first = true;

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
      let msg: { type?: string };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.type === 'hello') {
        if (first) first = false;
        else onChange(); // nach dem Wiederverbinden alles neu laden
      } else if (msg.type === 'changed') {
        onChange();
      }
    };
    ws.onclose = () => {
      setOnline(false);
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
