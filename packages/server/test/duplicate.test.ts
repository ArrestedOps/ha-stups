import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { NotFoundError } from '../src/errors.js';
import { createStore, type Store } from '../src/store.js';

let store: Store;
let rene: { id: string };
let conny: { id: string };

beforeEach(() => {
  store = createStore(openDb(':memory:'), { now: () => new Date('2026-10-30T10:00:00Z'), timeZone: () => 'Europe/Berlin' });
  store.syncPeople([{ name: 'Rene' }, { name: 'Conny' }]);
  rene = store.resolveUser({ haId: 'a', name: 'rene', displayName: 'René' });
  conny = store.resolveUser({ haId: 'b', name: 'conny', displayName: 'Conny' });
});

function setup() {
  const b = store.createBoard({ name: 'Haushalt', withPlanned: true });
  const [open, planned, doing, done] = store.getBoardView(b.id).columns;
  return { b, open: open!, planned: planned!, doing: doing!, done: done! };
}

describe('Karte duplizieren', () => {
  it('kopiert Felder, Zuweisung, Kategorien, Checkliste (zurückgesetzt) und Links, direkt hinter das Original', () => {
    const s = setup();
    const cat = store.addCategory(s.b.id, { name: 'Putzen', color: 'blue' });
    const orig = store.createCard(
      s.b.id,
      {
        columnId: s.open.id,
        title: 'Bad putzen',
        description: 'Entkalker',
        priority: 'high',
        dueAt: '2026-10-30T15:00:00Z',
        recurrence: { type: 'fixed', freq: 'weekly', every: 1, weekdays: [5] },
        remindBeforeMin: 60,
        overdueNag: true,
        costCents: 1500,
        assigneeIds: [conny.id],
        categoryIds: [cat.id],
      },
      rene.id,
    );
    const after = store.createCard(s.b.id, { columnId: s.open.id, title: 'danach' }, rene.id);
    const item = store.addChecklistItem(orig.id, 'Spiegel');
    store.updateChecklistItem(item.id, { done: true });
    store.addLink(orig.id, { url: 'https://example.com', title: 'Beispiel' });
    store.addComment(orig.id, rene.id, 'nicht mitkopieren');

    const copy = store.duplicateCard(orig.id, conny.id);

    expect(copy.id).not.toBe(orig.id);
    expect(copy).toMatchObject({
      title: 'Bad putzen (Kopie)',
      description: 'Entkalker',
      priority: 'high',
      dueAt: '2026-10-30T15:00:00.000Z',
      recurrence: { type: 'fixed', freq: 'weekly', every: 1, weekdays: [5] },
      remindBeforeMin: 60,
      overdueNag: true,
      costCents: 1500,
      assigneeIds: [conny.id],
      categoryIds: [cat.id],
      createdBy: conny.id,
      completedAt: null,
      columnId: s.open.id,
    });
    expect(copy.checklistItems.map((i) => [i.text, i.done])).toEqual([['Spiegel', false]]);
    expect(copy.links.map((l) => l.url)).toEqual(['https://example.com/']);
    expect(copy.history).toEqual([]);
    expect(store.listComments(copy.id)).toEqual([]);
    const order = store.getBoardView(s.b.id).cards.filter((c) => c.columnId === s.open.id).map((c) => c.id);
    expect(order).toEqual([orig.id, copy.id, after.id]);
    // das Original bleibt unberührt
    expect(store.getCard(orig.id).checklist).toEqual({ done: 1, total: 1 });
  });

  it('die Kopie einer erledigten Karte ist offen und liegt in der ersten Spalte', () => {
    const s = setup();
    const c = store.createCard(s.b.id, { columnId: s.open.id, title: 'x' }, rene.id);
    store.completeCard(c.id, { by: rene.id, source: 'app' });
    const copy = store.duplicateCard(c.id, rene.id);
    expect(copy.columnId).toBe(s.open.id);
    expect(copy.completedAt).toBeNull();
  });

  it('die Kopie einer geplanten Karte bleibt in „Geplant"', () => {
    const s = setup();
    const c = store.createCard(s.b.id, { columnId: s.open.id, title: 'später', dueAt: '2026-11-10T09:00:00Z' }, rene.id);
    expect(store.getCard(c.id).columnId).toBe(s.planned.id);
    expect(store.duplicateCard(c.id, rene.id).columnId).toBe(s.planned.id);
  });

  it('kürzt zu lange Titel und meldet unbekannte Karten', () => {
    const s = setup();
    const c = store.createCard(s.b.id, { columnId: s.open.id, title: 'x'.repeat(200) }, rene.id);
    expect(store.duplicateCard(c.id, rene.id).title.length).toBeLessThanOrEqual(200);
    expect(() => store.duplicateCard('gibt-es-nicht', rene.id)).toThrow(NotFoundError);
  });
});
