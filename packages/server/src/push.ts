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
  /**
   * Art der Nachricht, nur für den Haus-Weg (Ansage, Lampe): ohne Angabe erreicht sie das Haus nie
   * (Tageszusammenfassung, Rückmeldungen, Test).
   */
  kind?: PushKind;
  /** Kurzer Satz zum Vorlesen, in der Sprache des Empfängers (nur mit `kind`) */
  spoken?: string;
  /** Der Stups, zu dem die Nachricht gehört (nur bei `kind: 'nudge'`): damit die Warteschlange prüfen kann, ob er noch offen ist */
  nudgeId?: string;
}

/** Stups, Fälligkeit (auch Vorab-Erinnerung und Nachhaken) oder Karte eines Wächters */
export type PushKind = 'nudge' | 'due' | 'watcher';

export interface PushGateway {
  /**
   * Zusatzweg (Haus: Ansage, Lampe): sein Ergebnis zählt nur, wenn die Person sonst über keinen Weg erreichbar ist.
   * Ein bewusstes Verwerfen (Ruhezeit, abwesend) meldet dort true und darf eine gescheiterte Zustellung nicht zum Erfolg machen.
   */
  auxiliary?: boolean;
  /**
   * Gibt es für diese Person überhaupt ein Gerät, an das sich senden lässt? Mit `kind` auch: nimmt dieser Weg diese Art von
   * Nachricht an? (Nur der Haus-Weg unterscheidet das: Ansage und Lampe sind je Kanal für bestimmte Arten eingeschaltet.)
   */
  canReach(userId: string, kind?: PushKind): boolean;
  /** true, wenn mindestens ein Gerät die Nachricht angenommen hat */
  send(userId: string, message: PushMessage): Promise<boolean>;
  /** Entfernt die Nachricht mit diesem Tag von den Geräten der Person */
  clear(userId: string, tag: string): Promise<void>;
}

/** Pfad, an den Knöpfe in Nachrichten ohne Home Assistant zurückmelden (siehe push-action.ts) */
export const PUSH_ACTION_PATH = '/api/push/action';

/** Aktion, mit der die Test-Nachricht prüft, ob Knöpfe Stups erreichen */
export const TEST_ACTION = 'STUPS_TEST';

/** Der Knopf Erledigt der Testnachricht aus der Einrichtung: gibt es nur dort, der Notifier ignoriert die Aktion */
export const ONBOARDING_ACTION_DONE = 'STUPS_ONBOARDING_DONE';

/** Kein Weg eingerichtet: niemand ist erreichbar */
export function createNoPush(): PushGateway {
  return { canReach: () => false, send: async () => false, clear: async () => undefined };
}

/** Mehrere Wege nebeneinander: erreichbar über einen von ihnen, gesendet über alle, die die Person kennen */
export function combinePush(gateways: PushGateway[]): PushGateway {
  if (gateways.length === 0) return createNoPush();
  if (gateways.length === 1) return gateways[0]!;
  return {
    canReach: (userId, kind) => gateways.some((g) => g.canReach(userId, kind)),
    async send(userId, message) {
      const reaching = gateways.filter((g) => g.canReach(userId, message.kind));
      const results = await Promise.all(reaching.map(async (g) => ({ aux: g.auxiliary === true, ok: await g.send(userId, message) })));
      // Zählt der eigentliche Zustellweg (Companion App, ntfy), entscheidet er; der Haus-Weg nur, wenn es keinen anderen für die Person gibt
      const primary = results.filter((r) => !r.aux);
      return (primary.length > 0 ? primary : results).some((r) => r.ok);
    },
    async clear(userId, tag) {
      await Promise.allSettled(gateways.map((g) => g.clear(userId, tag)));
    },
  };
}

export interface HaNotifyDeps {
  ha: { callService(domain: string, service: string, data: Record<string, unknown>): Promise<void> };
  /** Notify-Dienste einer Person (ohne Vorsilbe `notify.`) */
  servicesFor: (userId: string) => string[];
  /** Dashboard, das beim Tippen auf die Nachricht öffnet */
  panelPath: () => string;
  /**
   * Adresse von Stups im eigenen Container. Dort gibt es kein Panel in Home Assistant, das sich öffnen ließe:
   * Die Nachricht öffnet dann Stups unter dieser Adresse.
   */
  publicUrl?: string | null;
  log?: { warn: (msg: string) => void };
}

/** Push über die Notify-Dienste von Home Assistant (Companion App), wie bisher. */
export function createHaNotifyPush(deps: HaNotifyDeps): PushGateway {
  const url = (cardId?: string): string => {
    if (deps.publicUrl) return cardId ? `${deps.publicUrl}/?card=${encodeURIComponent(cardId)}` : `${deps.publicUrl}/`;
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
