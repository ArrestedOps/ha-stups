import { accentRgb } from './accent.js';
import type { HouseDrivers } from './house-drivers.js';
import { HouseFailure } from './house-drivers.js';
import { t, withLanguage, type Lang } from './i18n/index.js';
import type { HomeState } from './presence.js';
import type { PushGateway, PushKind, PushMessage } from './push.js';
import { quietEnd } from './quiet.js';
import type { HouseChannel, HousePending, Store } from './store.js';

/**
 * Der dritte Push-Weg neben der Companion App und ntfy: Stups, Erinnerungen und Wächter-Karten kommen im Haus an, als Ansage
 * über einen Lautsprecher oder als aufleuchtende Lampe. Je Kanal wählbar: welche Arten, und was geschieht, wenn die Person nicht
 * zu Hause ist (verwerfen oder warten bis zur Heimkehr). Siehe docs/superpowers/specs/2026-11-03-stufe-3-1-haus-kanaele-design.md.
 */

export type HouseResultKind = 'delivered' | 'queued' | 'skipped_away' | 'skipped_quiet' | 'error';

/** Was zuletzt mit einem Kanal geschah (nur im Speicher, für die Push-Übersicht) */
export interface HouseResult {
  at: string;
  result: HouseResultKind;
  error?: { code: 'no_tts' | 'ha_error'; detail: string };
}

type HouseStore = Pick<
  Store,
  | 'houseChannelsOf'
  | 'houseChannel'
  | 'addHousePending'
  | 'housePendingOf'
  | 'housePendingAll'
  | 'removeHousePending'
  | 'purgeHousePending'
  | 'getHouseTts'
  | 'userById'
  | 'languageOf'
  | 'getNudge'
  | 'getCard'
>;

export interface HouseDeps {
  store: HouseStore;
  drivers: Pick<HouseDrivers, 'speak' | 'light'>;
  presence: { homeOf(userId: string, opts?: { fresh?: boolean }): Promise<HomeState> };
  now: () => Date;
  timeZone: () => string;
  /**
   * Darf diese Person gerade Push bekommen? Die Warteschlange liefert selbst aus (nicht über `send`), also muss sie das Tor der Beta
   * selbst fragen. Vorgabe: immer.
   */
  allowed?: (userId: string) => boolean;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
}

const MINUTE = 60_000;

export function createHousePush(deps: HouseDeps) {
  const { store, drivers, presence } = deps;
  const log = deps.log ?? { info: () => undefined, warn: () => undefined };
  const results = new Map<string, HouseResult>();

  const language = (userId: string): Lang => store.languageOf(userId) ?? 'de';

  function record(channelId: string, result: HouseResultKind, error?: HouseFailure): HouseResult {
    const entry: HouseResult = { at: deps.now().toISOString(), result, ...(error ? { error: { code: error.code, detail: error.detail } } : {}) };
    results.set(channelId, entry);
    return entry;
  }

  const asFailure = (err: unknown): HouseFailure => (err instanceof HouseFailure ? err : new HouseFailure('ha_error', err instanceof Error ? err.message : String(err)));

  /** Ansage oder Lampe, ohne jede Regel (die prüft der Aufrufer) */
  async function run(channel: HouseChannel, spoken: string): Promise<void> {
    if (channel.type === 'speak') {
      await drivers.speak({ id: channel.id, entityId: channel.entityId, volume: channel.volume }, spoken, { tts: store.getHouseTts(), language: language(channel.userId) });
    } else {
      await drivers.light({ id: channel.id, entityId: channel.entityId }, accentRgb(store.userById(channel.userId)?.accentHue ?? null));
    }
  }

  /** Ausliefern und das Ergebnis festhalten; false bei einem Fehler */
  async function deliver(channel: HouseChannel, spoken: string): Promise<boolean> {
    try {
      await run(channel, spoken);
      record(channel.id, 'delivered');
      return true;
    } catch (err) {
      const failure = asFailure(err);
      record(channel.id, 'error', failure);
      log.warn(`Haus-Kanal „${channel.name}": ${failure.detail || failure.code}`);
      return false;
    }
  }

  /** Ist die Person gerade in ihrer Ruhezeit? (Die Ruhezeit gilt für Stupse, Fälligkeiten und Wächter-Karten gleich.) */
  function inQuiet(userId: string): boolean {
    const person = store.userById(userId);
    return !!person && quietEnd(deps.now().getTime(), deps.timeZone(), person.nudgeQuiet) !== null;
  }

  // ---------- Senden ----------

  const wants = (c: HouseChannel, kind: PushKind) => c.enabled && c.kinds.includes(kind);

  function canReach(userId: string, kind?: PushKind): boolean {
    // Ohne Art (Tageszusammenfassung, Rückmeldung, Test) erreicht nichts das Haus
    if (!kind) return false;
    return store.houseChannelsOf(userId).some((c) => wants(c, kind));
  }

  /**
   * Gibt true zurück, wenn mindestens ein Kanal die Nachricht bekommen oder bewusst verworfen hat (Ruhezeit, abwesend). Nur wenn alle
   * passenden Kanäle an einem Fehler scheitern, ist es „nicht zugestellt". Ein bewusstes Verwerfen ist kein Fehler: der Notifier
   * würde sonst nach 1, 5 und 15 Minuten wiederholen.
   */
  async function send(userId: string, message: PushMessage): Promise<boolean> {
    const kind = message.kind;
    if (!kind) return false;
    const channels = store.houseChannelsOf(userId).filter((c) => wants(c, kind));
    if (channels.length === 0) return false;
    const spoken = message.spoken ?? '';
    const quiet = kind !== 'nudge' && inQuiet(userId); // Stupse sind schon bis zum Ende der Ruhezeit zurückgehalten
    const at = deps.now().getTime();

    let handled = false;
    for (const c of channels) {
      if (quiet) {
        record(c.id, 'skipped_quiet');
        handled = true;
        continue;
      }
      const where = await presence.homeOf(userId);
      if (where === 'away') {
        if (c.whenAway === 'wait') {
          store.addHousePending(c.id, { kind, spoken, cardId: message.open?.cardId ?? null, nudgeId: message.nudgeId ?? null }, new Date(at + c.waitMinutes * MINUTE).toISOString());
          record(c.id, 'queued');
        } else {
          record(c.id, 'skipped_away');
        }
        handled = true;
        continue;
      }
      // zu Hause oder keine passende Person in Home Assistant gefunden (dann gilt sie als zu Hause)
      if (await deliver(c, spoken)) handled = true;
    }
    return handled;
  }

  // ---------- Warteschlange ----------

  /** Gilt die Nachricht noch? Karte erledigt oder Stups beantwortet: dann nicht mehr ansagen */
  function stillRelevant(p: HousePending): boolean {
    if (p.cardId) {
      try {
        if (store.getCard(p.cardId).completedAt) return false;
      } catch {
        return false; // Karte gelöscht
      }
    }
    if (p.nudgeId) {
      const nudge = store.getNudge(p.nudgeId);
      if (!nudge || nudge.reply !== null) return false;
    }
    return true;
  }

  /** Liefert aus, was für diese Person auf die Heimkehr wartet */
  async function flush(userId: string, fresh: boolean): Promise<void> {
    store.purgeHousePending(deps.now().toISOString());
    if (deps.allowed && !deps.allowed(userId)) return; // Beta mit Push aus: es bleibt, wo es ist, bis es wieder erlaubt ist (oder abläuft)
    for (const p of store.housePendingOf(userId)) {
      const channel = store.houseChannel(p.channelId);
      if (!channel || !channel.enabled || !stillRelevant(p)) {
        store.removeHousePending(p.id);
        continue;
      }
      if (inQuiet(userId)) {
        // Nachts nichts ansagen: ein Stups wartet bis nach der Ruhezeit (oder bis die Frist abläuft), Fälligkeiten verfallen
        if (p.kind !== 'nudge') store.removeHousePending(p.id);
        continue;
      }
      if ((await presence.homeOf(userId, { fresh })) !== 'home') continue;
      store.removeHousePending(p.id); // auch bei einem Fehler: keine Endlosschleife
      await deliver(channel, p.spoken);
    }
  }

  /** Der Takt (alle 30 Sekunden): abgelaufene Einträge löschen, ausliefern, was jetzt geht */
  async function tick(): Promise<void> {
    store.purgeHousePending(deps.now().toISOString());
    const users = new Set<string>();
    for (const p of store.housePendingAll()) {
      const channel = store.houseChannel(p.channelId);
      if (channel) users.add(channel.userId);
      else store.removeHousePending(p.id);
    }
    for (const userId of users) await flush(userId, false);
  }

  /** Die Person ist heimgekommen (Zustandswechsel in Home Assistant) */
  const arrival = (userId: string): Promise<void> => flush(userId, true);

  // ---------- Test-Knopf ----------

  /** Ansage oder Lampe ohne Rücksicht auf Art, Ruhezeit und Anwesenheit; meldet den Fehler, statt zu werfen. null: es gibt den Kanal nicht */
  async function test(channelId: string): Promise<HouseResult | null> {
    const channel = store.houseChannel(channelId);
    if (!channel) return null;
    const spoken = withLanguage(language(channel.userId), () => t('Das ist ein Test von Stups.'));
    await deliver(channel, spoken);
    return results.get(channel.id) ?? null;
  }

  const status = (channelId: string): HouseResult | null => results.get(channelId) ?? null;

  const gateway: PushGateway & {
    tick: typeof tick;
    arrival: typeof arrival;
    test: typeof test;
    status: typeof status;
  } = {
    canReach,
    send,
    clear: async () => undefined, // eine Ansage lässt sich nicht zurücknehmen
    tick,
    arrival,
    test,
    status,
  };
  return gateway;
}

export type HousePush = ReturnType<typeof createHousePush>;

// ---------- Abonnement auf die Heimkehr ----------

const ARRIVAL_KEY = 'house:arrival';

export interface HouseSubscriptionDeps {
  ha: {
    subscribe(key: string, payload: Record<string, unknown>, onEvent: (event: Record<string, any>) => void): unknown;
    unsubscribe(key: string): void;
  };
  presence: { entityOwners(): Promise<Map<string, string>> };
  store: Pick<Store, 'houseChannels'>;
  house: Pick<HousePush, 'arrival'>;
  log?: { warn: (msg: string) => void };
}

/**
 * Wechselt eine Person nach „home", wird ausgeliefert, was für sie wartet. Abonniert wird nur, solange es einen eingeschalteten Kanal
 * mit „warten" gibt (wie bei den Wächtern: sonst gäbe es nichts zu tun). `sync` gleicht ab, nach Änderungen an Kanälen oder Personen,
 * beim Start und nach einer neuen Verbindung zu Home Assistant.
 */
export function createHouseSubscription(deps: HouseSubscriptionDeps) {
  let signature = '';

  function stop(): void {
    if (signature !== '') deps.ha.unsubscribe(ARRIVAL_KEY);
    signature = '';
  }

  async function sync(): Promise<void> {
    if (!deps.store.houseChannels().some((c) => c.enabled && c.whenAway === 'wait')) return stop();
    const owners = await deps.presence.entityOwners();
    const entities = [...owners.keys()].sort();
    if (entities.length === 0) return stop();
    const next = entities.join(',');
    if (next === signature) return;
    signature = next;
    deps.ha.subscribe(ARRIVAL_KEY, { type: 'subscribe_trigger', trigger: { platform: 'state', entity_id: entities, to: 'home' } }, (ev) => {
      const entityId = ev.variables?.trigger?.entity_id;
      const userId = typeof entityId === 'string' ? owners.get(entityId) : undefined;
      if (userId) void deps.house.arrival(userId).catch((err) => deps.log?.warn(`Haus: Heimkehr: ${String(err)}`));
    });
  }

  return { sync };
}
