import type { Card } from './api';

/** Was in der einen Zeile unter dem Titel einer Aufgabe steht, in dieser Reihenfolge (was nicht passt, wird hinten abgeschnitten) */
export type MetaItem =
  | { kind: 'done'; text: string }
  | { kind: 'due'; text: string; overdue: boolean }
  | { kind: 'watcher' }
  | { kind: 'recurrence'; label: string }
  | { kind: 'priority'; level: 'medium' | 'high' }
  | { kind: 'category'; name: string; color: string; more: number }
  | { kind: 'checklist'; done: number; total: number }
  | { kind: 'comments'; count: number }
  | { kind: 'links'; count: number }
  | { kind: 'attachments'; count: number }
  | { kind: 'cost'; text: string };

export interface MetaFormat {
  due: (iso: string) => string;
  cost: (cents: number) => string;
  recurrence: (rule: NonNullable<Card['recurrence']>) => string;
}

/** Farbe der Priorität auf der Aufgabe: hoch leuchtet rot, mittel ist orange */
export function priorityTone(level: 'medium' | 'high'): { text: string; glow: boolean } {
  return level === 'high' ? { text: 'text-danger', glow: true } : { text: 'text-accent-text', glow: false };
}

type MetaCard = Pick<Card, 'dueAt' | 'completedAt' | 'recurrence' | 'priority' | 'checklist' | 'linkCount' | 'attachmentCount' | 'commentCount' | 'costCents' | 'watcherId'>;

/** Textfarbe einer Kategorie (Variable aus app.css); unbekannte Farben bleiben ruhig grau */
const CATEGORY_COLORS = new Set(['blue', 'teal', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'indigo', 'brown', 'gray', 'mint']);
export function categoryFg(color: string): string {
  return CATEGORY_COLORS.has(color) ? `var(--c-${color}-fg)` : 'var(--text2)';
}

/**
 * `opts.categories`: die Kategorien der Aufgabe. Die erste steht (mit Farbpunkt) nach Termin, Wächter und Wiederholung, bei mehreren mit der
 * Zahl der übrigen. Wer zuständig ist, zeigen die Bilder rechts in der Zeile, nicht diese Zeile.
 */
export function cardMeta(card: MetaCard, state: { overdue: boolean; isDone: boolean }, fmt: MetaFormat, opts: { categories?: { name: string; color: string }[] } = {}): MetaItem[] {
  const out: MetaItem[] = [];
  if (card.completedAt) out.push({ kind: 'done', text: fmt.due(card.completedAt) });
  if (card.dueAt) out.push({ kind: 'due', text: fmt.due(card.dueAt), overdue: state.overdue && !state.isDone });
  if (card.watcherId) out.push({ kind: 'watcher' });
  if (card.recurrence) out.push({ kind: 'recurrence', label: fmt.recurrence(card.recurrence) });
  if (opts.categories?.length) out.push({ kind: 'category', name: opts.categories[0]!.name, color: opts.categories[0]!.color, more: opts.categories.length - 1 });
  if (card.priority === 'medium' || card.priority === 'high') out.push({ kind: 'priority', level: card.priority });
  if (card.checklist.total > 0) out.push({ kind: 'checklist', done: card.checklist.done, total: card.checklist.total });
  if (card.commentCount) out.push({ kind: 'comments', count: card.commentCount });
  if (card.linkCount) out.push({ kind: 'links', count: card.linkCount });
  if (card.attachmentCount) out.push({ kind: 'attachments', count: card.attachmentCount });
  if (card.costCents !== null) out.push({ kind: 'cost', text: fmt.cost(card.costCents) });
  return out;
}
