import { firePoints, type HistoryPoint } from './dry-run.js';
import type { WatchTrigger } from './watcher-types.js';

/** Verlauf der Entität im Wächter-Editor: Zeitfenster in Stunden (Vorgabe 3) und wie viele Punkte höchstens zurückgehen */
export const HISTORY_DEFAULT_HOURS = 3;
export const HISTORY_MIN_HOURS = 1;
export const HISTORY_MAX_HOURS = 24;
export const HISTORY_MAX_POINTS = 240;

export interface EntityHistory {
  /** ok = Verlauf da; no_data = Entität ohne Historie im Fenster (Recorder aus, neu); unavailable = Home Assistant antwortet nicht */
  status: 'ok' | 'no_data' | 'unavailable';
  from: string;
  to: string;
  hours: number;
  /** numeric: `v` ist der Wert; state: `v` zählt die Zustände in `states` (Stufen) */
  kind: 'numeric' | 'state';
  states: string[];
  points: { at: string; v: number }[];
  /** Wann der Wächter mit dieser Regel in diesem Fenster ausgelöst hätte (wie im Probelauf) */
  fired: { at: string }[];
  /** Letzter bekannter Zustand */
  current: string | null;
  min: number | null;
  max: number | null;
}

/** Ganze Stunden von 1 bis 24; alles Unbrauchbare ergibt die Vorgabe */
export function clampHours(raw: unknown): number {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) return HISTORY_DEFAULT_HOURS;
  return Math.min(HISTORY_MAX_HOURS, Math.max(HISTORY_MIN_HOURS, Math.round(n)));
}

const isGap = (state: string): boolean => state === 'unknown' || state === 'unavailable';
const numeric = (state: string): number | null => (state !== '' && Number.isFinite(Number(state)) ? Number(state) : null);

/** Auf höchstens `max` Punkte verdichten: je Abschnitt bleiben der kleinste und der größte Wert (Ausschläge gehen nicht verloren), Anfang und Ende bleiben */
function thin<T extends { v: number }>(list: T[], max: number): T[] {
  if (list.length <= max) return list;
  const buckets = Math.floor((max - 2) / 2);
  const size = (list.length - 2) / buckets;
  const out: T[] = [list[0]!];
  for (let b = 0; b < buckets; b += 1) {
    const slice = list.slice(1 + Math.floor(b * size), 1 + Math.floor((b + 1) * size));
    if (slice.length === 0) continue;
    let lo = 0;
    let hi = 0;
    slice.forEach((p, i) => {
      if (p.v < slice[lo]!.v) lo = i;
      if (p.v > slice[hi]!.v) hi = i;
    });
    for (const i of [...new Set([lo, hi])].sort((a, c) => a - c)) out.push(slice[i]!);
  }
  out.push(list.at(-1)!);
  return out;
}

/**
 * Verlauf einer Entität für die letzten `hours` Stunden, verdichtet für das Diagramm. Zahlenwerte bleiben Zahlen; Zustände (an/aus, offen/zu)
 * werden zu Stufen. Auslösepunkte rechnet dieselbe Funktion wie der Probelauf (`firePoints`) für genau dieses Fenster.
 */
export function historyOf(input: { history: HistoryPoint[]; nowMs: number; hours: number; trigger: WatchTrigger | null; cooldownMin: number }): EntityHistory {
  const hours = clampHours(input.hours);
  const toMs = input.nowMs;
  const fromMs = toMs - hours * 3_600_000;
  const base = { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), hours };
  const empty: EntityHistory = { ...base, status: 'no_data', kind: 'numeric', states: [], points: [], fired: [], current: null, min: null, max: null };

  const sorted = input.history
    .map((p) => ({ state: p.state, ms: Date.parse(p.at) }))
    .filter((p) => Number.isFinite(p.ms) && p.ms <= toMs)
    .map((p) => ({ state: p.state, ms: Math.max(p.ms, fromMs) }))
    .sort((a, b) => a.ms - b.ms);
  const usable = sorted.filter((p) => !isGap(p.state));
  if (usable.length === 0) return empty;

  const isNumeric = usable.every((p) => numeric(p.state) !== null);
  const states: string[] = [];
  const valueOf = (state: string): number => {
    if (isNumeric) return Number(state);
    let i = states.indexOf(state);
    if (i < 0) i = states.push(state) - 1;
    return i;
  };
  const raw = usable.map((p) => ({ ms: p.ms, v: valueOf(p.state) }));
  // der letzte Zustand gilt bis jetzt
  if (raw.at(-1)!.ms < toMs) raw.push({ ms: toMs, v: raw.at(-1)!.v });
  const points = thin(raw, HISTORY_MAX_POINTS).map((p) => ({ at: new Date(p.ms).toISOString(), v: p.v }));

  const fired = input.trigger && (input.trigger.kind === 'state' || input.trigger.kind === 'above' || input.trigger.kind === 'below')
    ? firePoints({ trigger: input.trigger, cooldownMin: input.cooldownMin }, sorted, toMs).filter((ms) => ms >= fromMs).map((ms) => ({ at: new Date(ms).toISOString() }))
    : [];

  const lo = raw.reduce((m, p) => Math.min(m, p.v), Infinity);
  const hi = raw.reduce((m, p) => Math.max(m, p.v), -Infinity);
  return {
    ...base,
    status: 'ok',
    kind: isNumeric ? 'numeric' : 'state',
    states,
    points,
    fired,
    current: usable.at(-1)!.state,
    min: isNumeric ? lo : null,
    max: isNumeric ? hi : null,
  };
}

/** Ein Verlauf ohne Daten, weil Home Assistant nicht antwortet (nie ein Fehler für die Oberfläche) */
export function unavailableHistory(nowMs: number, hours: number): EntityHistory {
  const h = clampHours(hours);
  return { status: 'unavailable', from: new Date(nowMs - h * 3_600_000).toISOString(), to: new Date(nowMs).toISOString(), hours: h, kind: 'numeric', states: [], points: [], fired: [], current: null, min: null, max: null };
}
