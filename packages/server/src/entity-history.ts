import { firePoints, type HistoryPoint } from './dry-run.js';
import type { WatchTrigger } from './watcher-types.js';

/**
 * Verlauf der Entität im Wächter-Editor: Zeitfenster in Stunden (Vorgabe 3, höchstens ein Jahr) und wie viele Punkte höchstens zurückgehen.
 * Fenster bis 24 Stunden kommen aus den Rohdaten des Recorders (Home Assistant behält sie 10 Tage), längere aus der Langzeitstatistik.
 */
export const HISTORY_DEFAULT_HOURS = 3;
export const HISTORY_MIN_HOURS = 1;
export const HISTORY_MAX_HOURS = 8760;
export const HISTORY_MAX_POINTS = 240;
/** So weit zurück liest der Verlauf die Rohdaten für Auslösepunkte, aktuellen Wert und die Wahl des Fensters */
export const HISTORY_RECENT_HOURS = 168;

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
  /** Woher der Verlauf kommt: Rohdaten des Recorders oder Langzeitstatistik (Mittelwerte je Stunde oder Tag) */
  source?: 'recorder' | 'statistics';
  /** Ab wann `fired` gilt (bei der Statistik nur die letzten sieben Tage, weil es nur dort Rohdaten gibt) */
  firedSince?: string;
  /** Wie sich der Wert über Wochen entwickelt (Batterie: „sinkt um etwa 8 % im Monat“); nur bei langen Fenstern mit klarem Verlauf */
  trend?: Trend | null;
  /** Das Fenster hat der Server gewählt (`hours=auto`) */
  auto?: boolean;
  /** Das Fenster ist länger als die Rohdaten und die Entität hat keine Langzeitstatistik */
  needsStatistics?: boolean;
}

export interface Trend {
  /** Änderung je 30 Tage in der Einheit der Entität (negativ: sinkt) */
  perMonth: number;
  /** Tage, bis die Schwelle der Regel erreicht ist; null, wenn es keine gibt, sie schon erreicht ist oder der Wert sich davon entfernt */
  reachDays: number | null;
}

/** Ganze Stunden von 1 bis 8760 (ein Jahr); alles Unbrauchbare ergibt die Vorgabe */
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
 * Rohdaten auf ein Fenster zuschneiden: Zustände davor fallen weg, bis auf den letzten (er gilt am Anfang des Fensters).
 * Sonst stünden alle früheren Zustände auf einem Punkt.
 */
export function windowed(history: HistoryPoint[], fromMs: number): HistoryPoint[] {
  const sorted = history.map((p) => ({ p, ms: Date.parse(p.at) })).filter((x) => Number.isFinite(x.ms)).sort((a, b) => a.ms - b.ms);
  const firstIn = sorted.findIndex((x) => x.ms >= fromMs);
  const start = firstIn < 0 ? sorted.length - 1 : Math.max(0, firstIn - 1);
  return sorted.slice(Math.max(0, start)).map((x) => x.p);
}

/**
 * Verlauf einer Entität für die letzten `hours` Stunden, verdichtet für das Diagramm. Zahlenwerte bleiben Zahlen; Zustände (an/aus, offen/zu)
 * werden zu Stufen. Auslösepunkte rechnet dieselbe Funktion wie der Probelauf (`firePoints`) für genau dieses Fenster.
 */
export function historyOf(input: { history: HistoryPoint[]; nowMs: number; hours: number; trigger: WatchTrigger | null; cooldownMin: number }): EntityHistory {
  const hours = clampHours(input.hours);
  const toMs = input.nowMs;
  const fromMs = toMs - hours * 3_600_000;
  const base = { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), hours, source: 'recorder' as const };
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

// ---------- Lange Fenster: Langzeitstatistik ----------

/** Stundenzahl, die das Diagramm für `hours=auto` wählt (Rohdaten der letzten sieben Tage), oder „slow“: da bewegt sich so wenig, dass die Statistik entscheiden muss */
export function autoWindow(recent: HistoryPoint[], nowMs: number): 3 | 24 | 168 | 'slow' {
  const usable = recent.map((p) => ({ state: p.state, ms: Date.parse(p.at) })).filter((p) => Number.isFinite(p.ms) && p.ms <= nowMs && !isGap(p.state)).sort((a, b) => a.ms - b.ms);
  if (usable.length === 0) return 24;
  if (usable.some((p) => numeric(p.state) === null)) return 24; // Zustände (an/aus, offen/zu): ein Tag zeigt, was los war
  const changes = (hours: number): number => {
    const from = nowMs - hours * 3_600_000;
    let n = 0;
    for (let i = 1; i < usable.length; i += 1) if (usable[i]!.ms >= from && usable[i]!.state !== usable[i - 1]!.state) n += 1;
    return n;
  };
  if (changes(3) >= 40) return 3; // Leistung, Verbrauch: Minuten und Stunden zählen
  if (changes(24) >= 6) return 24;
  if (changes(168) >= 6) return 168;
  return 'slow';
}

/** Bewegt sich der Wert im letzten Monat sichtbar (mehr als 5 % seiner Größe)? Dann reicht ein Monat, sonst zeigt erst das Jahr etwas. */
export function movesInLastMonth(stats: { at: string; mean: number }[], nowMs: number): boolean {
  const from = nowMs - 720 * 3_600_000;
  const vals = stats.filter((p) => Date.parse(p.at) >= from).map((p) => p.mean);
  if (vals.length < 2) return false;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return hi - lo > 0.05 * Math.max(Math.abs(hi), Math.abs(lo), 1);
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Wie entwickelt sich der Wert? Eine Gerade durch die Punkte (Theil-Sen: der Median aller Steigungen, Ausreißer wie eine kurze „100“
 * stören nicht). Nach einem dauerhaften Sprung nach oben (neue Batterie) zählt nur, was danach kam. Ohne klaren Verlauf: null.
 */
export function trendOf(pts: { ms: number; v: number }[], rule: { kind: 'below' | 'above'; value: number } | null, current: number | null): Trend | null {
  if (pts.length < 8) return null;
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const range = hi - lo;
  if (range === 0) return null;
  let start = 0;
  for (let i = 1; i < pts.length - 3; i += 1) {
    const jump = pts[i]!.v - pts[i - 1]!.v;
    // ein Sprung nach oben, der bleibt (die nächsten drei Punkte fallen nicht wieder zurück): neue Batterie
    if (jump > 0.25 * range && pts.slice(i, i + 3).every((p) => p.v >= pts[i]!.v - 0.25 * range)) start = i;
  }
  const seg = pts.slice(start);
  if (seg.length < 8) return null;
  const step = Math.max(1, Math.floor(seg.length / 120)); // höchstens etwa 120 Punkte: die Paare bleiben überschaubar
  const sample = seg.filter((_, i) => i % step === 0 || i === seg.length - 1);
  const slopes: number[] = [];
  for (let i = 0; i < sample.length; i += 1) {
    for (let j = i + 1; j < sample.length; j += 1) {
      const dt = sample[j]!.ms - sample[i]!.ms;
      if (dt > 0) slopes.push((sample[j]!.v - sample[i]!.v) / dt);
    }
  }
  if (slopes.length === 0) return null;
  const slope = median(slopes); // je Millisekunde
  const icpt = median(sample.map((p) => p.v - slope * p.ms));
  const segRange = Math.max(...sample.map((p) => p.v)) - Math.min(...sample.map((p) => p.v));
  // passt die Gerade? Die meisten Punkte müssen nahe an ihr liegen
  const close = sample.filter((p) => Math.abs(p.v - (icpt + slope * p.ms)) <= 0.12 * Math.max(segRange, 1e-9)).length / sample.length;
  const span = sample.at(-1)!.ms - sample[0]!.ms;
  const change = Math.abs(slope) * span;
  if (close < 0.7 || span < 14 * 86_400_000 || change < 0.05 * Math.max(Math.abs(hi), Math.abs(lo), 1)) return null;
  const perDay = slope * 86_400_000;
  let reachDays: number | null = null;
  if (rule && current !== null) {
    if (rule.kind === 'below' && perDay < 0 && current > rule.value) reachDays = (current - rule.value) / -perDay;
    if (rule.kind === 'above' && perDay > 0 && current < rule.value) reachDays = (rule.value - current) / perDay;
    if (reachDays !== null && reachDays > 3650) reachDays = null;
  }
  return { perMonth: Math.round(perDay * 30 * 10) / 10, reachDays: reachDays === null ? null : Math.round(reachDays) };
}

/**
 * Verlauf aus der Langzeitstatistik (Mittelwerte je Stunde oder Tag) für Fenster ab einem Tag. Die Rohdaten der letzten sieben Tage (`recent`)
 * liefern den aktuellen Wert und die Auslösepunkte; weiter zurück gibt es keine.
 */
export function historyOfStatistics(input: { stats: { at: string; mean: number }[]; recent: HistoryPoint[]; nowMs: number; hours: number; trigger: WatchTrigger | null; cooldownMin: number }): EntityHistory {
  const hours = clampHours(input.hours);
  const toMs = input.nowMs;
  const fromMs = toMs - hours * 3_600_000;
  const base = { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), hours, source: 'statistics' as const };
  const raw = input.stats
    .map((p) => ({ ms: Math.max(Date.parse(p.at), fromMs), v: p.mean }))
    .filter((p) => Number.isFinite(p.ms) && p.ms <= toMs)
    .sort((a, b) => a.ms - b.ms);
  if (raw.length === 0) return { ...base, status: 'no_data', kind: 'numeric', states: [], points: [], fired: [], current: null, min: null, max: null, trend: null };

  const recent = input.recent
    .map((p) => ({ state: p.state, ms: Date.parse(p.at) }))
    .filter((p) => Number.isFinite(p.ms) && p.ms <= toMs)
    .sort((a, b) => a.ms - b.ms);
  const last = recent.filter((p) => !isGap(p.state)).at(-1);
  const currentState = last?.state ?? String(raw.at(-1)!.v);
  const currentNum = numeric(currentState);
  if (raw.at(-1)!.ms < toMs) raw.push({ ms: toMs, v: currentNum ?? raw.at(-1)!.v });
  const points = thin(raw, HISTORY_MAX_POINTS).map((p) => ({ at: new Date(p.ms).toISOString(), v: p.v }));

  const firedSince = Math.max(fromMs, toMs - HISTORY_RECENT_HOURS * 3_600_000);
  const fired = input.trigger && (input.trigger.kind === 'state' || input.trigger.kind === 'above' || input.trigger.kind === 'below') && recent.length > 0
    ? firePoints({ trigger: input.trigger, cooldownMin: input.cooldownMin }, recent.map((p) => ({ state: p.state, ms: Math.max(p.ms, firedSince) })), toMs).filter((ms) => ms >= firedSince).map((ms) => ({ at: new Date(ms).toISOString() }))
    : [];

  const rule = input.trigger && (input.trigger.kind === 'below' || input.trigger.kind === 'above') && typeof input.trigger.value === 'number' ? { kind: input.trigger.kind, value: input.trigger.value } : null;
  return {
    ...base,
    status: 'ok',
    kind: 'numeric',
    states: [],
    points,
    fired,
    firedSince: new Date(firedSince).toISOString(),
    current: currentState,
    min: raw.reduce((m, p) => Math.min(m, p.v), Infinity),
    max: raw.reduce((m, p) => Math.max(m, p.v), -Infinity),
    trend: hours >= 720 ? trendOf(raw, rule, currentNum ?? raw.at(-1)!.v) : null,
  };
}
