import type { FastifyInstance } from 'fastify';
import type { ActionTokens } from './ntfy.js';
import { PUSH_ACTION_PATH, TEST_ACTION } from './push.js';
import type { ActionResult, Notifier } from './notifications.js';
import type { Store } from './store.js';

export interface PushActionDeps {
  tokens: ActionTokens;
  notifier: Pick<Notifier, 'handleAction'>;
  store: Pick<Store, 'userById'>;
  log?: { info: (m: string) => void; warn: (m: string) => void };
}

/** Wann eine Person zuletzt auf den Testknopf getippt hat (nur im Speicher: es geht um „funktioniert der Rückweg gerade?") */
export function createRoundTrips(now: () => Date = () => new Date()) {
  const seen = new Map<string, string>();
  return {
    record: (personId: string): void => void seen.set(personId, now().toISOString()),
    last: (personId: string): string | null => seen.get(personId) ?? null,
  };
}
export type RoundTrips = ReturnType<typeof createRoundTrips>;

/**
 * Der Rückweg für Knöpfe in ntfy-Nachrichten. Das Handy ruft ihn ohne Sitzung auf; erlaubt ist, was das signierte Token
 * in der Anfrage trägt (eine Aktion für eine Person, begrenzt gültig). Die Antwort ist immer 200, solange das Token gilt:
 * „schon erledigt" ist für den Knopf kein Fehler, sonst bliebe die Nachricht stehen.
 */
export async function pushActionRoutes(app: FastifyInstance, deps: PushActionDeps & { roundTrips: RoundTrips }): Promise<void> {
  app.post(PUSH_ACTION_PATH, async (req, reply) => {
    // Das Token steht als Text im Rumpf (Content-Type text/plain); als JSON { "token": … } geht es auch.
    // Eine Sperre nach Fehlversuchen gibt es hier bewusst nicht: Ein Token zu erraten ist aussichtslos (HMAC-SHA-256), und hinter
    // einem Reverse Proxy sähe jede Anfrage gleich aus, so dass ein Angreifer mit einer Sperre die Knöpfe aller lahmlegen könnte.
    const raw = typeof req.body === 'string' ? req.body : (req.body as { token?: unknown } | null)?.token;
    const claim = deps.tokens.verify(typeof raw === 'string' ? raw.trim() : raw);
    if (!claim) return reply.code(403).send({ error: 'Der Knopf ist abgelaufen oder ungültig' });
    const person = deps.store.userById(claim.personId);
    if (!person) return reply.code(403).send({ error: 'Die Person gibt es nicht mehr' });

    if (claim.action === TEST_ACTION) {
      deps.roundTrips.record(person.id);
      deps.log?.info(`Push-Rückweg getestet von ${person.name}`);
      return { result: 'test' };
    }
    const result: ActionResult = await deps.notifier.handleAction({ action: claim.action, personId: person.id });
    return { result };
  });
}
