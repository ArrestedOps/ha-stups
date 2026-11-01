/** Eine Push-Nachricht, unabhängig davon, über welchen Weg sie zugestellt wird. */
export interface PushMessage {
  title: string;
  body: string;
  /** Gleiches Tag ersetzt die ältere Nachricht, und darüber lässt sie sich wieder entfernen */
  tag: string;
  group?: string;
  /** Beim Tippen öffnen: die Karte, sonst die Startseite. Ohne Angabe öffnet die Nachricht nichts Bestimmtes. */
  open?: { cardId?: string };
  level?: 'time-sensitive' | 'active' | 'passive';
  /** Knöpfe in der Nachricht; `id` kommt unverändert als Aktion zurück (siehe Notifier.handleAction) */
  actions?: { id: string; title: string }[];
}

export interface PushGateway {
  /** Gibt es für diese Person überhaupt ein Gerät, an das sich senden lässt? */
  canReach(userId: string): boolean;
  /** true, wenn mindestens ein Gerät die Nachricht angenommen hat */
  send(userId: string, message: PushMessage): Promise<boolean>;
  /** Entfernt die Nachricht mit diesem Tag von den Geräten der Person */
  clear(userId: string, tag: string): Promise<void>;
}

export interface HaNotifyDeps {
  ha: { callService(domain: string, service: string, data: Record<string, unknown>): Promise<void> };
  /** Notify-Dienste einer Person (ohne Vorsilbe `notify.`) */
  servicesFor: (userId: string) => string[];
  /** Dashboard, das beim Tippen auf die Nachricht öffnet */
  panelPath: () => string;
  log?: { warn: (msg: string) => void };
}

/** Push über die Notify-Dienste von Home Assistant (Companion App), wie bisher. */
export function createHaNotifyPush(deps: HaNotifyDeps): PushGateway {
  const url = (cardId?: string): string => {
    const base = deps.panelPath();
    return cardId ? `${base}?card=${cardId}` : base;
  };

  function payload(m: PushMessage): Record<string, unknown> {
    const data: Record<string, unknown> = { tag: m.tag };
    if (m.group) data.group = m.group;
    if (m.open) data.url = url(m.open.cardId);
    if (m.level) data.push = { 'interruption-level': m.level };
    if (m.actions) data.actions = m.actions.map((a) => ({ action: a.id, title: a.title }));
    return { title: m.title, message: m.body, data };
  }

  async function sendAll(userId: string, data: Record<string, unknown>, report: boolean): Promise<boolean> {
    const results = await Promise.allSettled(deps.servicesFor(userId).map((s) => deps.ha.callService('notify', s, data)));
    if (report) for (const r of results) if (r.status === 'rejected') deps.log?.warn(`Push fehlgeschlagen: ${String(r.reason)}`);
    return results.some((r) => r.status === 'fulfilled');
  }

  return {
    canReach: (userId) => deps.servicesFor(userId).length > 0,
    send: (userId, message) => sendAll(userId, payload(message), true),
    async clear(userId, tag) {
      await sendAll(userId, { message: 'clear_notification', data: { tag } }, false);
    },
  };
}
