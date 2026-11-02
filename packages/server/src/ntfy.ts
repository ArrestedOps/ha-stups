import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NtfyConfig } from './runtime.js';
import { PUSH_ACTION_PATH, type PushGateway, type PushMessage } from './push.js';

const DAY_MS = 86_400_000;
/** So lange gilt der Knopf in einer Nachricht: danach meldet er sich nicht mehr zurück */
export const ACTION_TTL_MS = 14 * DAY_MS;
const REQUEST_TIMEOUT_MS = 15_000;
/** ntfy erlaubt höchstens drei Knöpfe */
const MAX_ACTIONS = 3;

// ---------- Signierte Knöpfe ----------

export interface ActionClaim {
  /** Person, für die der Knopf gedacht ist */
  personId: string;
  /** Kennung der Aktion, so wie der Notifier sie versteht */
  action: string;
}

/**
 * Ein Knopf in einer ntfy-Nachricht ruft Stups ohne Anmeldung auf. Damit er nur das darf, wofür er gebaut wurde, trägt er ein
 * Token: Person, Aktion und Ablaufzeit, mit einem Geheimnis aus der Datenbank signiert. Wer es verändert, ist abgewiesen.
 */
export function createActionTokens(deps: { secret: () => string; now?: () => number }) {
  const now = deps.now ?? Date.now;
  const mac = (payload: string): Buffer => createHmac('sha256', deps.secret()).update(payload).digest();

  return {
    sign(claim: ActionClaim, ttlMs: number = ACTION_TTL_MS): string {
      const payload = Buffer.from(JSON.stringify([claim.personId, claim.action, Math.floor((now() + ttlMs) / 1000)])).toString('base64url');
      return `${payload}.${mac(payload).toString('base64url')}`;
    },
    verify(token: unknown): ActionClaim | null {
      if (typeof token !== 'string' || token.length > 2000) return null;
      const dot = token.indexOf('.');
      if (dot < 1) return null;
      const payload = token.slice(0, dot);
      const given = Buffer.from(token.slice(dot + 1), 'base64url');
      const want = mac(payload);
      if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
      try {
        const [personId, action, expires] = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as [unknown, unknown, unknown];
        if (typeof personId !== 'string' || typeof action !== 'string' || typeof expires !== 'number') return null;
        if (expires * 1000 <= now()) return null;
        return { personId, action };
      } catch {
        return null;
      }
    },
  };
}
export type ActionTokens = ReturnType<typeof createActionTokens>;

// ---------- Push über ntfy ----------

export interface NtfyDeps {
  config: NtfyConfig;
  /** Thema der Person (null = keines) */
  topicFor: (userId: string) => string | null;
  /** Adresse, unter der Handys Stups erreichen. Ohne sie gibt es weder Link noch Knöpfe in der Nachricht. */
  publicUrl: string | null;
  tokens: ActionTokens;
  fetch?: typeof fetch;
  log?: { warn: (msg: string) => void };
}

const PRIORITY = { 'time-sensitive': 4, active: 3, passive: 2 } as const;

/** Push über einen ntfy-Server (https://ntfy.sh): ein Thema je Person, Link zur Karte, Knöpfe, die über Stups zurückmelden */
export function createNtfyPush(deps: NtfyDeps): PushGateway {
  const doFetch = deps.fetch ?? fetch;
  const { config } = deps;
  let warnedUrl = false;

  const authHeader = (): Record<string, string> => {
    if (config.token) return { authorization: `Bearer ${config.token}` };
    if (config.username !== undefined && config.password !== undefined) {
      return { authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}` };
    }
    return {};
  };

  async function request(method: string, url: string, body?: unknown): Promise<Response> {
    return doFetch(url, {
      method,
      headers: { ...authHeader(), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  function payload(userId: string, topic: string, m: PushMessage): Record<string, unknown> {
    const out: Record<string, unknown> = {
      topic,
      title: m.title,
      message: m.body,
      priority: m.level ? PRIORITY[m.level] : 3,
      // Gleiche Kennung ersetzt die ältere Nachricht (ntfy ab 2.16; ältere Server legen eine neue an)
      sequence_id: m.tag,
    };
    if (deps.publicUrl) {
      out.click = m.open?.cardId ? `${deps.publicUrl}/?card=${encodeURIComponent(m.open.cardId)}` : `${deps.publicUrl}/`;
      if (m.actions?.length) {
        out.actions = m.actions.slice(0, MAX_ACTIONS).map((a) => ({
          action: 'http',
          label: a.title,
          url: `${deps.publicUrl}${PUSH_ACTION_PATH}`,
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: deps.tokens.sign({ personId: userId, action: a.id }),
          clear: true,
        }));
      }
    } else if (!warnedUrl) {
      warnedUrl = true;
      deps.log?.warn('STUPS_PUBLIC_URL fehlt: Nachrichten über ntfy kommen ohne Link zur Karte und ohne Knöpfe');
    }
    return out;
  }

  return {
    canReach: (userId) => deps.topicFor(userId) !== null,
    async send(userId, message) {
      const topic = deps.topicFor(userId);
      if (!topic) return false;
      try {
        const res = await request('POST', config.url, payload(userId, topic, message));
        if (res.ok) return true;
        deps.log?.warn(`ntfy hat die Nachricht abgelehnt (${res.status}${res.status === 401 || res.status === 403 ? ': Zugang prüfen' : ''})`);
      } catch (err) {
        deps.log?.warn(`ntfy nicht erreichbar: ${String(err)}`);
      }
      return false;
    },
    async clear(userId, tag) {
      const topic = deps.topicFor(userId);
      if (!topic) return;
      try {
        // Ältere Server kennen das Löschen per Kennung nicht; dann bleibt die Nachricht stehen und „Erledigt" meldet „schon erledigt"
        await request('DELETE', `${config.url}/${encodeURIComponent(topic)}/${encodeURIComponent(tag)}`);
      } catch {
        /* Aufräumen ist eine Gefälligkeit */
      }
    },
  };
}
