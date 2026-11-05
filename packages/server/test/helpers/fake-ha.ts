import type { HaState } from '../../src/ha.js';
import type { WatcherHa } from '../../src/watchers.js';

/** Attrappe für Home Assistant: merkt sich Abos, liefert Zustände und meldet Ereignisse auf Zuruf */
export class FakeHa implements WatcherHa {
  subs = new Map<string, { payload: Record<string, any>; onEvent: (e: Record<string, any>) => void }>();
  states: HaState[] = [];
  connected: (() => void)[] = [];
  failStates = false;
  /** Historie je Entität für den Probelauf */
  history = new Map<string, { state: string; at: string }[]>();
  failHistory = false;
  /** Termine je Kalender (start/end wie von Home Assistant: ISO-Text oder nur ein Datum) */
  calendars = new Map<string, { title: string; start: string; end: string; uid?: string; recurrenceId?: string }[]>();
  calendarCalls = 0;
  failCalendar = false;
  async getCalendarEvents(entityId: string, _from: string, _to: string) {
    this.calendarCalls += 1;
    if (this.failCalendar) throw new Error('Kalender nicht erreichbar');
    return this.calendars.get(entityId) ?? [];
  }
  /** Stündliche Vorhersage je Wetter-Entität */
  forecasts = new Map<string, { datetime: string; condition?: string; precipitation?: number; precipitation_probability?: number }[]>();
  forecastCalls = 0;
  async getForecast(entityId: string) {
    this.forecastCalls += 1;
    return this.forecasts.get(entityId) ?? [];
  }
  async getHistory(entityId: string, _from: string, _to: string) {
    if (this.failHistory) throw new Error('nicht erreichbar');
    return this.history.get(entityId) ?? [];
  }
  subscribe(key: string, payload: Record<string, unknown>, onEvent: (e: Record<string, any>) => void) {
    this.subs.set(key, { payload, onEvent });
    return () => this.subs.delete(key);
  }
  unsubscribe(key: string) {
    this.subs.delete(key);
  }
  async getStates() {
    if (this.failStates) throw new Error('nicht erreichbar');
    return this.states.map((s) => ({ ...s, attributes: { ...s.attributes } }));
  }
  onConnected(cb: () => void) {
    this.connected.push(cb);
  }
  activeSubscriptions() {
    return [...this.subs.keys()];
  }
  set(entityId: string, state: string, lastChanged = '2026-11-04T09:00:00Z', attributes: Record<string, any> = {}) {
    const i = this.states.findIndex((s) => s.entity_id === entityId);
    const s = { entity_id: entityId, state, last_changed: lastChanged, attributes };
    if (i >= 0) this.states[i] = { ...s, attributes: { ...this.states[i]!.attributes, ...attributes } };
    else this.states.push(s);
  }
  /** Zustandsänderung live melden */
  emit(key: string, state: string, lastChanged = '2026-11-04T10:00:00Z', attributes?: Record<string, any>) {
    this.subs.get(key)!.onEvent({ variables: { trigger: { to_state: { state, last_changed: lastChanged, ...(attributes ? { attributes } : {}) } } } });
  }
  arrive(entityId: string) {
    this.subs.get('presence')!.onEvent({ variables: { trigger: { entity_id: entityId, to_state: { state: 'home' } } } });
  }
  reconnect() {
    for (const cb of this.connected) cb();
  }
}
