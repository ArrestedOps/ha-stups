import { describe, expect, it } from 'vitest';
import { costTotals, countByColumn, dueStats, filterCards, type FilterableCard } from '../src/lib/filters';

const card = (id: string, extra: Partial<FilterableCard> = {}): FilterableCard => ({
  id,
  columnId: 'c1',
  title: id,
  description: null,
  assigneeIds: [],
  categoryIds: [],
  ...extra,
});

const cards = [
  card('Bad putzen', { categoryIds: ['putzen'], assigneeIds: ['conny'] }),
  card('Filter wechseln', { categoryIds: ['wartung'], assigneeIds: ['rene'], description: 'Dunstabzug in der Küche' }),
  card('Rasen', { categoryIds: ['garten', 'wartung'], assigneeIds: ['rene', 'conny'], columnId: 'c2' }),
  card('Ohne alles'),
];

describe('filterCards', () => {
  it('ohne Filter bleibt alles', () => {
    expect(filterCards(cards, { categoryIds: [], onlyMine: false, search: '' }, 'rene')).toHaveLength(4);
  });

  it('Kategorien: mehrere gewählt = eine davon genügt', () => {
    const r = filterCards(cards, { categoryIds: ['putzen', 'garten'], onlyMine: false, search: '' }, 'rene');
    expect(r.map((c) => c.id)).toEqual(['Bad putzen', 'Rasen']);
  });

  it('nur meine: Karten, bei denen ich zugewiesen bin', () => {
    const r = filterCards(cards, { categoryIds: [], onlyMine: true, search: '' }, 'rene');
    expect(r.map((c) => c.id)).toEqual(['Filter wechseln', 'Rasen']);
  });

  it('Suche in Titel und Beschreibung, ohne Groß-/Kleinschreibung', () => {
    expect(filterCards(cards, { categoryIds: [], onlyMine: false, search: 'BAD' }, 'rene').map((c) => c.id)).toEqual([
      'Bad putzen',
    ]);
    expect(filterCards(cards, { categoryIds: [], onlyMine: false, search: 'dunstabzug' }, 'rene').map((c) => c.id)).toEqual([
      'Filter wechseln',
    ]);
  });

  it('Filter wirken zusammen (und)', () => {
    const r = filterCards(cards, { categoryIds: ['wartung'], onlyMine: true, search: 'raSen' }, 'rene');
    expect(r.map((c) => c.id)).toEqual(['Rasen']);
  });
});

describe('dueStats', () => {
  const NOW = Date.parse('2026-10-30T10:00:00Z'); // 11:00 Berlin
  const mk = (id: string, dueAt: string | null, extra: object = {}) => ({
    ...card(id, { assigneeIds: ['rene'] }),
    dueAt,
    completedAt: null,
    ...extra,
  });

  it('zählt nur eigene, offene Karten: überfällig und heute fällig', () => {
    const cards = [
      mk('a', '2026-10-29T10:00:00Z'), // überfällig
      mk('b', '2026-10-30T09:00:00Z'), // vor einer Stunde: überfällig
      mk('c', '2026-10-30T15:00:00Z'), // heute
      mk('d', '2026-10-31T15:00:00Z'), // morgen
      mk('e', null),
      mk('f', '2026-10-29T10:00:00Z', { completedAt: '2026-10-29T11:00:00Z' }),
      mk('g', '2026-10-29T10:00:00Z', { assigneeIds: ['conny'] }),
      mk('h', '2026-10-29T10:00:00Z', { columnId: 'done' }),
    ];
    expect(dueStats(cards, 'rene', new Set(['done']), NOW, 'Europe/Berlin')).toEqual({ today: 1, overdue: 2 });
  });

  it('Mitternacht gilt in Ortszeit', () => {
    const cards = [mk('a', '2026-10-30T22:30:00Z'), mk('b', '2026-10-30T23:30:00Z')]; // 23:30 heute, 00:30 morgen
    expect(dueStats(cards, 'rene', new Set(), NOW, 'Europe/Berlin')).toEqual({ today: 1, overdue: 0 });
  });
});

describe('countByColumn', () => {
  it('zählt Karten je Spalte, auch leere', () => {
    expect(countByColumn(cards, ['c1', 'c2', 'c3'])).toEqual({ c1: 3, c2: 1, c3: 0 });
  });
});

describe('costTotals', () => {
  it('trennt offene und erledigte Kosten und ignoriert Karten ohne Betrag', () => {
    const cards = [
      { columnId: 'open', costCents: 12000 },
      { columnId: 'open', costCents: null },
      { columnId: 'doing', costCents: 4990 },
      { columnId: 'done', costCents: 30000 },
    ];
    expect(costTotals(cards, new Set(['done']))).toEqual({ open: 16990, done: 30000 });
    expect(costTotals([], new Set())).toEqual({ open: 0, done: 0 });
  });
});

describe('filterCards: Gestupst', () => {
  const mk = (id: string, toIds: string[]) => ({
    id,
    columnId: 'c',
    title: id,
    description: null,
    assigneeIds: [],
    categoryIds: [],
    openNudges: toIds.map((toId, i) => ({ id: `${id}-${i}`, fromId: 'x', toId })),
  });
  const cards = [mk('a', ['rene']), mk('b', ['conny']), mk('c', []), mk('d', ['conny', 'rene'])];
  const f = { categoryIds: [], onlyMine: false, nudged: true, search: '' };

  it('zeigt nur Karten mit einem offenen Stups an mich', () => {
    expect(filterCards(cards, f, 'rene').map((c) => c.id)).toEqual(['a', 'd']);
    expect(filterCards(cards, f, 'conny').map((c) => c.id)).toEqual(['b', 'd']);
  });

  it('ohne den Filter oder ohne Person gilt alles bzw. nichts', () => {
    expect(filterCards(cards, { ...f, nudged: false }, 'rene')).toHaveLength(4);
    expect(filterCards(cards, f, null)).toEqual([]);
  });
});