import type { TodayCard } from './api';
import { t } from './i18n/index.svelte';
import type { ScheduleCard } from './schedule';
import { nudgesToMe } from './tasks';

/**
 * Was die Glocke oben zeigt. Die volle Datenbasis (Posteingang mit Gelesen-Marker) kommt mit Phase 6b; bis dahin steht hier nur, was ohne neue
 * Server-Teile ehrlich ableitbar ist und gerade **für mich offen** ist: Stupse an mich, Bestätigungen, die ich geben darf, und Karten vom Haus,
 * die auf mich warten. Ist nichts offen, gibt es keinen Punkt an der Glocke.
 */
export type InboxKind = 'nudge' | 'confirm' | 'house';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  title: string;
  sub: string;
  /** die Karte dazu (ein Tipp öffnet sie) */
  card: ScheduleCard | TodayCard;
  cardId: string;
  /** seit wann es wartet, wenn die Daten es hergeben (Stupse tragen keinen Zeitpunkt) */
  since: string | null;
}

export interface InboxInput {
  /** offene Karten mit Termin (wie die Liste in Aufgaben) */
  open: ScheduleCard[];
  /** Karten vom Haus (GET /api/today) */
  house: TodayCard[];
  meId: string | null;
  isChild: boolean;
  /** darf ich die Anfrage dieses Kindes bestätigen? (lib/confirm.ts `mayConfirm`) */
  mayConfirm: (childId: string) => boolean;
  nameOf: (personId: string) => string;
}

const ORDER: Record<InboxKind, number> = { nudge: 0, confirm: 1, house: 2 };

export function inboxItems(input: InboxInput): InboxItem[] {
  const { meId } = input;
  if (!meId) return [];
  const out: InboxItem[] = [];

  for (const n of nudgesToMe(input.open, meId)) {
    out.push({
      id: `nudge:${n.card.id}`,
      kind: 'nudge',
      title: t('{names} stupst dich! 👋', { names: n.fromIds.map(input.nameOf).join(', ') }),
      sub: n.card.title,
      card: n.card,
      cardId: n.card.id,
      since: null,
    });
  }

  // Ein Kind sieht nur, was es selbst betrifft: Stupse an sich. Kein Haus, keine Bestätigungen.
  if (!input.isChild) {
    for (const c of input.open) {
      if (c.completedAt || !c.confirmRequestedAt || !c.confirmRequestedBy) continue;
      if (!input.mayConfirm(c.confirmRequestedBy)) continue;
      out.push({
        id: `confirm:${c.id}`,
        kind: 'confirm',
        title: t('{name} wartet auf deine Bestätigung', { name: input.nameOf(c.confirmRequestedBy) }),
        sub: c.title,
        card: c,
        cardId: c.id,
        since: c.confirmRequestedAt,
      });
    }
    for (const c of input.house) {
      const mine = c.assigneeIds.includes(meId);
      if (!mine && c.assigneeIds.length > 0) continue; // gehört einer anderen Person
      out.push({
        id: `house:${c.id}`,
        kind: 'house',
        title: t('Wächter: {name}', { name: c.watcherName ?? c.boardName }),
        sub: mine ? t('Karte „{title}“ ist jetzt deine', { title: c.title }) : t('„{title}“ sucht jemanden, der sie übernimmt', { title: c.title }),
        card: c,
        cardId: c.id,
        since: c.createdAt,
      });
    }
  }
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

export type InboxFilterId = 'all' | InboxKind;

/** Die Chips über der Liste: „Alle" und je eine Art, die vorkommt (mit Zähler) */
export function inboxFilters(items: InboxItem[]): { id: InboxFilterId; count: number }[] {
  const out: { id: InboxFilterId; count: number }[] = [{ id: 'all', count: items.length }];
  for (const kind of ['nudge', 'confirm', 'house'] as const) {
    const count = items.filter((i) => i.kind === kind).length;
    if (count > 0) out.push({ id: kind, count });
  }
  return out;
}
