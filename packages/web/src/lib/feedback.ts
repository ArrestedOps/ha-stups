import type { TileColor } from '../components/ui/Tile.svelte';
import { i18n, t } from './i18n/index.svelte';
import type { Tab } from './tabs';

/**
 * Rückmeldungen (Feedback): Arten, Zeichenzähler, was mitgesendet wird und der Text zum Kopieren. Alles reine Funktionen
 * (Server: feedback.ts, store/feedback.ts, api/feedback.ts; Fenster: components/FeedbackSheet.svelte).
 */

export type FeedbackKind = 'bug' | 'idea' | 'praise' | 'criticism' | 'other';
export type FeedbackStatus = 'neu' | 'gelesen' | 'erledigt';

/** Wie viele Zeichen der Text höchstens hat (der Server prüft dieselbe Grenze) */
export const FEEDBACK_MAX = 1000;
/** Ab so vielen Zeichen färbt sich der Zähler (die letzten 100) */
const WARN_FROM = 900;

export interface KindInfo {
  id: FeedbackKind;
  /** Symbol aus der Bibliothek (SymbolIcon) */
  symbol?: string;
  /** oder ein Linien-Symbol (Icon) */
  icon?: string;
  color: TileColor;
}

/** Die Arten in der Reihenfolge der Auswahl: Fehler, Wunsch, Lob, Kritik, Sonstiges */
export const FEEDBACK_KINDS: readonly KindInfo[] = [
  { id: 'bug', symbol: 'bug-outline', color: 'red' },
  { id: 'idea', symbol: 'lightbulb-on-outline', color: 'purple' },
  { id: 'praise', symbol: 'heart-outline', color: 'green' },
  { id: 'criticism', symbol: 'alert-outline', color: 'orange' },
  { id: 'other', icon: 'message', color: 'gray' },
];

export const kindInfo = (id: FeedbackKind): KindInfo => FEEDBACK_KINDS.find((k) => k.id === id)!;

export function kindLabel(kind: FeedbackKind): string {
  switch (kind) {
    case 'bug':
      return t('Fehler melden');
    case 'idea':
      return t('Verbesserung oder Wunsch');
    case 'praise':
      return t('Lob');
    case 'criticism':
      return t('Kritik');
    case 'other':
      return t('Sonstiges');
  }
}

/** Kurze Erklärung unter dem Namen der Art in der Auswahl */
export function kindHint(kind: FeedbackKind): string {
  switch (kind) {
    case 'bug':
      return t('Etwas funktioniert nicht');
    case 'idea':
      return t('Das fehlt oder geht besser');
    case 'praise':
      return t('Das gefällt mir');
    case 'criticism':
      return t('Das stört mich');
    case 'other':
      return t('Alles andere');
  }
}

export function messagePlaceholder(kind: FeedbackKind): string {
  switch (kind) {
    case 'bug':
      return t('Was ist passiert? Was hast du erwartet?');
    case 'idea':
      return t('Was wünschst du dir? Wobei würde es dir helfen?');
    case 'praise':
      return t('Was gefällt dir besonders gut?');
    case 'criticism':
      return t('Was gefällt dir nicht oder nervt dich?');
    case 'other':
      return t('Was möchtest du uns mitteilen?');
  }
}

export interface CounterInfo {
  /** „123 / 1000" */
  text: string;
  /** ok: normal; warn: kurz vor dem Limit; full: Limit erreicht */
  tone: 'ok' | 'warn' | 'full';
  left: number;
}

/** Zähler unter dem Textfeld; `length` ist die Länge des Textes im Feld */
export function counterInfo(length: number, max = FEEDBACK_MAX): CounterInfo {
  const left = Math.max(0, max - length);
  return { text: `${length} / ${max}`, tone: length >= max ? 'full' : length >= WARN_FROM ? 'warn' : 'ok', left };
}

/** Darf gesendet werden: eine Art gewählt, Text nach dem Kürzen 1 bis 1000 Zeichen, nicht schon beim Senden */
export function canSendFeedback(s: { kind: FeedbackKind | null; message: string; busy: boolean }): boolean {
  const len = s.message.trim().length;
  return s.kind !== null && len >= 1 && len <= FEEDBACK_MAX && !s.busy;
}

/** Was mit jeder Rückmeldung mitgeht (der Server ergänzt Version, Kanal und Browser): nie Person, Anmeldedaten oder Adressen */
export interface FeedbackContext {
  view: Tab;
  language: 'de' | 'en';
  scheme: 'dark' | 'light';
  viewport: { w: number; h: number };
  embedded: boolean;
}

export function feedbackContext(env: { tab: Tab; lang: 'de' | 'en'; dark: boolean; width: number; height: number; embedded: boolean }): FeedbackContext {
  return {
    view: env.tab,
    language: env.lang,
    scheme: env.dark ? 'dark' : 'light',
    viewport: { w: Math.round(env.width), h: Math.round(env.height) },
    embedded: env.embedded,
  };
}

/** Die Rückmeldung in der Verwaltung (GET api/feedback) */
export interface FeedbackItem {
  id: string;
  personId: string | null;
  personName: string | null;
  kind: FeedbackKind;
  message: string;
  hasImage: boolean;
  hasThumb: boolean;
  meta: Partial<FeedbackContext> & { version?: string; channel?: string; userAgent?: string };
  status: FeedbackStatus;
  createdAt: string;
}

const pad = (n: number | string) => String(n).padStart(2, '0');

/** „05.11.2026 10:00" (Englisch: 05/11/2026 10:00) in der Zeitzone `tz` */
export function formatStamp(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(iso));
  const p: Record<string, string> = {};
  for (const x of parts) p[x.type] = x.value;
  const sep = i18n.lang === 'de' ? '.' : '/';
  return `${pad(p.day!)}${sep}${pad(p.month!)}${sep}${p.year} ${pad(p.hour!)}:${pad(p.minute!)}`;
}

const viewName = (v: Tab): string => (v === 'tasks' ? t('Aufgaben') : v === 'boards' ? 'Boards' : t('Wächter'));

/** Die Rückmeldung als Text zum Weitergeben (Fehlerbericht, Issue): Art und Zeit, Absender, Text, dann die technischen Angaben */
export function feedbackAsText(item: FeedbackItem, tz: string): string {
  const m = item.meta;
  const lines = [`${kindLabel(item.kind)} · ${formatStamp(item.createdAt, tz)}`];
  if (item.personName) lines.push(t('Von {name}', { name: item.personName }));
  lines.push('', item.message);
  if (item.hasImage) lines.push('', t('Mit Bild (in Stups unter Einstellungen › Feedback)'));
  const tech: string[] = [];
  if (m.version) tech.push(`Stups ${m.version}${m.channel === 'beta' ? ' (beta)' : ''}`);
  if (m.view) tech.push(t('Ansicht {view}', { view: viewName(m.view) }));
  if (m.viewport) tech.push(t('Fenster {w} × {h}', { w: m.viewport.w, h: m.viewport.h }));
  if (m.scheme) tech.push(m.scheme === 'dark' ? t('Dunkel') : t('Hell'));
  if (m.language) tech.push(m.language === 'de' ? 'Deutsch' : 'English');
  if (m.embedded !== undefined) tech.push(m.embedded ? t('in Home Assistant eingebettet') : t('eigenständig'));
  if (tech.length) lines.push('', tech.join(' · '));
  if (m.userAgent) lines.push(`Browser: ${m.userAgent}`);
  return lines.join('\n');
}
