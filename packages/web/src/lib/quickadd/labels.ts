import { formatDue, toInputValue } from '../datetime';
import { t } from '../i18n/index.svelte';
import { dayOfMonth, names } from '../i18n/names';
import { describeRecurrence } from '../recurrence';
import type { QuickResult, QuickToken } from './index';

/** Beschriftung der Chips unter der Schnell-Zeile */

/** „Di 3. Nov" / „Tue 3 Nov" (mit Jahr, wenn es nicht dieses ist) */
function dayLabel(dueAt: string, tz: string, nowMs: number): string {
  const l = toInputValue(dueAt, tz);
  const y = Number(l.slice(0, 4));
  const m = Number(l.slice(5, 7));
  const d = Number(l.slice(8, 10));
  const nowYear = Number(toInputValue(new Date(nowMs).toISOString(), tz).slice(0, 4));
  const wd = names().weekdaysShort[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${dayOfMonth(d)} ${names().monthsShort[m - 1]}${y === nowYear ? '' : ` ${y}`}`;
}

export function chipLabel(token: QuickToken, r: QuickResult, tz: string, nowMs = Date.now()): string {
  const hasTime = r.tokens.some((x) => x.kind === 'time');
  const hasDate = r.tokens.some((x) => x.kind === 'date');
  switch (token.kind) {
    case 'date':
      return r.dueAt ? `${dayLabel(r.dueAt, tz, nowMs)}${hasTime ? '' : ` · ${toInputValue(r.dueAt, tz).slice(11)}`}` : token.text;
    case 'time':
      return r.dueAt ? (hasDate ? toInputValue(r.dueAt, tz).slice(11) : formatDue(r.dueAt, nowMs, tz)) : token.text;
    case 'recurrence':
      return r.recurrence ? describeRecurrence(r.recurrence) : token.text;
    case 'priority':
      return r.priority === 'high' ? t('Priorität hoch') : t('Priorität mittel');
    case 'person':
      if (token.status === 'unknown') return t('„{value}" unbekannt', { value: token.value ?? '' });
      if (token.status === 'ambiguous') return t('„{value}" nicht eindeutig', { value: token.value ?? '' });
      return `@${token.value}`;
    case 'category':
      return token.status === 'new' ? t('neu: {value}', { value: token.value ?? '' }) : (token.value ?? token.text);
  }
}

/** Was vor dem Anlegen geklärt werden muss: unbekannte oder mehrdeutige Personen (die Aufgabe bekäme sonst keine Zuständigen und keine Erinnerung) */
export function blockingProblem(r: QuickResult): string | null {
  const bad = r.tokens.find((x) => x.kind === 'person' && x.status !== 'ok');
  if (!bad) return null;
  const value = bad.value ?? '';
  return bad.status === 'unknown'
    ? t('Eine Person „{value}" gibt es nicht. Tippe auf den Chip, um es wegzulassen, oder schreibe den Namen anders.', { value })
    : t('„{value}" passt auf mehrere Personen. Schreibe etwas mehr vom Namen oder tippe auf den Chip, um es wegzulassen.', { value });
}
