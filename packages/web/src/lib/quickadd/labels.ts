import { formatDue, toInputValue } from '../datetime';
import { describeRecurrence } from '../recurrence';
import type { QuickResult, QuickToken } from './index';

/** Beschriftung der Chips unter der Schnell-Zeile (deutsch; mit Englisch kommt hier ein zweiter Satz hinzu) */
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** „Di 3. Nov" (mit Jahr, wenn es nicht dieses ist) */
function dayLabel(dueAt: string, tz: string, nowMs: number): string {
  const l = toInputValue(dueAt, tz);
  const y = Number(l.slice(0, 4));
  const m = Number(l.slice(5, 7));
  const d = Number(l.slice(8, 10));
  const nowYear = Number(toInputValue(new Date(nowMs).toISOString(), tz).slice(0, 4));
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${d}. ${MONTHS[m - 1]}${y === nowYear ? '' : ` ${y}`}`;
}

export function chipLabel(token: QuickToken, r: QuickResult, tz: string, nowMs = Date.now()): string {
  const hasTime = r.tokens.some((t) => t.kind === 'time');
  const hasDate = r.tokens.some((t) => t.kind === 'date');
  switch (token.kind) {
    case 'date':
      return r.dueAt ? `${dayLabel(r.dueAt, tz, nowMs)}${hasTime ? '' : ` · ${toInputValue(r.dueAt, tz).slice(11)}`}` : token.text;
    case 'time':
      return r.dueAt ? (hasDate ? toInputValue(r.dueAt, tz).slice(11) : formatDue(r.dueAt, nowMs, tz)) : token.text;
    case 'recurrence':
      return r.recurrence ? describeRecurrence(r.recurrence) : token.text;
    case 'priority':
      return r.priority === 'high' ? 'Priorität hoch' : 'Priorität mittel';
    case 'person':
      if (token.status === 'unknown') return `„${token.value}" unbekannt`;
      if (token.status === 'ambiguous') return `„${token.value}" nicht eindeutig`;
      return `@${token.value}`;
    case 'category':
      return token.status === 'new' ? `neu: ${token.value}` : (token.value ?? token.text);
  }
}

/** Was vor dem Anlegen geklärt werden muss: unbekannte oder mehrdeutige Personen (die Karte bekäme sonst keine Zuständigen und keine Erinnerung) */
export function blockingProblem(r: QuickResult): string | null {
  const bad = r.tokens.find((t) => t.kind === 'person' && t.status !== 'ok');
  if (!bad) return null;
  return bad.status === 'unknown'
    ? `Eine Person „${bad.value}" gibt es nicht. Tippe auf den Chip, um es wegzulassen, oder schreibe den Namen anders.`
    : `„${bad.value}" passt auf mehrere Personen. Schreibe etwas mehr vom Namen oder tippe auf den Chip, um es wegzulassen.`;
}
