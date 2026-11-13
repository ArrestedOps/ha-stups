import { deviceTz } from './datetime';
import { numberLocale, t, tn } from './i18n/index.svelte';

/** Verlauf einer Entität vom Server (`GET /api/watchers/history`) */
export interface EntityHistory {
  status: 'ok' | 'no_data' | 'unavailable';
  from: string;
  to: string;
  hours: number;
  kind: 'numeric' | 'state';
  states: string[];
  points: { at: string; v: number }[];
  fired: { at: string }[];
  current: string | null;
  min: number | null;
  max: number | null;
}

export interface GraphOptions {
  /** Maße des Zeichenbereichs (viewBox); der Aufrufer streckt ihn auf die Breite der Aufgabe */
  width: number;
  height: number;
  /** Höchster und tiefster Punkt der Linie (oben und unten bleibt Luft für Strichstärke und Auslösepunkt) */
  top: number;
  bottom: number;
  /** Schwellwert der Regel (Zahlen); die Schwelle gehört zum Wertebereich */
  threshold: number | null;
  /** Zielzustand der Regel (Zustände): seine Stufe wird die gestrichelte Linie */
  thresholdState?: string | null;
}

export interface Graph {
  line: string;
  /** Fläche unter der Linie (für den Verlauf) */
  area: string;
  /** Höhe der Schwellen-Linie; null, wenn es keine gibt */
  thresholdY: number | null;
  marks: { x: number; y: number; at: string }[];
}

const r1 = (n: number): string => String(Math.round(n * 10) / 10);

/**
 * Das Diagramm als reine Rechnung: Pfade und Punkte im Zeichenbereich. Zeit läuft von links (Anfang des Fensters) bis rechts (jetzt),
 * hohe Werte stehen oben. Zahlen werden gerade verbunden, Zustände als Stufen gezeichnet. Ohne Verlauf (zu wenig Punkte) gibt es nichts.
 */
export function graphOf(h: EntityHistory, o: GraphOptions): Graph | null {
  if (h.status !== 'ok' || h.points.length < 2) return null;
  const t0 = Date.parse(h.from);
  const span = Math.max(1, Date.parse(h.to) - t0);
  const x = (ms: number): number => Math.min(o.width, Math.max(0, ((ms - t0) / span) * o.width));

  let y: (v: number) => number;
  let thresholdY: number | null = null;
  if (h.kind === 'numeric') {
    const lo = Math.min(h.min ?? 0, o.threshold ?? Infinity);
    const hi = Math.max(h.max ?? 0, o.threshold ?? -Infinity);
    y = (v) => (hi === lo ? (o.top + o.bottom) / 2 : o.bottom - ((v - lo) / (hi - lo)) * (o.bottom - o.top));
    if (o.threshold !== null) thresholdY = y(o.threshold);
  } else {
    const n = h.states.length;
    y = (v) => (n <= 1 ? o.bottom : o.bottom - (v / (n - 1)) * (o.bottom - o.top));
    const level = o.thresholdState ? h.states.indexOf(o.thresholdState) : -1;
    if (level >= 0) thresholdY = y(level);
  }

  const pts = h.points.map((p) => ({ ms: Date.parse(p.at), v: p.v }));
  let line = `M${r1(x(pts[0]!.ms))} ${r1(y(pts[0]!.v))}`;
  for (let i = 1; i < pts.length; i += 1) {
    const p = pts[i]!;
    // Zustände halten ihre Stufe bis zum nächsten Wechsel: erst waagerecht, dann senkrecht
    if (h.kind === 'state' && p.v !== pts[i - 1]!.v) line += ` L${r1(x(p.ms))} ${r1(y(pts[i - 1]!.v))}`;
    line += ` L${r1(x(p.ms))} ${r1(y(p.v))}`;
  }
  const area = `${line} L${r1(o.width)} ${r1(o.height)} L0 ${r1(o.height)} Z`;

  /** Wert zu einem Zeitpunkt: Zahlen gerade zwischen den Punkten, Zustände halten den letzten Wert */
  const valueAt = (ms: number): number => {
    if (ms <= pts[0]!.ms) return pts[0]!.v;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (ms <= b.ms) return h.kind === 'state' || b.ms === a.ms ? a.v : a.v + ((b.v - a.v) * (ms - a.ms)) / (b.ms - a.ms);
    }
    return pts.at(-1)!.v;
  };
  const marks = h.fired.map((f) => {
    const ms = Date.parse(f.at);
    return { x: Number(r1(x(ms))), y: Number(r1(y(valueAt(ms)))), at: f.at };
  });
  return { line, area, thresholdY: thresholdY === null ? null : Number(r1(thresholdY)), marks };
}

// ---------- Beschriftung ----------

const dayKey = (ms: number, tz: string): string => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
const hhmm = (iso: string, tz: string): string => new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(iso));

/** „heute 10:58“ oder „gestern 23:30“ (das Fenster reicht höchstens 24 Stunden zurück) in der Zeitzone des Geräts */
function whenText(iso: string, nowMs: number, tz: string): string {
  const time = hhmm(iso, tz);
  return dayKey(Date.parse(iso), tz) === dayKey(nowMs, tz) ? t('heute {time}', { time }) : t('gestern {time}', { time });
}

/** Mitte unter dem Diagramm: wann die Regel ausgelöst hätte */
export function firedText(fired: { at: string }[], nowMs: number, tz = deviceTz()): string {
  if (fired.length === 0) return t('nicht ausgelöst');
  const last = whenText(fired[fired.length - 1]!.at, nowMs, tz);
  if (fired.length === 1) return t('{when} ausgelöst', { when: last });
  return t('{n} Mal ausgelöst, zuletzt {when}', { n: fired.length, when: last });
}

/** Links unter dem Diagramm: „vor 3 Std.“ */
export const windowText = (hours: number): string => t('vor {n} Std.', { n: hours });

/** Wert mit Einheit, Dezimalkomma je Sprache; Zustände bleiben, wie sie sind */
export function valueText(state: string | null, unit: string | null): string {
  if (state === null) return '';
  const n = state.trim() !== '' && Number.isFinite(Number(state)) ? Number(state) : null;
  const v = n === null ? state : new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 1 }).format(n);
  return unit ? `${v} ${unit}` : v;
}

/** Textalternative zum Diagramm (für Screenreader): was es zeigt, ohne es sehen zu müssen */
export function graphAlt(h: EntityHistory, o: { name: string; unit: string | null; threshold: number | null; now: number; tz?: string }): string {
  const parts = [
    t('Verlauf der letzten {hours}: {name}, jetzt {now}', { hours: tn('{n} Stunde', '{n} Stunden', h.hours), name: o.name, now: valueText(h.current, h.kind === 'numeric' ? o.unit : null) }),
  ];
  const range =
    h.kind === 'numeric' && h.min !== null && h.max !== null
      ? t('zwischen {min} und {max}', { min: valueText(String(h.min), o.unit), max: valueText(String(h.max), o.unit) })
      : t('Zustände: {states}', { states: h.states.join(', ') });
  const head = `${parts[0]}, ${range}.`;
  const threshold = o.threshold !== null && h.kind === 'numeric' ? ` ${t('Schwelle bei {v}.', { v: valueText(String(o.threshold), o.unit) })}` : '';
  return `${head}${threshold} ${firedText(h.fired, o.now, o.tz)}.`;
}
