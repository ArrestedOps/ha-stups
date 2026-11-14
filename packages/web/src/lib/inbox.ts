import type { InboxEntry, InboxKind } from './api';
import { dayOfMonth, names } from './i18n/names';
import { t } from './i18n/index.svelte';

/**
 * Mitteilungen (Glocke): reine Funktionen über den Posteingang, den der Server je Person liefert (GET /api/inbox, store/inbox.ts).
 * Gruppierung nach Tag in der Zeitzone der Person, Zusammenfassung (Titel, Zeile darunter, Symbol, Farbe) und Ungelesen-Zählung.
 * Ungelesen heißt: neuer als der Gelesen-Marker der Person (`seenAt`); null = noch nie gelesen.
 */

export type InboxChip = 'all' | 'nudge' | 'watcher' | 'done' | 'comment';
export const INBOX_CHIPS: InboxChip[] = ['all', 'nudge', 'watcher', 'done', 'comment'];

/** Zu welchem Chip eine Art gehört; Erinnerungen und Änderungen stehen nur unter „Alle" (null) */
export function chipOf(kind: InboxKind): Exclude<InboxChip, 'all'> | null {
  switch (kind) {
    case 'nudge':
    case 'reply':
      return 'nudge';
    case 'watcher':
      return 'watcher';
    case 'done':
    case 'confirm':
      return 'done';
    case 'comment':
      return 'comment';
    default:
      return null;
  }
}

export const filterEntries = (items: InboxEntry[], chip: InboxChip): InboxEntry[] => (chip === 'all' ? items : items.filter((i) => chipOf(i.kind) === chip));

export const isUnread = (entry: Pick<InboxEntry, 'at'>, seenAt: string | null): boolean => seenAt === null || Date.parse(entry.at) > Date.parse(seenAt);

export const unreadCount = (items: Pick<InboxEntry, 'at'>[], seenAt: string | null): number => items.filter((i) => isUnread(i, seenAt)).length;

/** Die Zahl an der Glocke: 1 bis 9 wie sie ist, ab 10 „9+" (klein und dezent, kein Alarm) */
export const bellText = (n: number): string => (n >= 10 ? '9+' : String(n));

// ----- Tage in der Zeitzone der Person -----

const dayFormats = new Map<string, Intl.DateTimeFormat>();
/** Der Kalendertag eines Zeitpunkts in dieser Zeitzone: { y, m, d } */
function localDay(ms: number, tz: string): { y: number; m: number; d: number } {
  let f = dayFormats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' });
    dayFormats.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return { y: p.year!, m: p.month!, d: p.day! };
}

const dayNumber = (l: { y: number; m: number; d: number }) => Date.UTC(l.y, l.m - 1, l.d) / 86_400_000;

export type InboxGroupKey = 'today' | 'yesterday' | 'older';
export interface InboxGroup {
  key: InboxGroupKey;
  items: InboxEntry[];
}

/** Heute, Gestern, Älter (in dieser Reihenfolge, leere Gruppen fehlen); die Reihenfolge innerhalb bleibt, wie der Server sie liefert */
export function groupByDay(items: InboxEntry[], nowMs: number, tz: string): InboxGroup[] {
  const today = dayNumber(localDay(nowMs, tz));
  const groups: Record<InboxGroupKey, InboxEntry[]> = { today: [], yesterday: [], older: [] };
  for (const i of items) {
    const diff = today - dayNumber(localDay(Date.parse(i.at), tz));
    groups[diff <= 0 ? 'today' : diff === 1 ? 'yesterday' : 'older'].push(i);
  }
  return (['today', 'yesterday', 'older'] as const).filter((k) => groups[k].length > 0).map((key) => ({ key, items: groups[key] }));
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();
/** „11:40" (Ortszeit, 24 Stunden); in der Gruppe „Älter" mit Tag davor: „29. Okt" */
export function timeLabel(iso: string, group: InboxGroupKey, tz: string): string {
  const ms = Date.parse(iso);
  if (group === 'older') {
    const l = localDay(ms, tz);
    return `${dayOfMonth(l.d)} ${names().monthsShort[l.m - 1]}`;
  }
  let f = timeFormats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    timeFormats.set(tz, f);
  }
  return f.format(new Date(ms));
}

// ----- Zusammenfassung eines Eintrags -----

export type InboxTileColor = 'purple' | 'orange' | 'red' | 'green' | 'blue' | 'teal' | 'gray';
export interface InboxView {
  title: string;
  meta: string;
  icon: string;
  color: InboxTileColor;
}

export interface InboxContext {
  nameOf: (personId: string | null) => string;
  tz: string;
}

/** Kurzer Wochentag des Tages, an dem der Termin war („Mo"), in der Zeitzone der Person */
function weekdayShort(iso: string, tz: string): string {
  const l = localDay(Date.parse(iso), tz);
  return names().weekdaysShort[new Date(Date.UTC(l.y, l.m - 1, l.d)).getUTCDay()]!;
}

/** Die Vorlagen-Stupse in der Sprache der Person (der Server speichert den deutschen Text; eigene Texte bleiben, wie sie sind) */
function nudgeText(e: InboxEntry): string | null {
  const byTemplate: Record<string, string> = {
    think: t('Denkst du dran?'),
    today: t('Heute noch?'),
    help: t('Brauch deine Hilfe'),
    thanks: t('Danke dir! ❤️'),
  };
  if (e.detail && e.detail in byTemplate) return byTemplate[e.detail]!;
  return e.text;
}

/** Namen als Aufzählung ("Anna", "Anna, Ben") */
const list = (names: string[]): string => names.join(', ');

/** Titel, Zeile darunter, Symbol und Farbe eines Eintrags: Text entsteht hier aus Art und Daten (zweisprachig), nicht im Server */
export function entryView(e: InboxEntry, ctx: InboxContext): InboxView {
  const who = ctx.nameOf(e.actorId);
  switch (e.kind) {
    case 'nudge': {
      const text = nudgeText(e);
      return { title: t('{name} stupst dich 👋', { name: who }), meta: text ? t('{card} · „{text}“', { card: e.cardTitle, text }) : e.cardTitle, icon: 'hand', color: 'purple' };
    }
    case 'reply':
      return { title: t('{name}: Mach ich 👍', { name: who }), meta: t('Antwort auf deinen Stups · {card}', { card: e.cardTitle }), icon: 'user', color: 'teal' };
    case 'watcher': {
      // Ohne Aufgabe: Zuständige weg (der Wächter legt keine Aufgaben mehr an) oder nur kleiner geworden (läuft weiter)
      if (e.notice && e.detail === 'assignees_missing') {
        return {
          title: t('{name} braucht neue Zuständige', { name: e.watcherName ?? '' }),
          meta:
            e.notice.removedNames.length === 1
              ? t('{who} ist nicht mehr im Board „{board}“', { who: list(e.notice.removedNames), board: e.notice.boardName })
              : t('{who} sind nicht mehr im Board „{board}“', { who: list(e.notice.removedNames), board: e.notice.boardName }),
          icon: 'shield',
          color: 'red',
        };
      }
      if (e.notice) {
        return {
          title: t('{name}: {who} entfernt', { name: e.watcherName ?? '', who: list(e.notice.removedNames) }),
          meta: t('läuft weiter mit {rest}', { rest: list(e.notice.remainingNames) }),
          icon: 'shield',
          color: 'purple',
        };
      }
      const title = t('Wächter: {name}', { name: e.watcherName ?? '' });
      let meta: string;
      if (!e.assigned) meta = t('„{title}“ sucht jemanden, der sie übernimmt', { title: e.cardTitle });
      else if (e.detail === 'passed') meta = t('Aufgabe „{title}“ wurde dir weitergegeben', { title: e.cardTitle });
      else if (e.detail === 'nudged') meta = t('Aufgabe „{title}“ wartet noch auf dich', { title: e.cardTitle });
      else meta = t('Aufgabe „{title}“ ist jetzt deine', { title: e.cardTitle });
      return { title, meta, icon: 'shield', color: 'orange' };
    }
    case 'done':
      return { title: t('{name} hat erledigt', { name: who }), meta: e.cardTitle, icon: 'done', color: 'green' };
    case 'comment':
      return { title: t('{name} hat kommentiert', { name: who }), meta: e.text ? t('{card}: „{text}“', { card: e.cardTitle, text: e.text }) : e.cardTitle, icon: 'message', color: 'blue' };
    case 'reminder':
      if (e.detail === 'nag') {
        return { title: t('Überfällig'), meta: e.dueAt ? t('{card} · seit {day}', { card: e.cardTitle, day: weekdayShort(e.dueAt, ctx.tz) }) : e.cardTitle, icon: 'alert', color: 'red' };
      }
      return { title: e.detail === 'due' ? t('Jetzt fällig') : t('Erinnerung'), meta: e.cardTitle, icon: 'clock', color: 'gray' };
    case 'change': {
      const title =
        e.detail === 'reopened' ? t('{name} hat wieder geöffnet', { name: who }) : e.detail === 'due' ? t('{name} hat den Termin geändert', { name: who }) : t('{name} hat verschoben', { name: who });
      return { title, meta: e.cardTitle, icon: e.detail === 'due' ? 'calendar' : 'undo', color: 'gray' };
    }
    case 'confirm':
      return { title: t('{name} wartet auf deine Bestätigung', { name: who }), meta: e.cardTitle, icon: 'check', color: 'green' };
  }
}
