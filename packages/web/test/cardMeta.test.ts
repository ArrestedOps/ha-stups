import { describe, expect, it } from 'vitest';
import { cardMeta, type MetaFormat, priorityTone, categoryFg } from '../src/lib/cardMeta';

const fmt: MetaFormat = {
  due: (iso) => `fällig ${iso.slice(5, 10)}`,
  cost: (cents) => `${cents / 100} €`,
  recurrence: () => 'jede Woche',
};

const base = {
  dueAt: null,
  completedAt: null,
  recurrence: null,
  priority: null,
  checklist: { done: 0, total: 0 },
  linkCount: 0,
  attachmentCount: 0,
  commentCount: 0,
  costCents: null,
  watcherId: null,
};

const kinds = (card: object, extra: { overdue?: boolean; isDone?: boolean } = {}) =>
  cardMeta({ ...base, ...card } as never, { overdue: false, isDone: false, ...extra }, fmt).map((m) => m.kind);

describe('Meta-Zeile einer Karte', () => {
  it('eine leere Karte hat keine Zeile', () => {
    expect(kinds({})).toEqual([]);
  });

  it('zeigt nur, was gesetzt ist, in fester Reihenfolge: Erledigt, Termin, Wächter, Wiederholung, Priorität, Checkliste, Kommentare, Links, Anhänge, Kosten', () => {
    const all = {
      dueAt: '2026-11-04T10:00:00Z',
      completedAt: '2026-11-03T10:00:00Z',
      watcherId: 'w1',
      recurrence: { type: 'fixed', freq: 'weekly', every: 1 },
      priority: 'high',
      checklist: { done: 1, total: 2 },
      commentCount: 3,
      linkCount: 1,
      attachmentCount: 2,
      costCents: 4250,
    };
    expect(kinds(all)).toEqual(['done', 'due', 'watcher', 'recurrence', 'priority', 'checklist', 'comments', 'links', 'attachments', 'cost']);
  });

  it('Termin: rot nur bei überfälliger offener Karte', () => {
    const due = { dueAt: '2026-11-04T10:00:00Z' };
    const get = (extra: { overdue?: boolean; isDone?: boolean }) =>
      cardMeta({ ...base, ...due } as never, { overdue: false, isDone: false, ...extra }, fmt).find((m) => m.kind === 'due');
    expect(get({ overdue: true })).toMatchObject({ kind: 'due', overdue: true, text: 'fällig 11-04' });
    expect(get({ overdue: false })).toMatchObject({ overdue: false });
    // eine erledigte Karte ist nie „überfällig"
    expect(get({ overdue: true, isDone: true })).toMatchObject({ overdue: false });
  });

  it('Priorität: mittel und hoch erscheinen, niedrig und keine nicht', () => {
    const get = (priority: string | null) => cardMeta({ ...base, priority } as never, { overdue: false, isDone: false }, fmt).find((m) => m.kind === 'priority');
    expect(get('high')).toMatchObject({ level: 'high' });
    expect(get('medium')).toMatchObject({ level: 'medium' });
    expect(get('low')).toBeUndefined();
    expect(get(null)).toBeUndefined();
  });

  it('Zahlen und Texte kommen aus den Formatierern und der Karte', () => {
    const meta = cardMeta(
      { ...base, checklist: { done: 1, total: 2 }, commentCount: 3, costCents: 4250, recurrence: { type: 'after', every: 2, unit: 'days' } } as never,
      { overdue: false, isDone: false },
      fmt,
    );
    expect(meta.find((m) => m.kind === 'checklist')).toMatchObject({ done: 1, total: 2 });
    expect(meta.find((m) => m.kind === 'comments')).toMatchObject({ count: 3 });
    expect(meta.find((m) => m.kind === 'cost')).toMatchObject({ text: '42.5 €' });
    expect(meta.find((m) => m.kind === 'recurrence')).toMatchObject({ label: 'jede Woche' });
  });

  it('Kosten von 0 € erscheinen (Preis „gratis" ist ein Wert), kein Preis nicht', () => {
    expect(kinds({ costCents: 0 })).toEqual(['cost']);
    expect(kinds({ costCents: null })).toEqual([]);
  });

  it('Checkliste ohne Einträge erscheint nicht', () => {
    expect(kinds({ checklist: { done: 0, total: 0 } })).toEqual([]);
  });
});

describe('Meta-Zeile: Kategorie statt Personenname (die Person steht als Bild rechts)', () => {
  const cat = (card: object, categories?: { name: string; color: string }[]) =>
    cardMeta({ ...base, ...card } as never, { overdue: false, isDone: false }, fmt, { categories }).filter((m) => m.kind === 'category');

  it('eine Kategorie: Name und Farbe; bei mehreren die erste mit Zahl der übrigen; ohne Kategorie nichts', () => {
    expect(cat({}, [{ name: 'Putzen', color: 'blue' }])).toEqual([{ kind: 'category', name: 'Putzen', color: 'blue', more: 0 }]);
    expect(cat({}, [{ name: 'Putzen', color: 'blue' }, { name: 'Familie', color: 'pink' }, { name: 'Technik', color: 'yellow' }])).toEqual([
      { kind: 'category', name: 'Putzen', color: 'blue', more: 2 },
    ]);
    expect(cat({}, [])).toEqual([]);
    expect(cat({})).toEqual([]);
  });

  it('der Name einer Person steht nicht mehr in der Zeile', () => {
    const k = cardMeta({ ...base } as never, { overdue: false, isDone: false }, fmt, { categories: [{ name: 'Putzen', color: 'blue' }] }).map((m) => m.kind);
    expect(k).not.toContain('person');
  });

  it('steht nach Termin, Wächter und Wiederholung, vor Priorität und Checkliste', () => {
    const k = cardMeta({ ...base, dueAt: '2026-11-04T10:00:00Z', priority: 'high', checklist: { done: 0, total: 3 }, linkCount: 1 } as never, { overdue: false, isDone: false }, fmt, { categories: [{ name: 'Putzen', color: 'blue' }] }).map((m) => m.kind);
    expect(k).toEqual(['due', 'category', 'priority', 'checklist', 'links']);
  });
});

describe('categoryFg', () => {
  it('bekannte Farben ergeben die Variable der Kategorie, alles andere die ruhige Schriftfarbe', () => {
    expect(categoryFg('blue')).toBe('var(--c-blue-fg)');
    expect(categoryFg('mint')).toBe('var(--c-mint-fg)');
    expect(categoryFg('hotpink')).toBe('var(--text2)');
    expect(categoryFg('')).toBe('var(--text2)');
  });
});

describe('priorityTone', () => {
  it('hoch leuchtet rot, mittel ist orange ohne Leuchten', () => {
    expect(priorityTone('high')).toEqual({ text: 'text-danger', glow: true });
    expect(priorityTone('medium')).toEqual({ text: 'text-accent-text', glow: false });
  });
});
