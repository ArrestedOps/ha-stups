import { fromInputValue, toInputValue } from '../datetime';
import { ruleFromEditor, type Recurrence, type RecurrenceEditor } from '../recurrence';
import { DICTIONARIES, type Dictionary, type Unit } from './dictionary';

/**
 * Schnell-Eingabe: aus einer Zeile Text wird eine Aufgabe.
 *   „Müll raus morgen 19 Uhr @Ben #Haushalt jede Woche !!"
 * Reine Logik ohne Oberfläche. Die Wörter stehen im Wörterbuch der Sprache (dictionary.ts); die Regeln sind für alle gleich.
 * Alles, was erkannt wird, kommt als Token zurück (zum Hervorheben und Zurücknehmen); der Rest ist der Titel.
 */
export type TokenKind = 'date' | 'time' | 'person' | 'category' | 'recurrence' | 'priority';
export type TokenStatus = 'ok' | 'unknown' | 'ambiguous' | 'new';

export interface QuickToken {
  /** stabil, solange dieselben Wörter dastehen (zum Zurücknehmen): „date:morgen", „person:ben" */
  id: string;
  kind: TokenKind;
  start: number;
  end: number;
  /** der Text im Original */
  text: string;
  status: TokenStatus;
  /** bei Person und Kategorie: der gefundene Name, sonst das Getippte (für die Anzeige) */
  value?: string;
}

export interface QuickPerson {
  id: string;
  name: string;
  displayName: string;
}
export interface QuickCategory {
  id: string;
  name: string;
}

export interface QuickContext {
  /** jetzt, in Millisekunden */
  now: number;
  /** Zeitzone des Anwenders */
  tz: string;
  lang: string;
  /** Uhrzeit, wenn nur ein Datum dasteht (HH:MM) */
  defaultTime: string;
  people: QuickPerson[];
  categories: QuickCategory[];
  /** zurückgenommene Token (Kennungen), sie bleiben Text im Titel */
  ignore?: ReadonlySet<string>;
}

export interface QuickResult {
  title: string;
  /** UTC-ISO oder null */
  dueAt: string | null;
  recurrence: Recurrence | null;
  priority: 'medium' | 'high' | null;
  assignees: { name: string; personId: string | null; status: TokenStatus }[];
  categories: { name: string; categoryId: string | null; status: TokenStatus }[];
  tokens: QuickToken[];
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}
interface Candidate {
  kind: TokenKind;
  start: number;
  end: number;
  text: string;
}
interface DateCandidate extends Candidate {
  kind: 'date';
  /** löst das Datum auf, bezogen auf heute; null = ungültig */
  resolve: (today: Ymd) => Ymd | null;
}
interface TimeCandidate extends Candidate {
  kind: 'time';
  h: number;
  m: number;
}
interface RecCandidate extends Candidate {
  kind: 'recurrence';
  mode: RecurrenceEditor['mode'];
  every: number;
  weekday?: number;
}

const LETTER = '\\p{L}\\p{N}';
const before = `(?<![${LETTER}])`;
const after = `(?![${LETTER}])`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Wörter als Regex-Auswahl, längste zuerst; Leerzeichen in Wendungen dürfen mehrfach sein */
const alt = (words: string[]) =>
  `(?:${[...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => esc(w).replace(/ /g, '\\s+'))
    .join('|')})`;
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const pad = (n: number) => String(n).padStart(2, '0');

// ---------- Kalender ----------

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const validYmd = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);
const isoDay = (y: Ymd) => Date.UTC(y.y, y.m - 1, y.d);
const fromUtc = (ms: number): Ymd => {
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
};
const addDays = (d: Ymd, n: number): Ymd => fromUtc(isoDay(d) + n * 86_400_000);
/** Monate addieren; der Tag bleibt im Zielmonat (31.1. + 1 Monat = 28.2.) */
function addMonths(d: Ymd, n: number): Ymd {
  const total = d.y * 12 + (d.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(d.d, daysIn(y, m)) };
}
/** 1 = Montag … 7 = Sonntag */
const weekdayOf = (d: Ymd) => ((new Date(isoDay(d)).getUTCDay() + 6) % 7) + 1;
/** Der nächste Wochentag strikt nach heute: ist heute Montag, ist „Montag" der Montag in einer Woche */
const nextWeekday = (today: Ymd, wd: number): Ymd => addDays(today, ((wd - weekdayOf(today) + 7) % 7) || 7);
const cmp = (a: Ymd, b: Ymd) => isoDay(a) - isoDay(b);

/** Ohne Jahr: die nächste Wiederkehr ab heute (auch der 29.2. findet den nächsten Schalttag) */
function withoutYear(today: Ymd, m: number, d: number): Ymd | null {
  for (let y = today.y; y <= today.y + 8; y++) {
    if (!validYmd(y, m, d)) continue;
    const c = { y, m, d };
    if (cmp(c, today) >= 0) return c;
  }
  return null;
}

// ---------- Erkennen ----------

function* matches(re: RegExp, text: string): Generator<RegExpExecArray> {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') re.lastIndex++;
    else yield m;
  }
}

/** Zieht ein davorstehendes „am"/„bis" zum Datum, wenn es allein davor steht */
function withPrefix(work: string, start: number, prefixes: RegExp): number {
  const m = prefixes.exec(work.slice(0, start));
  return m ? start - m[0].length : start;
}

export function parseQuickAdd(text: string, ctx: QuickContext): QuickResult {
  const dict: Dictionary = DICTIONARIES[ctx.lang] ?? DICTIONARIES.de!;
  const ignore = ctx.ignore ?? new Set<string>();
  /** Arbeitskopie: Erkanntes wird durch \0 ersetzt und kann nicht noch einmal passen */
  let work = text;
  const claim = (c: Candidate) => {
    work = work.slice(0, c.start) + '\0'.repeat(c.end - c.start) + work.slice(c.end);
  };
  const free = (c: Candidate) => !/\0/.test(work.slice(c.start, c.end));
  const tokens: QuickToken[] = [];
  const addToken = (c: Candidate, id: string, status: TokenStatus = 'ok', value?: string) => {
    tokens.push({ id: `${c.kind}:${id}`, kind: c.kind, start: c.start, end: c.end, text: c.text, status, ...(value !== undefined ? { value } : {}) });
  };
  const ignored = (kind: TokenKind, id: string) => ignore.has(`${kind}:${id}`);

  // ----- @Person -----
  const assignees: QuickResult['assignees'] = [];
  for (const m of matches(new RegExp(`(?<![${LETTER}.])@([${LETTER}_-]+)`, 'gu'), work)) {
    const c: Candidate = { kind: 'person', start: m.index, end: m.index + m[0].length, text: m[0] };
    const typed = m[1]!;
    const id = typed.toLowerCase();
    if (ignored('person', id) || !free(c)) continue;
    const exact = ctx.people.filter((p) => [p.name, p.displayName].some((n) => n.toLowerCase() === id));
    const prefix = ctx.people.filter((p) => [p.name, p.displayName].some((n) => n.toLowerCase().startsWith(id)));
    const found = exact.length === 1 ? exact : exact.length > 1 ? exact : prefix;
    const unique = [...new Set(found.map((p) => p.id))];
    let status: TokenStatus = 'ok';
    let value = typed;
    if (unique.length === 1) {
      const p = found[0]!;
      value = p.displayName;
      if (!assignees.some((a) => a.personId === p.id)) assignees.push({ name: p.displayName, personId: p.id, status });
    } else {
      status = unique.length === 0 ? 'unknown' : 'ambiguous';
      if (!assignees.some((a) => a.personId === null && a.name === typed)) assignees.push({ name: typed, personId: null, status });
    }
    addToken(c, id, status, value);
    claim(c);
  }

  // ----- #Kategorie -----
  const categories: QuickResult['categories'] = [];
  for (const m of matches(new RegExp(`(?<![${LETTER}])#([${LETTER}_-]+)`, 'gu'), work)) {
    const c: Candidate = { kind: 'category', start: m.index, end: m.index + m[0].length, text: m[0] };
    const typed = m[1]!;
    const id = typed.toLowerCase();
    if (ignored('category', id) || !free(c)) continue;
    const exact = ctx.categories.filter((k) => k.name.toLowerCase() === id);
    const prefix = ctx.categories.filter((k) => k.name.toLowerCase().startsWith(id));
    const found = exact.length > 0 ? exact : prefix;
    let status: TokenStatus = 'ok';
    let value = typed;
    if (found.length === 1) {
      const k = found[0]!;
      value = k.name;
      if (!categories.some((x) => x.categoryId === k.id)) categories.push({ name: k.name, categoryId: k.id, status });
    } else if (found.length === 0) {
      status = 'new';
      if (!categories.some((x) => x.categoryId === null && x.name.toLowerCase() === id)) categories.push({ name: typed, categoryId: null, status });
    } else {
      status = 'ambiguous';
      if (!categories.some((x) => x.categoryId === null && x.name.toLowerCase() === id)) categories.push({ name: typed, categoryId: null, status });
    }
    addToken(c, id, status, value);
    claim(c);
  }

  // ----- Priorität: nur als eigenes Wort („Achtung!" bleibt Titel) -----
  let priority: QuickResult['priority'] = null;
  {
    const re = new RegExp(`(?<![^\\s])(?:(!{1,2})|(${alt(dict.important)}))(?![${LETTER}!])`, 'giu');
    for (const m of matches(re, work)) {
      const c: Candidate = { kind: 'priority', start: m.index, end: m.index + m[0].length, text: m[0] };
      // „!" muss ganz allein stehen
      if (m[1] && /[^\s]/.test(work[c.end] ?? ' ')) continue;
      const id = norm(m[0]);
      if (ignored('priority', id) || !free(c)) continue;
      priority = m[1] === '!' ? 'medium' : 'high';
      addToken(c, id);
      claim(c);
      break;
    }
  }

  // ----- Wiederholung -----
  let rec: RecCandidate | null = null;
  {
    const found: RecCandidate[] = [];
    const push = (m: RegExpExecArray, mode: RecurrenceEditor['mode'], every: number, weekday?: number) =>
      found.push({ kind: 'recurrence', start: m.index, end: m.index + m[0].length, text: m[0], mode, every, weekday });
    const phrases: [RecurrenceEditor['mode'], string[]][] = [
      ['daily', dict.every.daily],
      ['weekly', dict.every.weekly],
      ['monthly', dict.every.monthly],
      ['yearly', dict.every.yearly],
    ];
    for (const [mode, words] of phrases) for (const m of matches(new RegExp(`${before}${alt(words)}${after}`, 'giu'), work)) push(m, mode, 1);
    const wdAlt = alt(dict.weekdays.flat());
    for (const m of matches(new RegExp(`${before}${alt(dict.everyWeekday)}\\s+(${wdAlt})${after}`, 'giu'), work)) {
      const wd = dict.weekdays.findIndex((names) => names.includes(m[1]!.toLowerCase())) + 1;
      push(m, 'weekly', 1, wd);
    }
    const unitAlt = (u: Unit) => dict.units[u];
    const unitOf = (w: string): { mode: RecurrenceEditor['mode'] } | null => {
      const lw = w.toLowerCase();
      if (unitAlt('day').includes(lw)) return { mode: 'daily' };
      if (unitAlt('week').includes(lw)) return { mode: 'weekly' };
      if (unitAlt('month').includes(lw)) return { mode: 'monthly' };
      if (unitAlt('year').includes(lw)) return { mode: 'yearly' };
      return null;
    };
    const allUnits = alt([...unitAlt('day'), ...unitAlt('week'), ...unitAlt('month'), ...unitAlt('year')]);
    for (const m of matches(new RegExp(`${before}${alt(dict.everyN)}\\s+(\\d{1,3})\\s+(${allUnits})${after}`, 'giu'), work)) {
      const u = unitOf(m[2]!);
      const n = Number(m[1]);
      if (u && n >= 1) push(m, u.mode, n);
    }
    found.sort((a, b) => a.start - b.start);
    for (const c of found) {
      const id = norm(c.text);
      if (ignored('recurrence', id) || !free(c)) continue;
      rec = c;
      addToken(c, id);
      claim(c);
      break;
    }
  }

  // ----- Uhrzeit -----
  let time: { h: number; m: number } | null = null;
  {
    const tp = alt(dict.timePrefix);
    const tw = alt(dict.timeWord);
    const re = new RegExp(`(?<![${LETTER}:.])(?:(${tp})\\s+)?(\\d{1,2})(?:([:.])(\\d{2}))?(?:\\s*(${tw}))?(?![${LETTER}])`, 'giu');
    for (const m of matches(re, work)) {
      const [, prefix, hh, sep, mm, word] = m;
      // ohne Minuten braucht es „Uhr" oder „um"; mit Punkt braucht es „Uhr" (sonst wäre es ein Datum); mit Doppelpunkt reicht es
      if (!sep && !word && !prefix) continue;
      if (sep === '.' && !word) continue;
      let h = Number(hh);
      const mi = mm === undefined ? 0 : Number(mm);
      const meridiem = word && dict.meridiem ? word.toLowerCase() : null;
      if (meridiem) {
        // 12-Stunden-Schreibweise: 12 am = 0 Uhr, 12 pm = 12 Uhr, 7 pm = 19 Uhr
        if (h < 1 || h > 12) continue;
        if (dict.meridiem!.pm.includes(meridiem)) h = h === 12 ? 12 : h + 12;
        else h = h === 12 ? 0 : h;
      }
      if (h > 23 || mi > 59) continue;
      const c: TimeCandidate = { kind: 'time', start: m.index, end: m.index + m[0].length, text: m[0], h, m: mi };
      const id = norm(m[0]);
      if (ignored('time', id) || !free(c)) continue;
      time = { h, m: mi };
      addToken(c, id);
      claim(c);
      break;
    }
  }

  // ----- Datum -----
  let date: Ymd | null = null;
  {
    const found: DateCandidate[] = [];
    const push = (m: RegExpExecArray, resolve: (today: Ymd) => Ymd | null) =>
      found.push({ kind: 'date', start: m.index, end: m.index + m[0].length, text: m[0], resolve });

    for (const m of matches(new RegExp(`${before}${alt(dict.dayAfterTomorrow)}${after}`, 'giu'), work)) push(m, (t) => addDays(t, 2));
    for (const m of matches(new RegExp(`${before}${alt(dict.tomorrow)}${after}`, 'giu'), work)) push(m, (t) => addDays(t, 1));
    for (const m of matches(new RegExp(`${before}${alt(dict.today)}${after}`, 'giu'), work)) push(m, (t) => t);

    const wdAlt = alt(dict.weekdays.flat());
    for (const m of matches(new RegExp(`${before}(?:${alt(dict.next)}\\s+)?(${wdAlt})${after}`, 'giu'), work)) {
      const wd = dict.weekdays.findIndex((names) => names.includes(m[1]!.toLowerCase())) + 1;
      push(m, (t) => nextWeekday(t, wd));
    }

    const unitWords = (u: Unit) => dict.units[u];
    const unitKind = (w: string): Unit | null => (['day', 'week', 'month', 'year'] as Unit[]).find((u) => unitWords(u).includes(w.toLowerCase())) ?? null;
    const allUnits = alt(['day', 'week', 'month', 'year'].flatMap((u) => unitWords(u as Unit)));
    const shift = (t: Ymd, u: Unit, n: number): Ymd => (u === 'day' ? addDays(t, n) : u === 'week' ? addDays(t, 7 * n) : u === 'month' ? addMonths(t, n) : addMonths(t, 12 * n));
    for (const m of matches(new RegExp(`${before}${alt(dict.in)}\\s+(\\d{1,3})\\s+(${allUnits})${after}`, 'giu'), work)) {
      const u = unitKind(m[2]!);
      if (u) push(m, (t) => shift(t, u, Number(m[1])));
    }
    for (const u of ['day', 'week', 'month', 'year'] as Unit[]) {
      for (const m of matches(new RegExp(`${before}${alt(dict.in)}\\s+${alt(dict.inOne[u])}${after}`, 'giu'), work)) push(m, (t) => shift(t, u, 1));
    }

    // 1.12.  1.12.2027  01.12.27
    for (const m of matches(new RegExp(`(?<![${LETTER}.])(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}|\\d{2})?(?![${LETTER}])`, 'gu'), work)) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      if (m[3] === undefined) push(m, (t) => (validYmd(2000, mo, d) || (mo === 2 && d === 29) ? withoutYear(t, mo, d) : null));
      else {
        const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        push(m, () => (validYmd(y, mo, d) ? { y, m: mo, d } : null));
      }
    }
    // 1. Dezember  1. Dez  3. Mai 2028 (Englisch: 1 December  1st Dec  3 May 2028  Dec 1  December 1st 2028)
    const monthAlt = alt(dict.months.flat());
    const pushMonthDate = (m: RegExpExecArray, day: string, month: string, year: string | undefined) => {
      const d = Number(day);
      const mo = dict.months.findIndex((names) => names.includes(month.toLowerCase())) + 1;
      if (year === undefined) push(m, (t) => (mo === 2 && d === 29 ? withoutYear(t, mo, d) : validYmd(2001, mo, d) ? withoutYear(t, mo, d) : null));
      else {
        const y = Number(year);
        push(m, () => (validYmd(y, mo, d) ? { y, m: mo, d } : null));
      }
    };
    const dayPart = dict.dayDot ? '(\\d{1,2})\\.' : '(\\d{1,2})(?:st|nd|rd|th)?';
    for (const m of matches(new RegExp(`(?<![${LETTER}.])${dayPart}\\s*(${monthAlt})\\.?(?:\\s+(\\d{4}))?(?![${LETTER}])`, 'giu'), work)) pushMonthDate(m, m[1]!, m[2]!, m[3]);
    if (dict.monthFirst) {
      for (const m of matches(new RegExp(`(?<![${LETTER}.])(${monthAlt})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?![${LETTER}])`, 'giu'), work)) pushMonthDate(m, m[2]!, m[1]!, m[3]);
    }

    const today = todayOf(ctx);
    found.sort((a, b) => a.start - b.start || b.end - a.end);
    const prefixRe = new RegExp(`(?<![${LETTER}])${alt(dict.datePrefix)}\\s+$`, 'iu');
    for (const c of found) {
      const resolved = c.resolve(today);
      if (!resolved) continue;
      const id = norm(c.text);
      if (ignored('date', id) || !free(c)) continue;
      const start = withPrefix(work, c.start, prefixRe);
      const full: Candidate = { kind: 'date', start, end: c.end, text: text.slice(start, c.end) };
      if (!free(full)) continue;
      date = resolved;
      addToken(full, norm(full.text));
      claim(full);
      break;
    }
  }

  // ----- Termin zusammensetzen -----
  const today = todayOf(ctx);
  const nowMs = ctx.now;
  const [dh, dm] = parseDefault(ctx.defaultTime);
  const instant = (d: Ymd, h: number, m: number) => fromInputValue(`${d.y}-${pad(d.m)}-${pad(d.d)}T${pad(h)}:${pad(m)}`, ctx.tz)!;

  const recC = rec as RecCandidate | null;
  let day: Ymd | null = date;
  if (!day && recC?.weekday) day = nextWeekday(today, recC.weekday);

  let dueAt: string | null = null;
  if (day) {
    if (time) dueAt = instant(day, time.h, time.m);
    else if (cmp(day, today) === 0 && Date.parse(instant(day, dh, dm)) <= nowMs) {
      // „heute" nach der Standard-Uhrzeit: die nächste volle Stunde statt eines gleich überfälligen Termins
      const l = toInputValue(new Date(nowMs).toISOString(), ctx.tz);
      dueAt = instant(day, Math.min(23, Number(l.slice(11, 13)) + 1), 0);
    } else dueAt = instant(day, dh, dm);
  } else if (time || recC) {
    // nur Uhrzeit oder nur Wiederholung: heute, wenn die Zeit noch kommt, sonst morgen
    const h = time?.h ?? dh;
    const m = time?.m ?? dm;
    dueAt = Date.parse(instant(today, h, m)) > nowMs ? instant(today, h, m) : instant(addDays(today, 1), h, m);
  }

  let recurrence: Recurrence | null = null;
  if (recC && dueAt) {
    const editor: RecurrenceEditor = {
      mode: recC.mode,
      every: recC.every,
      weekdays: recC.weekday ? [recC.weekday] : [],
      monthDay: 0,
      unit: 'days',
    };
    recurrence = ruleFromEditor(editor, dueAt, ctx.tz);
  }

  // ----- Titel: was übrig ist (ohne erkannte Teile bleibt er genau so, wie er getippt wurde) -----
  const title = tokens.length === 0 ? text.trim() : work
    .replace(/\0+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '');

  tokens.sort((a, b) => a.start - b.start);
  return { title, dueAt, recurrence, priority, assignees, categories, tokens };
}

function todayOf(ctx: QuickContext): Ymd {
  const l = toInputValue(new Date(ctx.now).toISOString(), ctx.tz);
  return { y: Number(l.slice(0, 4)), m: Number(l.slice(5, 7)), d: Number(l.slice(8, 10)) };
}

function parseDefault(time: string): [number, number] {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return m ? [Number(m[1]), Number(m[2])] : [9, 0];
}

/** Zerlegt den Text in Stücke, damit erkannte Teile hervorgehoben werden können; zusammengesetzt ergeben sie wieder den Originaltext */
export function highlightSegments(text: string, tokens: QuickToken[]): { text: string; token?: QuickToken }[] {
  const out: { text: string; token?: QuickToken }[] = [];
  let at = 0;
  for (const t of [...tokens].sort((a, b) => a.start - b.start)) {
    if (t.start < at) continue;
    if (t.start > at) out.push({ text: text.slice(at, t.start) });
    out.push({ text: text.slice(t.start, t.end), token: t });
    at = t.end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}