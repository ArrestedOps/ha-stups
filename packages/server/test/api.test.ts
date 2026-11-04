import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

const reneHeaders = {
  'x-remote-user-id': 'ha-rene',
  'x-remote-user-name': 'rene',
  'x-remote-user-display-name': 'René',
};

let app: FastifyInstance;
let store: Store;
let pageTitle: string | null;

beforeEach(async () => {
  store = createStore(openDb(':memory:'), { now: () => new Date('2026-10-30T10:00:00Z') });
  store.syncPeople([{ name: 'Rene' }, { name: 'Conny' }]);
  pageTitle = 'Beispiel-Seite';
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    fetchTitle: async () => pageTitle,
  });
});

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: reneHeaders, payload });
  return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
}

async function boardWithColumns() {
  const b = (await call('POST', '/api/boards', { name: 'Haushalt', withPlanned: false })).body;
  const v = (await call('GET', `/api/boards/${b.id}`)).body;
  return { b, columns: v.columns as { id: string; name: string }[] };
}

describe('auth and identity', () => {
  it('rejects requests without an HA user', async () => {
    const res = await app.inject({ url: '/api/boards' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/me resolves the HA user to the configured person', async () => {
    const { body } = await call('GET', '/api/me');
    expect(body.user).toMatchObject({ name: 'Rene', isPerson: true, haUserId: 'ha-rene' });
    expect(body.people.map((p: any) => p.name)).toEqual(['Rene', 'Conny']);
  });
});

describe('boards, columns, categories', () => {
  it('creates and lists boards', async () => {
    const created = await call('POST', '/api/boards', { name: 'Hauskauf' });
    expect(created.status).toBe(201);
    const list = await call('GET', '/api/boards');
    expect(list.body.map((b: any) => b.name)).toEqual(['Hauskauf']);
    expect(list.body[0].openCards).toBe(0);
  });

  it('returns the full board view with default columns', async () => {
    const { b, columns } = await boardWithColumns();
    expect(columns.map((c) => c.name)).toEqual(['Offen', 'In Arbeit', 'Erledigt']);
    const v = (await call('GET', `/api/boards/${b.id}`)).body;
    expect(v.board.id).toBe(b.id);
    expect(v.cards).toEqual([]);
  });

  it('answers 400 with a message for invalid input and 404 for unknown ids', async () => {
    const bad = await call('POST', '/api/boards', { name: '   ' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/Name/);
    expect((await call('GET', '/api/boards/gibt-es-nicht')).status).toBe(404);
  });

  it('manages columns', async () => {
    const { b, columns } = await boardWithColumns();
    const added = await call('POST', `/api/boards/${b.id}/columns`, { name: 'Wartet' });
    expect(added.status).toBe(201);
    await call('PATCH', `/api/columns/${added.body.id}`, { name: 'Wartet auf Antwort' });
    await call('POST', `/api/columns/${added.body.id}/move`, { afterId: null });
    const v = (await call('GET', `/api/boards/${b.id}`)).body;
    expect(v.columns.map((c: any) => c.name)).toEqual(['Wartet auf Antwort', 'Offen', 'In Arbeit', 'Erledigt']);
    expect((await call('DELETE', `/api/columns/${added.body.id}`)).status).toBe(204);
    expect(columns).toHaveLength(3);
  });

  it('refuses to delete a column with cards without a target (409) and moves them with ?moveTo', async () => {
    const { b, columns } = await boardWithColumns();
    const open = columns[0]!;
    const doing = columns[1]!;
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: open.id, title: 'A' })).body;
    expect((await call('DELETE', `/api/columns/${open.id}`)).status).toBe(409);
    expect((await call('DELETE', `/api/columns/${open.id}?moveTo=${doing.id}`)).status).toBe(204);
    expect((await call('GET', `/api/cards/${card.id}`)).body.columnId).toBe(doing.id);
  });

  it('manages categories', async () => {
    const { b } = await boardWithColumns();
    const c = await call('POST', `/api/boards/${b.id}/categories`, { name: 'Putzen', color: 'blue' });
    expect(c.status).toBe(201);
    await call('PATCH', `/api/categories/${c.body.id}`, { color: 'teal' });
    expect((await call('GET', `/api/boards/${b.id}`)).body.categories[0]).toMatchObject({ name: 'Putzen', color: 'teal' });
    expect((await call('DELETE', `/api/categories/${c.body.id}`)).status).toBe(204);
  });

  it('updates and soft-deletes a board', async () => {
    const { b } = await boardWithColumns();
    const upd = await call('PATCH', `/api/boards/${b.id}`, { name: 'Zuhause', archiveAfterDays: 14 });
    expect(upd.body).toMatchObject({ name: 'Zuhause', archiveAfterDays: 14 });
    expect((await call('DELETE', `/api/boards/${b.id}`)).status).toBe(204);
    expect((await call('GET', '/api/boards')).body).toEqual([]);
  });
});

describe('cards', () => {
  it('creates a card with all fields and records the creator', async () => {
    const { b, columns } = await boardWithColumns();
    const me = (await call('GET', '/api/me')).body;
    const conny = me.people.find((p: any) => p.name === 'Conny');
    const res = await call('POST', `/api/boards/${b.id}/cards`, {
      columnId: columns[0]!.id,
      title: 'Bad putzen',
      priority: 'high',
      dueAt: '2026-11-01T10:00:00+01:00',
      assigneeIds: [conny.id],
      recurrence: { type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Bad putzen',
      createdBy: me.user.id,
      assigneeIds: [conny.id],
      dueAt: '2026-11-01T09:00:00.000Z',
    });
  });

  it('rejects a due date without a time and assignments to non-people', async () => {
    const { b, columns } = await boardWithColumns();
    const col = columns[0]!.id;
    expect((await call('POST', `/api/boards/${b.id}/cards`, { columnId: col, title: 'x', dueAt: '2026-11-01' })).status).toBe(400);
    const admin = store.resolveUser({ haId: 'ha-admin', name: 'admin', displayName: 'Admin' });
    const res = await call('POST', `/api/boards/${b.id}/cards`, { columnId: col, title: 'x', assigneeIds: [admin.id] });
    expect(res.status).toBe(400);
  });

  it('patches, moves, archives and deletes a card', async () => {
    const { b, columns } = await boardWithColumns();
    const open = columns[0]!;
    const doing = columns[1]!;
    const a = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: open.id, title: 'A' })).body;
    const c = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: open.id, title: 'B' })).body;

    const patched = await call('PATCH', `/api/cards/${a.id}`, { title: 'A2', description: 'Notiz', priority: 'low' });
    expect(patched.body).toMatchObject({ title: 'A2', description: 'Notiz', priority: 'low', version: 2 });

    const moved = await call('POST', `/api/cards/${c.id}/move`, { columnId: doing.id, afterId: null });
    expect(moved.body.columnId).toBe(doing.id);

    expect((await call('POST', `/api/cards/${a.id}/archive`, { archived: true })).status).toBe(204);
    expect((await call('GET', `/api/boards/${b.id}/archive`)).body.map((x: any) => x.id)).toEqual([a.id]);
    expect((await call('GET', `/api/boards/${b.id}`)).body.cards.map((x: any) => x.id)).toEqual([c.id]);

    expect((await call('DELETE', `/api/cards/${c.id}`)).status).toBe(204);
    expect((await call('GET', `/api/cards/${c.id}`)).status).toBe(404);
  });

  it('manages checklist items', async () => {
    const { b, columns } = await boardWithColumns();
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: columns[0]!.id, title: 'A' })).body;
    const item = await call('POST', `/api/cards/${card.id}/checklist`, { text: 'Spiegel' });
    expect(item.status).toBe(201);
    const done = await call('PATCH', `/api/checklist/${item.body.id}`, { done: true });
    expect(done.body.done).toBe(true);
    expect((await call('GET', `/api/cards/${card.id}`)).body.checklist).toEqual({ done: 1, total: 1 });
    expect((await call('DELETE', `/api/checklist/${item.body.id}`)).status).toBe(204);
  });

  it('adds links and fills in the page title when none is given', async () => {
    const { b, columns } = await boardWithColumns();
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: columns[0]!.id, title: 'A' })).body;
    const auto = await call('POST', `/api/cards/${card.id}/links`, { url: 'example.com' });
    expect(auto.status).toBe(201);
    expect(auto.body).toMatchObject({ url: 'https://example.com/', title: 'Beispiel-Seite', kind: 'web' });

    const manual = await call('POST', `/api/cards/${card.id}/links`, {
      url: 'https://maps.apple.com/?q=Berlin',
      title: 'Berlin',
    });
    expect(manual.body).toMatchObject({ title: 'Berlin', kind: 'maps' });

    pageTitle = null;
    const none = await call('POST', `/api/cards/${card.id}/links`, { url: 'https://offline.test' });
    expect(none.body.title).toBeNull();

    expect((await call('PATCH', `/api/links/${auto.body.id}`, { title: 'Neu' })).body.title).toBe('Neu');
    expect((await call('DELETE', `/api/links/${auto.body.id}`)).status).toBe(204);
    expect((await call('POST', `/api/cards/${card.id}/links`, { url: 'javascript:alert(1)' })).status).toBe(400);
  });
});

describe('erledigen', () => {
  it('erledigt eine einmalige Karte, protokolliert wer es war und archiviert sie später', async () => {
    const { b, columns } = await boardWithColumns();
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: columns[0]!.id, title: 'Müll' })).body;
    const res = await call('POST', `/api/cards/${card.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.card).toMatchObject({ columnId: columns[2]!.id, completedAt: '2026-10-30T10:00:00.000Z' });
    expect(res.body.card.history[0]).toMatchObject({ completedByName: 'Rene', source: 'app' });
    const again = await call('POST', `/api/cards/${card.id}/complete`);
    expect(again.body.completionId).toBeNull();
  });

  it('erledigt eine wiederkehrende Karte und macht es mit Rückgängig wieder gut', async () => {
    const { b, columns } = await boardWithColumns();
    const card = (
      await call('POST', `/api/boards/${b.id}/cards`, {
        columnId: columns[1]!.id,
        title: 'Bad putzen',
        dueAt: '2026-10-24T08:00:00Z',
        recurrence: { type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] },
      })
    ).body;
    const res = await call('POST', `/api/cards/${card.id}/complete`);
    expect(res.body.nextDueAt).toBe('2026-10-31T09:00:00.000Z');
    // Die erledigte Karte liegt in „Erledigt", die neue wartet oben in „Offen"
    expect(res.body.card).toMatchObject({ id: card.id, columnId: columns[2]!.id, recurrence: null });
    const next = (await call('GET', `/api/cards/${res.body.nextCardId}`)).body;
    expect(next).toMatchObject({ columnId: columns[0]!.id, dueAt: '2026-10-31T09:00:00.000Z', repeatedFrom: card.id });
    expect(next.carryOver).toEqual(['description', 'checklist', 'links', 'cost']);

    const undo = await call('POST', `/api/completions/${res.body.completionId}/undo`);
    expect(undo.status).toBe(200);
    expect(undo.body).toMatchObject({ columnId: columns[1]!.id, dueAt: '2026-10-24T08:00:00.000Z' });
    expect((await call('GET', `/api/cards/${res.body.nextCardId}`)).status).toBe(404);
    expect((await call('POST', `/api/completions/${res.body.completionId}/undo`)).status).toBe(404);
  });

  it('eine Karte in die Erledigt-Spalte ziehen erledigt sie', async () => {
    const { b, columns } = await boardWithColumns();
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: columns[0]!.id, title: 'x' })).body;
    const moved = await call('POST', `/api/cards/${card.id}/move`, { columnId: columns[2]!.id });
    expect(moved.body.completedAt).not.toBeNull();
    expect(moved.body.history).toHaveLength(1);
  });

  it('holt eine archivierte Karte in eine Spalte zurück', async () => {
    const { b, columns } = await boardWithColumns();
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: columns[0]!.id, title: 'x' })).body;
    await call('POST', `/api/cards/${card.id}/complete`);
    await call('POST', `/api/cards/${card.id}/archive`, { archived: true });
    const res = await call('POST', `/api/cards/${card.id}/restore-archived`, { columnId: columns[0]!.id });
    expect(res.body).toMatchObject({ columnId: columns[0]!.id, archivedAt: null, completedAt: null });
  });
});

describe('trash', () => {
  it('lists deleted items and restores them', async () => {
    const { b, columns } = await boardWithColumns();
    const card = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: columns[0]!.id, title: 'A' })).body;
    await call('DELETE', `/api/cards/${card.id}`);
    const trash = await call('GET', '/api/trash');
    expect(trash.body[0]).toMatchObject({ type: 'card', id: card.id, title: 'A' });
    expect((await call('POST', `/api/trash/card/${card.id}/restore`)).status).toBe(204);
    expect((await call('GET', `/api/cards/${card.id}`)).status).toBe(200);
    expect((await call('POST', `/api/trash/card/${card.id}/restore`)).status).toBe(404);
    expect((await call('POST', `/api/trash/unsinn/${card.id}/restore`)).status).toBe(400);
  });
});

describe('Falsche Feldtypen ergeben 400, nie 500 oder stilles Nichtstun', () => {
  async function karte() {
    const { b, columns } = await boardWithColumns();
    const c = (await call('POST', `/api/boards/${b.id}/cards`, { columnId: columns[0]!.id, title: 'Test' })).body;
    return { b, c, columns };
  }

  it('Beschreibung muss Text sein', async () => {
    const { c } = await karte();
    for (const description of [{}, { a: 1 }, 5, ['x'], true]) {
      const res = await call('PATCH', `/api/cards/${c.id}`, { description });
      expect(res.status, JSON.stringify(description)).toBe(400);
    }
    expect((await call('GET', `/api/cards/${c.id}`)).body.version).toBe(c.version);
    expect((await call('PATCH', `/api/cards/${c.id}`, { description: null })).status).toBe(200);
    expect((await call('PATCH', `/api/cards/${c.id}`, { description: 'Text' })).status).toBe(200);
  });

  it('beim Anlegen ebenso', async () => {
    const { b, columns } = await boardWithColumns();
    const res = await call('POST', `/api/boards/${b.id}/cards`, { columnId: columns[0]!.id, title: 'X', description: { a: 1 } });
    expect(res.status).toBe(400);
  });

  it('Zuständige und Kategorien: nur Texte als Kennungen', async () => {
    const { c } = await karte();
    expect((await call('PATCH', `/api/cards/${c.id}`, { assigneeIds: [{}] })).status).toBe(400);
    expect((await call('PATCH', `/api/cards/${c.id}`, { assigneeIds: [5] })).status).toBe(400);
    expect((await call('PATCH', `/api/cards/${c.id}`, { categoryIds: [{ a: 1 }] })).status).toBe(400);
  });

  it('Symbol und Farbe eines Boards müssen Text sein', async () => {
    const { b } = await karte();
    expect((await call('PATCH', `/api/boards/${b.id}`, { icon: {} })).status).toBe(400);
    expect((await call('PATCH', `/api/boards/${b.id}`, { color: { a: 1 } })).status).toBe(400);
    expect((await call('PATCH', `/api/boards/${b.id}`, { icon: '🏠', color: '#ff8a1f' })).status).toBe(200);
  });

  it('Titel eines Links muss Text sein', async () => {
    const { c } = await karte();
    expect((await call('POST', `/api/cards/${c.id}/links`, { url: 'https://example.org', title: 5 })).status).toBe(400);
  });

  it('Wiederholung: Obergrenze, unbekannte Felder werden verworfen', async () => {
    const { c } = await karte();
    const bad = await call('PATCH', `/api/cards/${c.id}`, { recurrence: { type: 'fixed', freq: 'daily', every: 1e9 } });
    expect(bad.status).toBe(400);
    const bad2 = await call('PATCH', `/api/cards/${c.id}`, { recurrence: { type: 'after_completion', every: 1e9, unit: 'days' } });
    expect(bad2.status).toBe(400);
    const ok = await call('PATCH', `/api/cards/${c.id}`, {
      dueAt: '2026-11-01T08:00:00Z',
      recurrence: { type: 'fixed', freq: 'weekly', every: 2, weekdays: [1], evil: 'x'.repeat(100) },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.recurrence).toEqual({ type: 'fixed', freq: 'weekly', every: 2, weekdays: [1] });
    // und die Karte lässt sich erledigen
    expect((await call('POST', `/api/cards/${c.id}/complete`, {})).status).toBe(200);
  });
});
