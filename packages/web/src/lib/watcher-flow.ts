import { i18n, t, tn } from './i18n/index.svelte';
import { nudgeSentence } from './reminder';
import { detectSymbol } from './symbols/detect';
import type { AssignMode } from './watcher-types';
import { conditionText, nudgeOf, sentenceParts, type WatcherForm } from './watchers';

// Reine Logik für den Wächter-Editor (Ablauf beim Bearbeiten, Assistent beim Anlegen): Texte, Auswahllisten, Chips.

const intOr = (s: string, fallback: number): number => {
  const n = Number(s.trim().replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) ? fallback : Math.round(n);
};

// ---------- An wen ----------

export interface ModeOption {
  mode: AssignMode;
  title: string;
  meta: string;
}

/** Die sieben Arten der Zuweisung für Schritt 3 („Wer"), in der Reihenfolge des Entwurfs; Standard ist `rotation` (reihum) */
export function modeOptions(): ModeOption[] {
  return [
    { mode: 'fixed', title: t('Immer dieselbe Person'), meta: t('z. B. immer Ben') },
    { mode: 'rotation', title: t('Abwechselnd, egal wer da ist'), meta: t('reihum, auch wenn jemand unterwegs ist') },
    { mode: 'rotation_present', title: t('Eine anwesende Person, abwechselnd'), meta: t('reihum, nur wer zu Hause ist') },
    { mode: 'first_home', title: t('Wer zuerst heimkommt'), meta: t('ideal, wenn die Maschine läuft, während alle weg sind') },
    { mode: 'all_present', title: t('Alle, die gerade da sind'), meta: t('wer zuerst abhakt, hat es erledigt') },
    { mode: 'suggest', title: t('Erst vorschlagen'), meta: t('alle Anwesenden fragen, wer übernimmt') },
    { mode: 'none', title: t('Niemand'), meta: t('Karte landet nur auf dem Board') },
  ];
}

/** Kurz hinter „AN WEN" in der Karte des Ablaufs: „abwechselnd, nur Anwesende" */
export function modeSummary(mode: AssignMode): string {
  switch (mode) {
    case 'fixed':
      return t('immer dieselbe Person');
    case 'rotation':
      return t('abwechselnd');
    case 'rotation_present':
      return t('abwechselnd, nur Anwesende');
    case 'first_home':
      return t('wer zuerst heimkommt');
    case 'all_present':
      return t('alle Anwesenden');
    case 'suggest':
      return t('erst vorschlagen');
    default:
      return t('niemand');
  }
}

/** Arten, bei denen die Personen im Kreis zählen (alle außer „Niemand") */
export const usesCircle = (mode: AssignMode): boolean => mode !== 'none';

/** Zahl der Personen, die gewählt sein müssen: bei „immer dieselbe Person" mindestens eine, sonst leer = alle */
export const needsPeople = (mode: AssignMode): boolean => mode === 'fixed';

// ---------- Wenn ----------

/** Chips für „mindestens so lange": die Entwurf-Werte, dazu sofort und ein eigener Wert, der schon gesetzt ist */
export function durationChips(forMin: string, kind: WatcherForm['kind']): number[] {
  const current = intOr(forMin, kind === 'state' ? 0 : 3);
  return [...new Set([0, 1, 3, 5, 10, current])].sort((a, b) => a - b);
}

export const durationLabel = (min: number): string => (min <= 0 ? t('sofort') : t('{n} Min.', { n: min }));

/** Ein Stück Text, das fett steht (Name, Dauer, Schwelle) oder nicht */
export interface Part {
  text: string;
  bold: boolean;
}

/** Zerlegt eine übersetzte Vorlage an den Platzhaltern: Texte bleiben, Platzhalter werden zu den Werten (fett) */
function fill(template: string, values: Record<string, string>): Part[] {
  return template
    .split(/(\{[a-z]+\})/)
    .filter((x) => x !== '')
    .map((x) => (x in values ? { text: values[x]!, bold: true } : { text: x, bold: false }));
}

/** Der Auslöser im Ablauf als kurzer Satz mit fetten Teilen: „**Waschmaschine Leistung** liegt **3 Min.** unter **5 W**" */
export function whenParts(f: Pick<WatcherForm, 'entityName' | 'entityId' | 'entityUnit' | 'kind' | 'to' | 'value' | 'forMin' | 'leadHours' | 'forecastHours'>): Part[] {
  const entity = f.entityName || f.entityId || '…';
  const minutes = intOr(f.forMin, f.kind === 'state' ? 0 : 3);
  const duration = t('{n} Min.', { n: minutes });
  const unit = f.entityUnit ? ` ${f.entityUnit}` : '';
  if (f.kind === 'calendar_event') return fill(t('Im Kalender {entity} steht {lead} vor einem Termin etwas an'), { '{entity}': entity, '{lead}': tn('{n} Stunde', '{n} Stunden', intOr(f.leadHours, 12)) });
  if (f.kind === 'forecast') return fill(t('{entity} sagt in den nächsten {hours} Regen voraus'), { '{entity}': entity, '{hours}': tn('{n} Stunde', '{n} Stunden', intOr(f.forecastHours, 3)) });
  if (f.kind === 'state') {
    const to = f.to.trim() || '…';
    return minutes > 0
      ? fill(t('{entity} steht {duration} auf {threshold}'), { '{entity}': entity, '{duration}': duration, '{threshold}': to })
      : fill(t('{entity} wechselt zu {threshold}'), { '{entity}': entity, '{threshold}': to });
  }
  const threshold = `${f.value.trim() || '…'}${unit}`;
  const template =
    f.kind === 'below'
      ? minutes > 0 ? t('{entity} liegt {duration} unter {threshold}') : t('{entity} liegt unter {threshold}')
      : minutes > 0 ? t('{entity} liegt {duration} über {threshold}') : t('{entity} liegt über {threshold}');
  return fill(template, { '{entity}': entity, '{duration}': duration, '{threshold}': threshold });
}

// ---------- Dann ----------

export type DueChip = 'now' | 'in30' | 'in60' | 'evening' | 'none' | 'custom';

/** Welcher Chip der Fälligkeit zur Regel passt; alles andere ist „eigene" Fälligkeit (Minuten, Uhrzeit) */
export function dueChipOf(f: Pick<WatcherForm, 'dueKind' | 'dueMinutes' | 'dueDay' | 'dueTime'>): DueChip {
  if (f.dueKind === 'none') return 'none';
  if (f.dueKind === 'in') {
    const n = intOr(f.dueMinutes, -1);
    return n === 0 ? 'now' : n === 30 ? 'in30' : n === 60 ? 'in60' : 'custom';
  }
  return f.dueDay === 'today' && f.dueTime === '18:00' ? 'evening' : 'custom';
}

/** Setzt die Fälligkeit eines Chips ins Formular (eine Kopie der Felder, die sich ändern) */
export function dueFields(chip: Exclude<DueChip, 'custom'>): Pick<WatcherForm, 'dueKind' | 'dueMinutes' | 'dueDay' | 'dueTime'> {
  switch (chip) {
    case 'now':
      return { dueKind: 'in', dueMinutes: '0', dueDay: 'tomorrow', dueTime: '08:00' };
    case 'in30':
      return { dueKind: 'in', dueMinutes: '30', dueDay: 'tomorrow', dueTime: '08:00' };
    case 'in60':
      return { dueKind: 'in', dueMinutes: '60', dueDay: 'tomorrow', dueTime: '08:00' };
    case 'evening':
      return { dueKind: 'at', dueMinutes: '30', dueDay: 'today', dueTime: '18:00' };
    default:
      return { dueKind: 'none', dueMinutes: '30', dueDay: 'tomorrow', dueTime: '08:00' };
  }
}

/** Die Fälligkeit als Text für die Vorschau der Karte („in 30 Min."), leer ohne Termin */
export function dueText(f: Pick<WatcherForm, 'dueKind' | 'dueMinutes' | 'dueDay' | 'dueTime'>): string {
  if (f.dueKind === 'in') return intOr(f.dueMinutes, 0) === 0 ? t('sofort') : t('in {n} Min.', { n: intOr(f.dueMinutes, 0) });
  if (f.dueKind === 'at') return `${f.dueDay === 'today' ? t('heute') : t('morgen')} ${f.dueTime}`;
  return t('ohne Termin');
}

// ---------- Erledigt sich selbst, Zusammenfassung ----------

/** „wenn Tür der Waschmaschine zu „on" wechselt", leer ohne Bedingung */
export function doneText(f: WatcherForm): string {
  if (!f.doneOn) return '';
  const cond = conditionText({ entityName: f.doneEntityName, entityId: f.doneEntityId, entityUnit: '', kind: f.doneKind, to: f.doneTo, value: f.doneValue, forMin: '0', leadHours: '12', forecastHours: '3' });
  return t('wenn {cond}', { cond });
}

/**
 * Der Satz als Zusammenfassung (Schritt 4 und oben im Ablauf), mit fetten Teilen wie im Entwurf: Entität, Schwelle, wer, Karte.
 * Dazu kommen die Fälligkeit in Klammern und, wenn sich die Karte von selbst erledigt, ein zweiter Satz.
 */
export function summaryParts(f: WatcherForm, personName: (id: string) => string): Part[] {
  const parts: Part[] = sentenceParts(f, personName).map((p) => ({
    text: p.field === 'title' ? t('„{title}“', { title: p.text }) : p.text,
    bold: !!p.field && p.field !== 'duration' && p.field !== 'lead' && p.field !== 'hours',
  }));
  // Der Satz endet mit einem Punkt: Fälligkeit und Erledigen stehen davor und danach
  const last = parts[parts.length - 1];
  if (last && last.text.endsWith('.')) {
    last.text = last.text.slice(0, -1);
    const due = f.dueKind === 'none' ? '' : ` (${t('fällig {when}', { when: dueText(f) })})`;
    parts.push({ text: `${due}.`, bold: false });
  }
  const nudge = nudgeOf(f);
  if (nudge) parts.push({ text: ` ${nudgeSentence(nudge)}`, bold: false });
  if (f.doneOn && f.doneEntityId) parts.push({ text: ` ${t('Sie erledigt sich, {cond}.', { cond: doneText(f) })}`, bold: false });
  return parts;
}

/** Wie `summaryParts`, als ein Text (für Screenreader und Tests) */
export const summaryText = (f: WatcherForm, personName: (id: string) => string): string => summaryParts(f, personName).map((p) => p.text).join('');

// ---------- Feinschliff ----------

export type FineKey = 'name' | 'category' | 'cooldown' | 'dedupe' | 'nudge' | 'count';

/** Die Chips unter „Feinschliff" im Ablauf: Beschriftung je Einstellung mit dem aktuellen Wert */
export function fineChips(f: WatcherForm): { key: FineKey; label: string }[] {
  const cooldown = intOr(f.cooldownMin, 10);
  const nudge = nudgeOf(f);
  const count = Math.max(1, intOr(f.count, 1));
  const chips: { key: FineKey; label: string }[] = [
    { key: 'name', label: t('Name: {name}', { name: f.name.trim() || '…' }) },
    { key: 'category', label: t('Kategorie: {name}', { name: f.category.trim() || t('keine') }) },
    { key: 'cooldown', label: t('Sperrzeit {n} Min.', { n: cooldown }) },
    { key: 'dedupe', label: f.dedupe ? t('Keine zweite Karte') : t('Zweite Karte erlaubt') },
    { key: 'nudge', label: nudge === null ? t('Nicht stupsen') : nudge.everyMin === null ? t('Stupsen nach {n} Min.', { n: nudge.afterMin }) : t('Stupsen nach {n} Min., alle {e} Min., {max} ×', { n: nudge.afterMin, e: nudge.everyMin, max: nudge.max }) },
    { key: 'count', label: t('Erst beim {n}. Mal', { n: count }) },
  ];
  // Kalender und Vorhersage fragen im Takt ab: ein Zähler ergibt dort keinen Sinn
  return f.kind === 'calendar_event' || f.kind === 'forecast' ? chips.filter((c) => c.key !== 'count') : chips;
}

// ---------- Schwellen-Regler ----------

/** 1, 2 oder 5 mal Zehnerpotenz: die erste „runde" Zahl, die mindestens `x` ist */
function niceCeil(x: number): number {
  const pow = 10 ** Math.floor(Math.log10(x));
  return ([1, 2, 5, 10].map((m) => m * pow).find((c) => c >= x * (1 - 1e-9)) ?? pow * 10);
}

/** … und die größte runde Zahl, die höchstens `x` ist */
function niceFloor(x: number): number {
  const pow = 10 ** Math.floor(Math.log10(x));
  return [5, 2, 1].map((m) => m * pow).find((c) => c <= x * (1 + 1e-9)) ?? pow;
}

/**
 * Bereich des Reglers für die Schwelle: von 0 (oder darunter bei negativen Werten) bis zu einer runden Zahl, die den Wert gut fünfmal
 * umfasst (5 W: 0 bis 50), mindestens bis 10; die Schrittweite ergibt rund 50 Stufen. Das Zahlenfeld daneben kennt keine Grenze.
 */
export function sliderRange(value: number | null): { min: number; max: number; step: number } {
  const v = value === null || !Number.isFinite(value) ? 0 : value;
  const max = niceCeil(Math.max(Math.abs(v) * 5, 10));
  const min = v < 0 ? -max : 0;
  return { min, max, step: niceFloor((max - min) / 50) };
}

/** Der Satz unter der Dauer: was die Regel in dem Fenster getan hätte (Zahl der Auslösungen aus dem Verlauf) */
export function durationHint(minutes: number, hours: number, fired: number): string {
  const lead = minutes <= 0 ? t('Ohne Wartezeit') : t('Mit {duration}', { duration: durationLabel(minutes) });
  const window = tn('{n} Stunde', '{n} Stunden', hours);
  if (fired === 0) return t('{lead} hätte Stups in den letzten {window} nicht ausgelöst.', { lead, window });
  if (fired === 1) return t('{lead} hätte Stups in den letzten {window} genau einmal ausgelöst – kurze Pausen zählen nicht.', { lead, window });
  return t('{lead} hätte Stups in den letzten {window} {n} Mal ausgelöst – kurze Pausen zählen nicht.', { lead, window, n: fired });
}

/** Symbol zu einem Namen der Entität: Namen aus Home Assistant sind oft deutsch, auch wenn die Oberfläche Englisch spricht, darum zählt die zweite Sprache mit */
export function nameSymbol(name: string): string | null {
  return detectSymbol(name) ?? detectSymbol(name, i18n.lang === 'de' ? 'en' : 'de');
}

/**
 * Die Bedingungsarten in genau einer Reihenfolge: unter, über, Zustand (so im Entwurf WaechterB; WaechterB4 und WaechterC zeigen sie nicht).
 * „Wenn" (Auslöser) und „Erledigt sich selbst" (Feinschliff und Ablauf) nehmen beide diese Liste.
 */
export const CONDITION_ORDER = ['below', 'above', 'state'] as const;
export type ConditionId = (typeof CONDITION_ORDER)[number];

export function conditionItems(): { id: ConditionId; label: string }[] {
  const label: Record<ConditionId, string> = { below: t('unter'), above: t('über'), state: t('Zustand') };
  return CONDITION_ORDER.map((id) => ({ id, label: label[id] }));
}
