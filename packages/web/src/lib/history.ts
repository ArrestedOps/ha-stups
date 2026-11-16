import { deviceTz } from './datetime';
import { dayOfMonth, names } from './i18n/names';
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
  /** Rohdaten des Recorders oder Langzeitstatistik (Mittelwerte je Stunde oder Tag) */
  source?: 'recorder' | 'statistics';
  /** Ab wann `fired` gilt (bei der Statistik nur die letzten sieben Tage) */
  firedSince?: string;
  /** Entwicklung über Wochen, nur bei langen Fenstern: Änderung je 30 Tage und Tage bis zur Schwelle */
  trend?: { perMonth: number; reachDays: number | null } | null;
  /** Das Fenster hat der Server gewählt */
  auto?: boolean;
  /** Das Fenster ist länger als die Rohdaten und die Entität hat keine Langzeitstatistik */
  needsStatistics?: boolean;
}

/** Die Fenster, die man wählen kann (Stunden): 3 Std., 24 Std., 7 Tage, 30 Tage, 1 Jahr */
export const WINDOWS = [3, 24, 168, 720, 8760] as const;

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

/** „heute 10:58“, „gestern 23:30“ oder „Mo 10:58“ (bis zu sieben Tage zurück) in der Zeitzone des Geräts */
function whenText(iso: string, nowMs: number, tz: string): string {
  const time = hhmm(iso, tz);
  const then = Date.parse(iso);
  if (dayKey(then, tz) === dayKey(nowMs, tz)) return t('heute {time}', { time });
  if (dayKey(then, tz) === dayKey(nowMs - 86_400_000, tz)) return t('gestern {time}', { time });
  const wd = names().weekdaysShort[new Date(`${dayKey(then, tz)}T12:00:00Z`).getUTCDay()]!;
  return `${wd} ${time}`;
}

/** Mitte unter dem Diagramm: wann die Regel ausgelöst hätte */
export function firedText(fired: { at: string }[], nowMs: number, tz = deviceTz()): string {
  if (fired.length === 0) return t('nicht ausgelöst');
  const last = whenText(fired[fired.length - 1]!.at, nowMs, tz);
  if (fired.length === 1) return t('{when} ausgelöst', { when: last });
  return t('{n} Mal ausgelöst, zuletzt {when}', { n: fired.length, when: last });
}

/** Mitte unter einem langen Diagramm: Auslösepunkte kennt nur die letzte Woche, das sagt der Text */
export function firedTextLong(h: EntityHistory, nowMs: number, tz = deviceTz()): string {
  if (h.source !== 'statistics') return firedText(h.fired, nowMs, tz);
  return h.fired.length === 0 ? t('in 7 Tagen nicht ausgelöst') : firedText(h.fired, nowMs, tz);
}

/** Links unter dem kleinen Diagramm: „vor 3 Std.“, „vor 7 Tagen“, „vor einem Jahr“ */
export function windowText(hours: number): string {
  if (hours <= 24) return t('vor {n} Std.', { n: hours });
  if (hours >= 8760) return t('vor einem Jahr');
  return tn('vor {n} Tag', 'vor {n} Tagen', Math.round(hours / 24));
}

/** Knopf zum Umschalten: „3 Std.“, „24 Std.“, „7 Tage“, „30 Tage“, „1 Jahr“ */
export function windowLabel(hours: number): string {
  if (hours <= 24) return t('{n} Std.', { n: hours });
  if (hours >= 8760) return t('1 Jahr');
  return tn('{n} Tag', '{n} Tage', Math.round(hours / 24));
}

/** „den letzten ___“ im Satz und im Vorlesetext: „3 Stunden“, „7 Tage“, „12 Monate“ */
export function spanText(hours: number): string {
  if (hours <= 24) return tn('{n} Stunde', '{n} Stunden', hours);
  if (hours >= 8760) return tn('{n} Monat', '{n} Monate', 12);
  return tn('{n} Tag', '{n} Tage', Math.round(hours / 24));
}

/** Zeile im Kopf des Diagramms: „letzte 3 Stunden“, „letzte 7 Tage“, „letzte 12 Monate“ */
export const lastText = (hours: number): string => t('letzte {span}', { span: spanText(hours) });

/** Linkes Ende des großen Diagramms: Uhrzeit bis 24 Stunden, sonst der Tag („10. Nov“) oder bei einem Jahr der Monat („Nov 2025“) */
export function startText(h: EntityHistory, tz = deviceTz()): string {
  const from = Date.parse(h.from);
  if (h.hours <= 24) return hhmm(h.from, tz);
  const d = new Date(`${dayKey(from, tz)}T12:00:00Z`);
  const month = names().monthsShort[d.getUTCMonth()]!;
  return h.hours >= 8760 ? `${month} ${d.getUTCFullYear()}` : `${dayOfMonth(d.getUTCDate())} ${month}`;
}

/** „in etwa 3 Wochen“ für die Tage bis zur Schwelle */
function inAbout(days: number): string {
  if (days < 14) return tn('in etwa {n} Tag', 'in etwa {n} Tagen', Math.max(1, days));
  if (days < 60) return tn('in etwa {n} Woche', 'in etwa {n} Wochen', Math.round(days / 7));
  return tn('in etwa {n} Monat', 'in etwa {n} Monaten', Math.round(days / 30));
}

/** Zeile unter dem langen Diagramm: „sinkt um etwa 8 % im Monat · erreicht 20 % in etwa 2 Monaten“; null, wenn es keinen klaren Verlauf gibt */
export function trendText(h: EntityHistory, o: { unit: string | null; threshold: number | null }): string | null {
  const tr = h.trend;
  if (!tr || h.kind !== 'numeric' || tr.perMonth === 0) return null;
  const v = valueText(String(Math.abs(tr.perMonth)), o.unit);
  const head = tr.perMonth < 0 ? t('sinkt um etwa {v} im Monat', { v }) : t('steigt um etwa {v} im Monat', { v });
  if (tr.reachDays === null || o.threshold === null) return head;
  return `${head} · ${t('erreicht {v} {when}', { v: valueText(String(o.threshold), o.unit), when: inAbout(tr.reachDays) })}`;
}

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
    t('Verlauf der letzten {hours}: {name}, jetzt {now}', { hours: spanText(h.hours), name: o.name, now: valueText(h.current, h.kind === 'numeric' ? o.unit : null) }),
  ];
  const range =
    h.kind === 'numeric' && h.min !== null && h.max !== null
      ? t('zwischen {min} und {max}', { min: valueText(String(h.min), o.unit), max: valueText(String(h.max), o.unit) })
      : t('Zustände: {states}', { states: h.states.join(', ') });
  const head = `${parts[0]}, ${range}.`;
  const threshold = o.threshold !== null && h.kind === 'numeric' ? ` ${t('Schwelle bei {v}.', { v: valueText(String(o.threshold), o.unit) })}` : '';
  const trend = trendText(h, { unit: o.unit, threshold: o.threshold });
  return `${head}${threshold}${trend ? ` ${trend}.` : ''} ${firedTextLong(h, o.now, o.tz)}.`;
}
