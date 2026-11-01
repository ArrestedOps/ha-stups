export interface DirectoryPerson {
  name: string;
  /** Benutzer dieser Person (in Home Assistant), falls sie einen hat */
  userId: string | null;
}

/** Port: Personen und Administratoren. Adapter: Home Assistant (unten), feste Liste (Entwicklung und Tests). */
export interface Directory {
  /** null = die Quelle liefert die Benutzerliste nicht (dann entscheidet der Rückfall in access.ts) */
  isAdmin(userId: string): Promise<boolean | null>;
  /** null = nicht abfragbar */
  persons(): Promise<DirectoryPerson[] | null>;
}

/** Eigene Konten (Betrieb ohne Home Assistant): Administrator ist, wer es im Konto ist. Personen pflegt Stups selbst. */
export function createLocalDirectory(accounts: { byExternalId(id: string): { isAdmin: boolean } | null }): Directory {
  return {
    isAdmin: async (id) => accounts.byExternalId(id)?.isAdmin ?? false,
    persons: async () => [],
  };
}

/** Feste Administratorenliste ohne Personen: für die lokale Entwicklung und Tests ohne Home Assistant. */
export function createStaticDirectory(adminIds: string[]): Directory {
  return { isAdmin: async (id) => adminIds.includes(id), persons: async () => [] };
}

interface DirectoryDeps {
  ha: { wsCommand(type: string, payload?: Record<string, unknown>, timeoutMs?: number): Promise<unknown> };
  /** Wie lange ein Ergebnis als frisch gilt */
  ttlMs?: number;
  /** Zeitlimit je Abfrage; jede App-Anfrage hängt daran, wenn noch nichts im Speicher liegt */
  timeoutMs?: number;
  now?: () => number;
}

const asArray = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

/**
 * Personen und Administratoren kommen direkt aus Home Assistant (Websocket `person/list`, `config/auth/list`).
 * Abgelaufene Ergebnisse werden sofort weiterverwendet und im Hintergrund erneuert, damit eine langsame oder
 * unerreichbare Home-Assistant-Instanz die App nicht ausbremst. Bei einem Fehler gilt der letzte Stand weiter.
 */
export function createDirectory(deps: DirectoryDeps): Directory {
  const ttl = deps.ttlMs ?? 60_000;
  const failedTtl = Math.min(ttl, 10_000);
  const timeout = deps.timeoutMs ?? 3000;
  const now = deps.now ?? (() => Date.now());

  function cached<T>(load: () => Promise<T>): () => Promise<T | null> {
    let value: T | null = null;
    let freshUntil = -Infinity;
    let inflight: Promise<void> | null = null;

    const start = (): Promise<void> => {
      inflight ??= load()
        .then((v) => {
          value = v;
          freshUntil = now() + ttl;
        })
        .catch(() => {
          freshUntil = now() + failedTtl; // später noch einmal versuchen, bis dahin gilt der alte Stand
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    };

    return async () => {
      if (now() < freshUntil) return value;
      const refreshing = start();
      if (value === null) await refreshing; // nur beim allerersten Mal warten
      return value;
    };
  }

  const admins = cached(async () => {
    const users = asArray(await deps.ha.wsCommand('config/auth/list', {}, timeout));
    return new Set(
      users
        .filter((u) => !u.system_generated && u.is_active !== false)
        .filter((u) => u.is_owner === true || (Array.isArray(u.group_ids) && u.group_ids.includes('system-admin')))
        .map((u) => String(u.id)),
    );
  });

  const persons = cached(async () => {
    const res = (await deps.ha.wsCommand('person/list', {}, timeout)) as { storage?: unknown; config?: unknown } | null;
    return [...asArray(res?.storage), ...asArray(res?.config)].map((p) => ({
      name: String(p.name ?? ''),
      userId: typeof p.user_id === 'string' && p.user_id ? p.user_id : null,
    }));
  });

  return {
    async isAdmin(haUserId) {
      const set = await admins();
      return set ? set.has(haUserId) : null;
    },
    persons,
  };
}
