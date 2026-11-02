import type { Changes } from './store/context.js';

export interface AppEvent {
  /** fortlaufende Nummer, beginnt bei 1 */
  seq: number;
  /** HA-Nutzer-ID (intern: users.id) der Person, die die Änderung ausgelöst hat */
  by: string | null;
  /** Was sich geändert hat (einzelne Karten oder „alles"); ohne Angabe lädt der Client alles neu */
  changes?: Changes;
}

/** `changes` holt bei jeder Meldung ab, was sich seit der letzten geändert hat (der Store schreibt es mit) */
export function createEventBus(opts: { changes?: () => Changes } = {}) {
  const subs = new Set<(e: AppEvent) => void>();
  let seq = 0;
  return {
    get seq() {
      return seq;
    },
    emit(e: { by: string | null }): void {
      seq += 1;
      const changes = opts.changes?.();
      const event: AppEvent = { seq, by: e.by, ...(changes ? { changes } : {}) };
      for (const fn of [...subs]) {
        try {
          fn(event);
        } catch {
          /* ein Abonnent darf die anderen nicht stören */
        }
      }
    },
    subscribe(fn: (e: AppEvent) => void): () => void {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export type EventBus = ReturnType<typeof createEventBus>;
