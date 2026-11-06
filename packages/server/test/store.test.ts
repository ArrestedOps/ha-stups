import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { ConflictError, NotFoundError, ValidationError } from '../src/errors.js';
import { createStore, type Store } from '../src/store.js';

let now: Date;
let store: Store;
let rene: { id: string };
let conny: { id: string };

beforeEach(() => {
  now = new Date('2026-10-30T10:00:00Z');
  store = createStore(openDb(':memory:'), { now: () => now });
  store.syncPeople([{ name: 'Rene' }, { name: 'Conny' }]);
  rene = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'René' });
  conny = store.resolveUser({ haId: 'ha-conny', name: 'conny', displayName: 'Conny' });
});

function board() {
  const b = store.createBoard({ name: 'Haushalt' });
  const v = store.getBoardView(b.id);
  const [open, doing, done] = v.columns;
  return { b, open: open!, doing: doing!, done: done! };
}

describe('users', () => {
  it('matches configured people by name, case-insensitively, and keeps one row', () => {
    expect(rene.id).toBeTruthy();
    expect(store.people().map((p) => p.name).sort()).toEqual(['Conny', 'Rene']);
    const again = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'René' });
    expect(again.id).toBe(rene.id);
  });

  it('does not link by display name alone (anyone can change it in their HA profile); the user waits for approval', () => {
    const s = createStore(openDb(':memory:'), { now: () => now });
    s.syncPeople([{ name: 'René' }]);
    const u = s.resolveUser({ haId: 'x', name: 'admin', displayName: 'rené' });
    expect(u.isPerson).toBe(false);
  });

  it('creates unknown users as non-people that cannot be assigned', () => {
    const admin = store.resolveUser({ haId: 'ha-admin', name: 'admin', displayName: 'HomeAssistant' });
    expect(admin.isPerson).toBe(false);
    expect(store.people().map((p) => p.id)).not.toContain(admin.id);
    const { b, open } = board();
    expect(() => store.createCard(b.id, { columnId: open.id, title: 'x', assigneeIds: [admin.id] }, rene.id)).toThrow(
      ValidationError,
    );
  });

  it('syncPeople is idempotent', () => {
    store.syncPeople([{ name: 'Rene' }, { name: 'Conny' }]);
    expect(store.people()).toHaveLength(2);
  });
});

describe('boards', () => {
  it('creates default columns with Erledigt as the done column', () => {
    const { b } = board();
    const v = store.getBoardView(b.id);
    expect(v.columns.map((c) => c.name)).toEqual(['Offen', 'In Arbeit', 'Erledigt']);
    expect(v.columns.map((c) => c.isDone)).toEqual([false, false, true]);
    expect(v.board.archiveAfterDays).toBe(7);
  });

  it('lists boards in creation order with the number of open cards', () => {
    const { b, open, done } = board();
    store.createBoard({ name: 'Hauskauf' });
    store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    store.createCard(b.id, { columnId: done.id, title: 'B' }, rene.id);
    const list = store.listBoards(null);
    expect(list.map((x) => x.name)).toEqual(['Haushalt', 'Hauskauf']);
    expect(list[0]?.openCards).toBe(1);
    expect(list[1]?.openCards).toBe(0);
  });

  it('rejects an empty name', () => {
    expect(() => store.createBoard({ name: '   ' })).toThrow(ValidationError);
  });

  it('updates name and archive period', () => {
    const { b } = board();
    store.updateBoard(b.id, { name: 'Zuhause', archiveAfterDays: 14 });
    const v = store.getBoardView(b.id);
    expect(v.board.name).toBe('Zuhause');
    expect(v.board.archiveAfterDays).toBe(14);
    expect(() => store.updateBoard(b.id, { archiveAfterDays: -1 })).toThrow(ValidationError);
  });

  it('moves a deleted board to the trash and restores it', () => {
    const { b } = board();
    store.deleteBoard(b.id);
    expect(store.listBoards(null)).toHaveLength(0);
    expect(() => store.getBoardView(b.id)).toThrow(NotFoundError);
    expect(store.listTrash(null).map((t) => [t.type, t.id])).toContainEqual(['board', b.id]);
    store.restoreFromTrash('board', b.id);
    expect(store.listBoards(null)).toHaveLength(1);
  });
});

describe('columns', () => {
  it('adds a column at the end and renames it', () => {
    const { b } = board();
    const c = store.addColumn(b.id, { name: 'Wartet' });
    store.updateColumn(c.id, { name: 'Wartet auf Antwort' });
    expect(store.getBoardView(b.id).columns.map((x) => x.name)).toEqual([
      'Offen',
      'In Arbeit',
      'Erledigt',
      'Wartet auf Antwort',
    ]);
  });

  it('keeps exactly one done column per board', () => {
    const { b, doing, done } = board();
    store.updateColumn(doing.id, { isDone: true });
    const cols = store.getBoardView(b.id).columns;
    expect(cols.find((c) => c.id === doing.id)?.isDone).toBe(true);
    expect(cols.find((c) => c.id === done.id)?.isDone).toBe(false);
  });

  it('reorders columns', () => {
    const { b, open, doing, done } = board();
    store.moveColumn(done.id, null); // to the front
    expect(store.getBoardView(b.id).columns.map((c) => c.id)).toEqual([done.id, open.id, doing.id]);
    store.moveColumn(done.id, doing.id); // behind "In Arbeit"
    expect(store.getBoardView(b.id).columns.map((c) => c.id)).toEqual([open.id, doing.id, done.id]);
  });

  it('refuses to delete a column with cards unless a target column is given', () => {
    const { b, open, doing } = board();
    const c1 = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    expect(() => store.deleteColumn(open.id)).toThrow(ConflictError);
    store.deleteColumn(open.id, doing.id);
    expect(store.getCard(c1.id).columnId).toBe(doing.id);
    expect(store.getBoardView(b.id).columns.map((c) => c.id)).not.toContain(open.id);
  });

  it('deletes an empty column without a target', () => {
    const { b, doing } = board();
    store.deleteColumn(doing.id);
    expect(store.getBoardView(b.id).columns).toHaveLength(2);
  });

  it('refuses to delete the last column', () => {
    const { b, open, doing, done } = board();
    store.deleteColumn(doing.id);
    store.deleteColumn(done.id);
    expect(() => store.deleteColumn(open.id)).toThrow(ConflictError);
    expect(store.getBoardView(b.id).columns).toHaveLength(1);
  });
});

describe('Erledigt-Spalte löschen oder umstellen', () => {
  const openCount = (id: string) => store.listBoards(null).find((x) => x.id === id)!.openCards;

  it('Löschen der Erledigt-Spalte mit Ziel „Offen“ öffnet die Karten wieder und zählt sie als offen', () => {
    const { b, open, done } = board();
    const c = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    store.moveCard(c.id, { columnId: done.id }, rene.id);
    expect(openCount(b.id)).toBe(0);
    store.deleteColumn(done.id, open.id);
    const card = store.getCard(c.id);
    expect(card.columnId).toBe(open.id);
    expect(card.completedAt).toBeNull();
    expect(openCount(b.id)).toBe(1);
  });

  it('Löschen mit Ziel „Erledigt“ lässt die Karten erledigt', () => {
    const { b, doing, done } = board();
    const c = store.createCard(b.id, { columnId: doing.id, title: 'A' }, rene.id);
    store.moveCard(c.id, { columnId: done.id }, rene.id);
    store.deleteColumn(doing.id, done.id);
    expect(store.getCard(c.id).completedAt).not.toBeNull();
  });

  it('„Erledigt“ von einer Spalte nehmen öffnet ihre Karten wieder', () => {
    const { b, open, done } = board();
    const c = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    store.moveCard(c.id, { columnId: done.id }, rene.id);
    store.updateColumn(done.id, { isDone: false });
    expect(store.getCard(c.id).completedAt).toBeNull();
    expect(openCount(b.id)).toBe(1);
  });

  it('archivierte Karten bleiben archiviert', () => {
    const { b, open, done } = board();
    const c = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    store.moveCard(c.id, { columnId: done.id }, rene.id);
    store.setArchived(c.id, true);
    store.deleteColumn(done.id, open.id);
    expect(store.getCard(c.id).archivedAt).not.toBeNull();
  });
});

describe('categories', () => {
  it('creates, renames and removes categories without touching the cards', () => {
    const { b, open } = board();
    const putzen = store.addCategory(b.id, { name: 'Putzen', color: 'blue' });
    const garten = store.addCategory(b.id, { name: 'Garten', color: 'purple' });
    const card = store.createCard(
      b.id,
      { columnId: open.id, title: 'Bad', categoryIds: [putzen.id, garten.id] },
      rene.id,
    );
    store.updateCategory(putzen.id, { name: 'Sauber', color: 'teal' });
    expect(store.getBoardView(b.id).categories.map((c) => c.name)).toEqual(['Sauber', 'Garten']);
    store.deleteCategory(garten.id);
    expect(store.getBoardView(b.id).categories.map((c) => c.name)).toEqual(['Sauber']);
    expect(store.getCard(card.id).categoryIds).toEqual([putzen.id]);
  });

  it('rejects a category from another board on a card', () => {
    const a = board();
    const other = store.createBoard({ name: 'Anderes' });
    const foreign = store.addCategory(other.id, { name: 'Fremd', color: 'red' });
    expect(() =>
      store.createCard(a.b.id, { columnId: a.open.id, title: 'x', categoryIds: [foreign.id] }, rene.id),
    ).toThrow(ValidationError);
  });
});

describe('cards', () => {
  it('appends new cards at the end of the column', () => {
    const { b, open } = board();
    const a = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    const c = store.createCard(b.id, { columnId: open.id, title: 'B' }, rene.id);
    const cards = store.getBoardView(b.id).cards.filter((x) => x.columnId === open.id);
    expect(cards.map((x) => x.id)).toEqual([a.id, c.id]);
  });

  it('stores all phase 1 fields and returns assignees, categories and counters', () => {
    const { b, open } = board();
    const cat = store.addCategory(b.id, { name: 'Putzen', color: 'blue' });
    const card = store.createCard(
      b.id,
      {
        columnId: open.id,
        title: ' Bad putzen ',
        description: 'Entkalker unter dem Waschbecken',
        priority: 'high',
        dueAt: '2026-11-01T10:00:00+01:00',
        assigneeIds: [conny.id],
        categoryIds: [cat.id],
      },
      rene.id,
    );
    expect(card).toMatchObject({
      title: 'Bad putzen',
      priority: 'high',
      dueAt: '2026-11-01T09:00:00.000Z',
      assigneeIds: [conny.id],
      categoryIds: [cat.id],
      createdBy: rene.id,
      version: 1,
      completedAt: null,
      archivedAt: null,
    });
    store.addChecklistItem(card.id, 'Spiegel');
    const item = store.addChecklistItem(card.id, 'Dusche');
    store.updateChecklistItem(item.id, { done: true });
    store.addLink(card.id, { url: 'https://example.com', title: 'Beispiel' });
    const view = store.getBoardView(b.id).cards[0]!;
    expect(view.checklist).toEqual({ done: 1, total: 2 });
    expect(view.linkCount).toBe(1);
  });

  it('requires a title, a valid priority and a due date with a time', () => {
    const { b, open } = board();
    const mk = (extra: object) => () => store.createCard(b.id, { columnId: open.id, title: 'x', ...extra }, rene.id);
    expect(() => store.createCard(b.id, { columnId: open.id, title: '  ' }, rene.id)).toThrow(ValidationError);
    expect(mk({ priority: 'urgent' })).toThrow(ValidationError);
    expect(mk({ dueAt: '2026-11-01' })).toThrow(ValidationError);
    expect(mk({ dueAt: 'morgen' })).toThrow(ValidationError);
  });

  it('rejects a column from another board', () => {
    const a = board();
    const other = board();
    expect(() => store.createCard(a.b.id, { columnId: other.open.id, title: 'x' }, rene.id)).toThrow(ValidationError);
  });

  it('updates fields, clears them with null and bumps the version', () => {
    const { b, open } = board();
    const card = store.createCard(
      b.id,
      { columnId: open.id, title: 'A', priority: 'low', dueAt: '2026-11-01T09:00:00Z', assigneeIds: [rene.id] },
      rene.id,
    );
    now = new Date('2026-10-30T11:00:00Z');
    const upd = store.updateCard(card.id, {
      title: 'A2',
      priority: null,
      dueAt: null,
      assigneeIds: [rene.id, conny.id],
      description: 'neu',
    });
    expect(upd).toMatchObject({ title: 'A2', priority: null, dueAt: null, description: 'neu', version: 2 });
    expect(upd.assigneeIds.sort()).toEqual([rene.id, conny.id].sort());
    expect(upd.updatedAt).toBe('2026-10-30T11:00:00.000Z');
  });

  it('only allows a recurrence on a card with a due date', () => {
    const { b, open } = board();
    const card = store.createCard(b.id, { columnId: open.id, title: 'Bad' }, rene.id);
    const rec = { type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] };
    expect(() => store.updateCard(card.id, { recurrence: rec })).toThrow(ValidationError);
    store.updateCard(card.id, { dueAt: '2026-11-01T09:00:00Z', recurrence: rec });
    expect(store.getCard(card.id).recurrence).toEqual(rec);
    expect(() => store.updateCard(card.id, { dueAt: null })).toThrow(ValidationError);
    expect(() => store.updateCard(card.id, { recurrence: { type: 'nonsense' } })).toThrow(ValidationError);
  });

  it('moves cards within a column and between columns', () => {
    const { b, open, doing } = board();
    const a = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    const c = store.createCard(b.id, { columnId: open.id, title: 'B' }, rene.id);
    const d = store.createCard(b.id, { columnId: open.id, title: 'C' }, rene.id);
    const ids = (col: string) =>
      store
        .getBoardView(b.id)
        .cards.filter((x) => x.columnId === col)
        .map((x) => x.id);

    store.moveCard(d.id, { columnId: open.id, afterId: null }); // to the top
    expect(ids(open.id)).toEqual([d.id, a.id, c.id]);
    store.moveCard(d.id, { columnId: open.id, afterId: a.id }); // between A and B
    expect(ids(open.id)).toEqual([a.id, d.id, c.id]);
    store.moveCard(a.id, { columnId: doing.id }); // end of another column
    expect(ids(open.id)).toEqual([d.id, c.id]);
    expect(ids(doing.id)).toEqual([a.id]);
    store.moveCard(c.id, { columnId: doing.id, afterId: null });
    expect(ids(doing.id)).toEqual([c.id, a.id]);
  });

  it('keeps the order stable after many insertions at the same spot', () => {
    const { b, open } = board();
    const first = store.createCard(b.id, { columnId: open.id, title: 'first' }, rene.id);
    store.createCard(b.id, { columnId: open.id, title: 'last' }, rene.id);
    const inserted: string[] = [];
    for (let i = 0; i < 40; i++) {
      const c = store.createCard(b.id, { columnId: open.id, title: `n${i}` }, rene.id);
      store.moveCard(c.id, { columnId: open.id, afterId: first.id });
      inserted.unshift(c.id);
    }
    const order = store
      .getBoardView(b.id)
      .cards.filter((x) => x.columnId === open.id)
      .map((x) => x.id);
    expect(order.slice(1, 41)).toEqual(inserted);
  });

  it('rejects moving a card behind a card of another column', () => {
    const { b, open, doing } = board();
    const a = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    const c = store.createCard(b.id, { columnId: doing.id, title: 'B' }, rene.id);
    expect(() => store.moveCard(a.id, { columnId: open.id, afterId: c.id })).toThrow(ValidationError);
  });

  it('soft-deletes a card and restores it', () => {
    const { b, open } = board();
    const a = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    store.deleteCard(a.id);
    expect(store.getBoardView(b.id).cards).toHaveLength(0);
    expect(() => store.getCard(a.id)).toThrow(NotFoundError);
    expect(store.listTrash(null)[0]).toMatchObject({ type: 'card', id: a.id, title: 'A' });
    store.restoreFromTrash('card', a.id);
    expect(store.getBoardView(b.id).cards).toHaveLength(1);
  });

  it('restores a card into the first column when its column was deleted meanwhile', () => {
    const { b, open, doing } = board();
    const a = store.createCard(b.id, { columnId: doing.id, title: 'A' }, rene.id);
    store.deleteCard(a.id);
    store.deleteColumn(doing.id);
    store.restoreFromTrash('card', a.id);
    expect(store.getCard(a.id).columnId).toBe(open.id);
  });

  it('keeps archived cards out of the board view', () => {
    const { b, open } = board();
    const a = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    store.setArchived(a.id, true);
    expect(store.getBoardView(b.id).cards).toHaveLength(0);
    expect(store.listArchived(b.id).map((c) => c.id)).toEqual([a.id]);
    store.setArchived(a.id, false);
    expect(store.getBoardView(b.id).cards).toHaveLength(1);
  });
});

describe('checklist and links', () => {
  it('manages checklist items', () => {
    const { b, open } = board();
    const card = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    const i1 = store.addChecklistItem(card.id, 'Eins');
    const i2 = store.addChecklistItem(card.id, 'Zwei');
    store.updateChecklistItem(i1.id, { text: 'Eins!', done: true });
    store.deleteChecklistItem(i2.id);
    expect(store.getCard(card.id).checklistItems).toEqual([
      expect.objectContaining({ id: i1.id, text: 'Eins!', done: true }),
    ]);
    expect(() => store.addChecklistItem(card.id, ' ')).toThrow(ValidationError);
  });

  it('adds links with a detected kind and normalized URL', () => {
    const { b, open } = board();
    const card = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    const web = store.addLink(card.id, { url: 'example.com/x' });
    const maps = store.addLink(card.id, { url: 'https://maps.apple.com/?q=Berlin', title: 'Berlin' });
    expect(web).toMatchObject({ url: 'https://example.com/x', kind: 'web', title: null });
    expect(maps).toMatchObject({ kind: 'maps', title: 'Berlin' });
    store.updateLink(web.id, { title: 'Beispiel' });
    store.deleteLink(maps.id);
    expect(store.getCard(card.id).links).toEqual([expect.objectContaining({ id: web.id, title: 'Beispiel' })]);
    expect(() => store.addLink(card.id, { url: 'javascript:alert(1)' })).toThrow(ValidationError);
  });
});

describe('trash', () => {
  it('purges items older than 30 days with their children and keeps newer ones', () => {
    const { b, open } = board();
    const old = store.createCard(b.id, { columnId: open.id, title: 'alt' }, rene.id);
    store.addChecklistItem(old.id, 'x');
    store.deleteCard(old.id);
    now = new Date('2026-11-15T10:00:00Z');
    const recent = store.createCard(b.id, { columnId: open.id, title: 'neu' }, rene.id);
    store.deleteCard(recent.id);
    now = new Date('2026-12-01T10:00:00Z'); // 32 days after "alt", 16 after "neu"
    const purged = store.purgeTrash();
    expect(purged).toBe(1);
    expect(store.listTrash(null).map((t) => t.title)).toEqual(['neu']);
    expect(() => store.restoreFromTrash('card', old.id)).toThrow(NotFoundError);
  });

  it('shows when an item will be purged', () => {
    const { b, open } = board();
    const a = store.createCard(b.id, { columnId: open.id, title: 'A' }, rene.id);
    store.deleteCard(a.id);
    expect(store.listTrash(null)[0]?.purgeAt).toBe('2026-11-29T10:00:00.000Z');
  });
});

describe('seed', () => {
  it('creates the Haushalt board only when there is none', () => {
    const s = createStore(openDb(':memory:'), { now: () => now });
    s.ensureDefaultBoard();
    s.ensureDefaultBoard();
    expect(s.listBoards(null).map((x) => x.name)).toEqual(['Haushalt']);
  });
});
