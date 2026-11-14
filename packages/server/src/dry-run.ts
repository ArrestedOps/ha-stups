import { t, tn } from './i18n/index.js';
import { conditionMet, type WatchTrigger } from './watcher-types.js';

/** Wie weit der Probelauf zurückschaut und wie viele Zustände er höchstens liest */
export const DRY_RUN_DAYS = 7;
export const DRY_RUN_MAX_STATES = 20_000;
/** Zwei Auslösungen näher beieinander als so viele Minuten gelten als verdächtig (Wackeln des Sensors) */
const QUICK_MIN = 10;
/** Punkte für das kleine Diagramm */
const MAX_POINTS = 240;

export interface HistoryPoint {
  state: string;
  at: string;
}

export interface DryRunResult {
  /** Wann der Wächter in dem Zeitraum eine Aufgabe angelegt hätte */
  fired: { at: string }[];
  /** Wie oft es dabei weniger als 10 Minuten nach der vorigen Auslösung war */
  quick: number;
  sentence: string;
  /** Verlauf für das Diagramm: Zahlenwerte (bei Zuständen 1 = Zielzustand, 0 = anderer) */
  points: { at: string; v: number }[];
  /** Es gab keine brauchbare Historie (Recorder aus, neue Entität) */
  noHistory: boolean;
  /** Mehr als 20 000 Zustände: nur die ersten wurden gelesen */
  truncated: boolean;
  from: string;
  to: string;
}

const numeric = (state: string): number | null => (state !== '' && state !== 'unknown' && state !== 'unavailable' && Number.isFinite(Number(state)) ? Number(state) : null);

/**
 * Die Zeitpunkte, zu denen ein Wächter in einem Verlauf ausgelöst hätte (nach Zeit sortierte Zustände, `toMs` = Ende des Fensters).
 * Gleiche Auslegung wie im laufenden Betrieb (`conditionMet`, Mindestdauer, Sperrzeit, erst wieder scharf, wenn die Bedingung einmal
 * nicht galt, Zähler). Der Probelauf (7 Tage) und der Verlauf im Editor (3 Stunden) benutzen dieselbe Rechnung.
 */
export function firePoints(rule: { trigger: WatchTrigger; cooldownMin: number }, sorted: { state: string; ms: number }[], toMs: number): number[] {
  if (sorted.length === 0) return [];
  const tr = rule.trigger;
  const forMs = tr.forMin * 60_000;
  const cooldownMs = rule.cooldownMin * 60_000;
  const fired: number[] = [];
  let armed = !conditionMet(tr, sorted[0]!.state);
  let metSince: number | null = null;
  let lastFire: number | null = null;
  let triggers = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const p = sorted[i]!;
    const until = i + 1 < sorted.length ? sorted[i + 1]!.ms : toMs;
    if (!conditionMet(tr, p.state)) {
      armed = true;
      metSince = null;
      continue;
    }
    if (metSince === null) metSince = p.ms;
    if (!armed) continue;
    const fireAt = metSince + forMs;
    if (fireAt > until) continue; // bis zum nächsten Zustand noch nicht lange genug erfüllt
    armed = false;
    if (lastFire !== null && fireAt - lastFire < cooldownMs) continue; // Sperrzeit
    lastFire = fireAt;
    triggers += 1;
    if (tr.count <= 1 || triggers % tr.count === 0) fired.push(fireAt);
  }
  return fired;
}

/**
 * Probelauf: wendet die Regel eines Wächters auf die Historie einer Entität an, ohne etwas zu speichern. Gleiche Auslegung wie im laufenden
 * Betrieb (`conditionMet`, Mindestdauer, Sperrzeit, erst wieder scharf, wenn die Bedingung einmal nicht galt, Zähler).
 */
export function dryRun(rule: { trigger: WatchTrigger; cooldownMin: number }, history: HistoryPoint[], nowMs: number): DryRunResult {
  const toMs = nowMs;
  const fromMs = nowMs - DRY_RUN_DAYS * 86_400_000;
  const base = { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() };
  const truncated = history.length > DRY_RUN_MAX_STATES;
  const sorted = history
    .slice(0, DRY_RUN_MAX_STATES)
    .map((p) => ({ state: p.state, ms: Date.parse(p.at) }))
    .filter((p) => Number.isFinite(p.ms) && p.ms <= toMs)
    .sort((a, b) => a.ms - b.ms);
  const usable = sorted.filter((p) => p.state !== 'unknown' && p.state !== 'unavailable');
  if (usable.length < 2) {
    return { ...base, fired: [], quick: 0, points: [], noHistory: true, truncated, sentence: t('Für diese Entität gibt es keine Historie (Recorder aus oder neue Entität). Ein Probelauf ist nicht möglich.') };
  }

  const tr = rule.trigger;
  const fired = firePoints(rule, sorted, toMs);

  const quick = fired.filter((ms, i) => i > 0 && ms - fired[i - 1]! < QUICK_MIN * 60_000).length;
  const stride = Math.max(1, Math.ceil(sorted.length / MAX_POINTS));
  const points = sorted
    .filter((_, i) => i % stride === 0)
    .map((p) => ({ at: new Date(p.ms).toISOString(), v: tr.kind === 'state' ? (p.state === tr.to ? 1 : 0) : (numeric(p.state) ?? NaN) }))
    .filter((p) => Number.isFinite(p.v));

  const n = fired.length;
  const sentence =
    n === 0
      ? t('In den letzten 7 Tagen hätte der Wächter nie ausgelöst.')
      : quick === 0
        ? tn('{n} Auslösung erkannt, kein Fehlalarm', '{n} Auslösungen erkannt, kein Fehlalarm', n)
        : t('{n} Mal ausgelöst, davon {quick} innerhalb von 10 Minuten: Mindestdauer erhöhen?', { n, quick });
  return { ...base, fired: fired.map((ms) => ({ at: new Date(ms).toISOString() })), quick, points, noHistory: false, truncated, sentence };
}
