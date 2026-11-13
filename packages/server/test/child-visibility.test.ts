import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

// Welche Boards und Aufgaben ein Kind sieht: alle oder nur Boards mit eigenen Aufgaben, in jedem Bereich (nicht nur in der Boardliste).
const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const mia = as('ha-mia', 'Mia'); // Kind, nur eigene Boards
const tom = as('ha-tom', 'Tom'); // Kind, alle Boards
const ben = as('ha-ben', 'Ben');
const admin = as('ha-admin', 'Admin');

let app: FastifyInstance;
let store: Store;
const ids: Record<string, string> = {};

const get = (who: object, url: string) => app.inject({ url, headers: who as Record<string, string> });
const ok = <T>(res: { statusCode: number; json(): T }): T => {
  expect(res.statusCode).toBe(200);
  return res.json();
};

beforeEach(async () => {
  store = createStore(openDb(':memory:'));
  const miaId = store.addPerson({ haUserId: 'ha-mia', name: 'Mia' }).id;
  const tomId = store.addPerson({ haUserId: 'ha-tom', name: 'Tom' }).id;
  const benId = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  store.addPerson({ haUserId: 'ha-admin', name: 'Admin' });
  store.setChild(miaId, { isChild: true, childScope: 'assigned' });
  store.setChild(tomId, { isChild: true, childScope: 'all' });

  const due = '2099-01-01T08:00:00.000Z';
  const mk = (name: string, assignee: string | null, title: string, dueAt: string | null = due) => {
    const board = store.createBoard({ name });
    const col = store.getBoardView(board.id).columns[0]!.id;
    const card = store.createCard(board.id, { columnId: col, title, dueAt, assigneeIds: assignee ? [assignee] : [] }, benId);
    ids[`board${name}`] = board.id;
    ids[`card${name}`] = card.id;
    return { board, card, col };
  };
  mk('A', miaId, 'In A für Mia');
  mk('B', benId, 'In B für Ben');
  const c = mk('C', miaId, 'In C für Mia');
  store.completeCard(c.card.id, { by: miaId, source: 'app' }); // erledigt: das Board bleibt sichtbar
  store.addComment(ids.cardB!, benId, 'Ein Kommentar in B');

  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    files: { read: () => Buffer.from('abc'), remove: () => undefined } as never,
    directory: { isAdmin: async (id) => id === 'ha-admin', persons: async () => [] },
  });
});

describe('Kind mit „nur eigene Boards"', () => {
  it('die Boardliste zeigt nur Boards mit eigenen Aufgaben, auch wenn die Aufgabe schon erledigt ist', async () => {
    const boards = ok<{ id: string; name: string }[]>(await get(mia, '/api/boards'));
    expect(boards.map((b) => b.name).sort()).toEqual(['A', 'C']);
  });

  it('ein fremdes Board ist nicht da: 404, ein eigenes geht', async () => {
    expect((await get(mia, `/api/boards/${ids.boardB}`)).statusCode).toBe(404);
    expect((await get(mia, `/api/boards/${ids.boardA}`)).statusCode).toBe(200);
    expect((await get(mia, `/api/boards/${ids.boardC}`)).statusCode).toBe(200);
  });

  it('Aufgaben nach Kennung: nur die aus sichtbaren Boards', async () => {
    const cards = ok<{ id: string }[]>(await get(mia, `/api/cards?ids=${ids.cardA},${ids.cardB},${ids.cardC}`));
    expect(cards.map((c) => c.id).sort()).toEqual([ids.cardA, ids.cardC].sort());
    expect((await get(mia, `/api/cards/${ids.cardB}`)).statusCode).toBe(404);
    expect((await get(mia, `/api/cards/${ids.cardA}`)).statusCode).toBe(200);
  });

  it('Kommentare und Erledigungen einer fremden Aufgabe: 404', async () => {
    expect((await get(mia, `/api/cards/${ids.cardB}/comments`)).statusCode).toBe(404);
    expect((await get(mia, `/api/cards/${ids.cardB}/completions`)).statusCode).toBe(404);
    expect((await get(mia, `/api/cards/${ids.cardA}/comments`)).statusCode).toBe(200);
    expect((await get(mia, `/api/cards/${ids.cardC}/completions`)).statusCode).toBe(200);
  });

  it('Agenda und Kalender: nur Aufgaben aus sichtbaren Boards, auch wenn man das fremde Board ausdrücklich verlangt', async () => {
    const all = ok<{ boardName: string }[]>(await get(mia, '/api/schedule?done=1'));
    expect(all.map((c) => c.boardName).sort()).toEqual(['A', 'C']);
    const asked = ok<{ boardName: string }[]>(await get(mia, `/api/schedule?boards=${ids.boardB}&done=1`));
    expect(asked).toEqual([]);
  });

  it('Anhänge einer fremden Aufgabe: 404', async () => {
    const a = store.addAttachment(ids.cardB!, { id: 'att-b', filename: 'x.png', mime: 'image/png', size: 3, file: 'f1', thumb: 't1' }, null);
    const mine = store.addAttachment(ids.cardA!, { id: 'att-a', filename: 'y.png', mime: 'image/png', size: 3, file: 'f2', thumb: 't2' }, null);
    for (const path of [`/api/attachments/${a.id}`, `/api/attachments/${a.id}/thumb`]) {
      const res = await get(mia, path);
      expect(res.statusCode, path).toBe(404);
      expect(res.json().error).toMatch(/Anhang/);
    }
    expect((await get(mia, `/api/attachments/${mine.id}`)).statusCode).toBe(200);
    expect((await get(mia, `/api/attachments/${mine.id}/thumb`)).statusCode).toBe(200);
    expect((await get(ben, `/api/attachments/${a.id}`)).statusCode).toBe(200);
  });

  it('wird ihr eine Aufgabe in einem neuen Board zugewiesen, sieht sie das Board sofort', async () => {
    const miaId = store.people().find((p) => p.name === 'Mia')!.id;
    expect(ok<{ name: string }[]>(await get(mia, '/api/boards')).map((b) => b.name)).not.toContain('B');
    store.updateCard(ids.cardB!, { assigneeIds: [miaId] });
    expect(ok<{ name: string }[]>(await get(mia, '/api/boards')).map((b) => b.name).sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('Kind mit „alle Boards", Mitglieder und Administratoren', () => {
  it('Tom sieht alle Boards und Aufgaben (Lesen), darf aber weiter nur Eigenes ändern', async () => {
    expect(ok<unknown[]>(await get(tom, '/api/boards'))).toHaveLength(3);
    expect((await get(tom, `/api/boards/${ids.boardB}`)).statusCode).toBe(200);
    expect((await get(tom, `/api/cards/${ids.cardB}`)).statusCode).toBe(200);
    const res = await app.inject({ method: 'POST', url: `/api/cards/${ids.cardB}/complete`, headers: tom, payload: {} });
    expect(res.statusCode).toBe(403);
  });

  it('ein Mitglied und ein Administrator sehen alles', async () => {
    expect(ok<unknown[]>(await get(ben, '/api/boards'))).toHaveLength(3);
    expect(ok<unknown[]>(await get(admin, '/api/boards'))).toHaveLength(3);
    expect((await get(ben, `/api/cards/${ids.cardA}`)).statusCode).toBe(200);
  });

  it('ein Administrator, der als Kind mit „nur eigene Boards" eingetragen ist, sieht trotzdem alles', async () => {
    const adminId = store.people().find((p) => p.name === 'Admin')!.id;
    store.setChild(adminId, { isChild: true, childScope: 'assigned' });
    expect(ok<unknown[]>(await get(admin, '/api/boards'))).toHaveLength(3);
  });
});
