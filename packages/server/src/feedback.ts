import { ValidationError } from './errors.js';
import { t } from './i18n/index.js';

/** Rückmeldungen aus der App: Fehler, Wunsch, Lob, Kritik, Sonstiges. Die Oberfläche kennt dieselben Kennungen (lib/feedback.ts). */
export const FEEDBACK_KINDS = ['bug', 'idea', 'praise', 'criticism', 'other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_STATUSES = ['neu', 'gelesen', 'erledigt'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_MAX_CHARS = 1000;
/** Je Person und Stunde */
export const FEEDBACK_PER_HOUR = 10;
/** Das Bild kommt verkleinert (höchstens 2048 Pixel, JPEG) aus der App; darüber stimmt etwas nicht */
export const FEEDBACK_MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** So viele Rückmeldungen liefert die Liste höchstens */
export const FEEDBACK_LIST_LIMIT = 500;
const USER_AGENT_MAX = 160;

/** Was die Oberfläche und der Server zu einer Rückmeldung mitspeichern (nie Anmeldedaten, Adressen oder Geheimnisse) */
export interface FeedbackMeta {
  version?: string;
  channel?: string;
  view?: 'tasks' | 'boards' | 'watchers';
  language?: 'de' | 'en';
  scheme?: 'dark' | 'light';
  viewport?: { w: number; h: number };
  embedded?: boolean;
  userAgent?: string;
}

export function parseFeedbackKind(value: unknown): FeedbackKind {
  if (typeof value !== 'string' || !(FEEDBACK_KINDS as readonly string[]).includes(value)) throw new ValidationError(t('Bitte wähle eine Art der Rückmeldung'));
  return value as FeedbackKind;
}

export function parseFeedbackStatus(value: unknown): FeedbackStatus {
  if (typeof value !== 'string' || !(FEEDBACK_STATUSES as readonly string[]).includes(value)) throw new ValidationError(t('Der Stand muss neu, gelesen oder erledigt sein'));
  return value as FeedbackStatus;
}

/** Zeilenumbrüche vereinheitlichen, Steuerzeichen (außer Zeilenumbruch und Tab) entfernen */
export function cleanMessageText(raw: string): string {
  // eslint-disable-next-line no-control-regex -- Steuerzeichen sollen hier gerade entfernt werden
  return raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
}

/** Der Text: Pflicht, nur Text, nach dem Kürzen 1 bis 1000 Zeichen */
export function parseFeedbackMessage(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError(t('Bitte schreibe etwas'));
  const text = cleanMessageText(value);
  if (text === '') throw new ValidationError(t('Bitte schreibe etwas'));
  if (text.length > FEEDBACK_MAX_CHARS) throw new ValidationError(t('Der Text ist zu lang (höchstens {max} Zeichen)', { max: FEEDBACK_MAX_CHARS }));
  return text;
}

const VIEWS = ['tasks', 'boards', 'watchers'] as const;
const intIn = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max;

/**
 * Der Kontext, den die Oberfläche mitschickt (JSON-Text oder Objekt): nur bekannte Felder mit gültigen Werten bleiben,
 * alles andere fällt still weg. Ein kaputter Kontext darf eine Rückmeldung nie verhindern.
 */
export function parseFeedbackContext(raw: unknown): FeedbackMeta {
  let value = raw;
  if (typeof raw === 'string') {
    if (raw.length > 2000) return {};
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const c = value as Record<string, unknown>;
  const out: FeedbackMeta = {};
  if ((VIEWS as readonly unknown[]).includes(c.view)) out.view = c.view as FeedbackMeta['view'];
  if (c.language === 'de' || c.language === 'en') out.language = c.language;
  if (c.scheme === 'dark' || c.scheme === 'light') out.scheme = c.scheme;
  const vp = c.viewport as Record<string, unknown> | null | undefined;
  if (vp && typeof vp === 'object' && intIn(vp.w, 20_000) && intIn(vp.h, 20_000)) out.viewport = { w: vp.w, h: vp.h };
  if (typeof c.embedded === 'boolean') out.embedded = c.embedded;
  return out;
}

/** User-Agent gekürzt, ohne Steuerzeichen; leer, wenn keiner da ist */
export function shortUserAgent(header: unknown): string | undefined {
  if (typeof header !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex -- Steuerzeichen sollen hier gerade entfernt werden
  const ua = header.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, USER_AGENT_MAX);
  return ua === '' ? undefined : ua;
}
