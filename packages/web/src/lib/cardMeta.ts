import type { Card } from './api';

/** Was in der einen Zeile unter dem Titel einer Karte steht, in dieser Reihenfolge (was nicht passt, wird hinten abgeschnitten) */
export type MetaItem =
  | { kind: 'done'; text: string }
  | { kind: 'due'; text: string; overdue: boolean }
  | { kind: 'watcher' }
  | { kind: 'recurrence'; label: string }
  | { kind: 'priority'; level: 'medium' | 'high' }
  | { kind: 'person'; text: string }
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

type MetaCard = Pick<Card, 'dueAt' | 'completedAt' | 'recurrence' | 'priority' | 'checklist' | 'linkCount' | 'attachmentCount' | 'commentCount' | 'costCents' | 'watcherId'>;

/**
 * `opts.people`: die Namen der Zuständigen. Sie stehen (wie im Mockup „Mo, 27. Jan • Ben") nach der Priorität und vor der Checkliste;
 * bei mehreren der erste Name mit „+n".
 */
export function cardMeta(card: MetaCard, state: { overdue: boolean; isDone: boolean }, fmt: MetaFormat, opts: { people?: string[] } = {}): MetaItem[] {
  const out: MetaItem[] = [];
  if (card.completedAt) out.push({ kind: 'done', text: fmt.due(card.completedAt) });
  if (card.dueAt) out.push({ kind: 'due', text: fmt.due(card.dueAt), overdue: state.overdue && !state.isDone });
  if (card.watcherId) out.push({ kind: 'watcher' });
  if (card.recurrence) out.push({ kind: 'recurrence', label: fmt.recurrence(card.recurrence) });
  if (card.priority === 'medium' || card.priority === 'high') out.push({ kind: 'priority', level: card.priority });
  if (opts.people?.length) out.push({ kind: 'person', text: opts.people.length > 1 ? `${opts.people[0]} +${opts.people.length - 1}` : opts.people[0]! });
  if (card.checklist.total > 0) out.push({ kind: 'checklist', done: card.checklist.done, total: card.checklist.total });
  if (card.commentCount) out.push({ kind: 'comments', count: card.commentCount });
  if (card.linkCount) out.push({ kind: 'links', count: card.linkCount });
  if (card.attachmentCount) out.push({ kind: 'attachments', count: card.attachmentCount });
  if (card.costCents !== null) out.push({ kind: 'cost', text: fmt.cost(card.costCents) });
  return out;
}
