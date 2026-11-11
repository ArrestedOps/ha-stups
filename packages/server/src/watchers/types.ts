import type { HaState } from '../ha.js';
import type { Card, Store } from '../store.js';
import type { WatcherData } from '../watcher-data.js';

/** Was die Auswertung von Home Assistant braucht (HaClient bringt es mit, die Tests setzen eine Attrappe ein) */
export interface WatcherHa {
  subscribe(key: string, payload: Record<string, unknown>, onEvent: (event: Record<string, any>) => void, onResult?: (ok: boolean, error?: string) => void): () => void;
  unsubscribe(key: string): void;
  getStates(): Promise<HaState[]>;
  onConnected(cb: () => void): void;
  activeSubscriptions?(): string[];
  /** Termine eines Kalenders (start/end als ISO-Text oder nur Datum) */
  getCalendarEvents?(entityId: string, fromIso: string, toIso: string): Promise<{ title: string; start: string; end: string; uid?: string; recurrenceId?: string }[]>;
  /** Stündliche Vorhersage einer Wetter-Entität */
  getForecast?(entityId: string): Promise<{ datetime: string; condition?: string; precipitation?: number; precipitation_probability?: number }[]>;
  /** Steht die Verbindung, und seit wann fehlt sie? (ohne Angabe gilt sie als stehend) */
  connection?(): { connected: boolean; lostSince: string | null };
}

export type CalendarEvents = Awaited<ReturnType<NonNullable<WatcherHa['getCalendarEvents']>>>;
export type ForecastItems = Awaited<ReturnType<NonNullable<WatcherHa['getForecast']>>>;

export interface WatcherDeps {
  store: Store;
  data: WatcherData;
  ha: WatcherHa;
  now: () => Date;
  timeZone: () => string;
  /** false = ausgeschaltet (Beta): keine Auswertung, keine Karten. Vorgabe: an */
  enabled?: () => boolean;
  /** Zeitlimit für eine Abfrage von Kalender oder Vorhersage in Millisekunden (Vorgabe 20 Sekunden) */
  pollTimeoutMs?: number;
  /** Karte ist (jetzt) jemandem zugewiesen: hier geht die Push-Nachricht raus */
  onAssigned?: (card: Card, userIds: string[]) => void;
  /** "Erst vorschlagen": die Karte ist noch niemandem zugewiesen, diese Personen (zu Hause) werden gefragt, wer sie übernimmt */
  onSuggest?: (card: Card, userIds: string[]) => void;
  /** Der Vorschlag ist vorbei (übernommen oder Rückfall): die Frage bei den anderen wegräumen */
  onSuggestClosed?: (card: Card) => void;
  /** Etwas hat sich geändert (Live-Sync) */
  onChange?: () => void;
  log?: { info(m: string): void; warn(m: string): void };
}

/** Zuletzt gesehener Zustand einer beobachteten Entität */
export interface Seen {
  state: string;
  lastChanged: string | null;
  name?: string;
  unit?: string;
  /** Für das Symbol der Karte (watcher-icons.ts) */
  deviceClass?: string;
  icon?: string;
}

/**
 * Die Bedingung gilt beim Speichern schon, aber der Wächter löst nicht von selbst aus (Zustand, Vorgang, Unbekanntes): die Oberfläche
 * fragt dann, ob die Karte jetzt entstehen soll. `stateText` ist der Zustand in Worten („aus", „412 W").
 */
export interface MetNow {
  entityName: string;
  stateText: string;
  reason: 'already_met';
}
