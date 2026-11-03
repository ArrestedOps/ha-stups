import { ConflictError, ValidationError } from './errors.js';
import type { PushGateway } from './push.js';
import { t } from './i18n/index.js';

/**
 * In der Beta sind Push und Wächter zunächst aus. Die Beta bekommt per Umzug die Daten der normalen App; ohne dieses Tor
 * würde sie dieselben Erinnerungen ein zweites Mal an die Familie schicken und dieselben Wächter doppelt Karten anlegen lassen.
 * Ein Administrator schaltet beides gezielt ein. In der normalen App tut das Tor nichts.
 */
export type BetaPush = { mode: 'off' } | { mode: 'only'; personId: string } | { mode: 'all' };

export interface BetaState {
  push: BetaPush;
  watchers: boolean;
}

export interface BetaGateDeps {
  /** false = normale App */
  enabled: boolean;
  settings: { get(key: string): string | null; put(key: string, value: string | null): void };
  /** Kennungen der Personen, die es gibt */
  people: () => string[];
}

const PUSH_KEY = 'betaPush';
const WATCHERS_KEY = 'betaWatchers';
const ONLY = 'only:';

export function createBetaGate(deps: BetaGateDeps) {
  const listeners: ((on: boolean) => void)[] = [];

  function readPush(): BetaPush {
    const raw = deps.settings.get(PUSH_KEY);
    if (raw === 'all') return { mode: 'all' };
    if (raw?.startsWith(ONLY)) {
      const personId = raw.slice(ONLY.length);
      // Eine Person, die es nicht mehr gibt, bekommt nichts: sicherer als „alle"
      return deps.people().includes(personId) ? { mode: 'only', personId } : { mode: 'off' };
    }
    return { mode: 'off' };
  }

  const watchersEnabled = (): boolean => !deps.enabled || deps.settings.get(WATCHERS_KEY) === 'on';

  function state(): BetaState {
    if (!deps.enabled) return { push: { mode: 'all' }, watchers: true };
    return { push: readPush(), watchers: watchersEnabled() };
  }

  const allowed = (userId: string): boolean => {
    const p = readPush();
    return p.mode === 'all' || (p.mode === 'only' && p.personId === userId);
  };

  function set(patch: { push?: BetaPush; watchers?: boolean }): BetaState {
    if (!deps.enabled) throw new ConflictError(t('Diese Einstellung gibt es nur in der Beta'));
    // Erst alles prüfen, dann schreiben: ein Fehler ändert nichts
    let push: string | undefined;
    if (patch.push !== undefined) {
      const p = patch.push as { mode?: unknown; personId?: unknown };
      if (p.mode === 'off') push = 'off';
      else if (p.mode === 'all') push = 'all';
      else if (p.mode === 'only') {
        if (typeof p.personId !== 'string' || !deps.people().includes(p.personId)) throw new ValidationError(t('Person nicht gefunden'));
        push = `${ONLY}${p.personId}`;
      } else throw new ValidationError(t('Push in der Beta: „aus", „nur für eine Person" oder „an"'));
    }
    if (patch.watchers !== undefined && typeof patch.watchers !== 'boolean') throw new ValidationError(t('Wächter in der Beta: an oder aus'));

    if (push !== undefined) deps.settings.put(PUSH_KEY, push);
    if (patch.watchers !== undefined) {
      const was = watchersEnabled();
      deps.settings.put(WATCHERS_KEY, patch.watchers ? 'on' : 'off');
      if (was !== patch.watchers) for (const cb of listeners) cb(patch.watchers);
    }
    return state();
  }

  /** Lässt nur durch, was die Einstellung erlaubt. Wer nicht durchkommt, gilt als nicht erreichbar (kein Wiederholen, keine Fehlermeldung). */
  function gatePush(push: PushGateway): PushGateway {
    if (!deps.enabled) return push;
    return {
      canReach: (userId, kind) => allowed(userId) && push.canReach(userId, kind),
      send: async (userId, message) => (allowed(userId) ? push.send(userId, message) : false),
      clear: (userId, tag) => push.clear(userId, tag),
    };
  }

  return {
    enabled: deps.enabled,
    state,
    set,
    gatePush,
    /** Darf diese Person gerade Push bekommen? (In der normalen App immer.) Auch für alles, was nicht über `gatePush` läuft, etwa die Haus-Warteschlange */
    pushAllowed: (userId: string): boolean => !deps.enabled || allowed(userId),
    watchersEnabled,
    /** Wird aufgerufen, wenn sich ändert, ob die Wächter laufen */
    onWatchers: (cb: (on: boolean) => void): void => void listeners.push(cb),
  };
}

export type BetaGate = ReturnType<typeof createBetaGate>;
