import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { visibleChanges, boardOfRoute, registerBoardGuard } from '../src/api/board-guard.js';
import { openDb } from '../src/db.js';
import { AppError } from '../src/errors.js';
import { createEventBus } from '../src/events.js';
import { ingressAuth } from '../src/ingress.js';
import { createSensors } from '../src/sensors.js';
import { createStore, type Store } from '../src/store.js';

/**
 * Sichtbarkeit von Boards (Migration 27). Anna legt ein privates Board und eines für Ausgewählte an; Ben ist nicht dabei, der Administrator
 * (Chef) auch nicht: Beide sehen davon nichts, in keinem Bereich der App. Ein Test je Bereich beweist, dass ein Fremder nichts sieht.
 */
const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const anna = as('ha-anna', 'Anna');
const ben = as('ha-ben', 'Ben');
const chef = as('ha-chef', 'Chef');
const cleo = as('ha-cleo', 'Cleo');

let app: FastifyInstance;
let store: Store;
let bus: ReturnType<typeof createEventBus>;
let ids: { anna: string; ben: string; chef: string; cleo: string };
let pub: { board: string; col: string; card: string }; // Board für alle
let priv: { board: string; col: string; card: string }; // „nur ich" (Anna)
let sel: { board: string; col: string; card: string }; // ausgewählt: Anna und Cleo

const NOW = new Date('2026-11-04T12:00:00Z');
const soon = '2026-11-04T15:00:00.000Z';

async function call(who: object, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: who as Record<string, string>, payload: method === 'GET' ? undefined : (payload ?? {}) });
  return { status: res.statusCode, body: res.body && res.headers['content-type']?.toString().includes('json') ? (res.json() as any) : null };
}

function makeBoard(name: string, visibility: 'all' | 'private' | 'selected', owner: string | null, members: string[] = []) {
  const board = store.createBoard({ name, visibility, ownerId: owner, memberIds: members, withPlanned: true });
  const col = store.getBoardView(board.id).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  return { board: board.id, col };
}

beforeEach(async () => {
  store = createStore(openDb(':memory:'), { now: () => NOW });
  bus = createEventBus({ changes: () => store.takeChanges() });
  ids = {
    anna: store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id,
    ben: store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id,
    chef: store.addPerson({ haUserId: 'ha-chef', name: 'Chef' }).id,
    cleo: store.addPerson({ haUserId: 'ha-cleo', name: 'Cleo' }).id,
  };
  const a = makeBoard('Alle', 'all', ids.anna);
  const p = makeBoard('Meine Ideen', 'private', ids.anna);
  const s = makeBoard('Anna und Cleo', 'selected', ids.anna, [ids.cleo]);
  pub = { ...a, card: store.createCard(a.board, { columnId: a.col, title: 'Müll raus', dueAt: soon, assigneeIds: [ids.ben] }, ids.anna).id };
  priv = { ...p, card: store.createCard(p.board, { columnId: p.col, title: 'Geheimer Plan', dueAt: soon, assigneeIds: [ids.anna] }, ids.anna).id };
  sel = { ...s, card: store.createCard(s.board, { columnId: s.col, title: 'Überraschung', dueAt: soon, assigneeIds: [ids.cleo] }, ids.anna).id };
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    bus,
    now: () => NOW,
    directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] },
  });
  await app.ready();
});

describe('canSeeBoard: die eine Regel', () => {
  it('alle, nur der Besitzer, Besitzer und Mitglieder; Administratoren sehen fremde Boards nicht', () => {
    for (const who of [ids.anna, ids.ben, ids.chef, ids.cleo, null]) expect(store.canSeeBoard(who, pub.board)).toBe(true);
    expect([ids.anna, ids.ben, ids.chef, ids.cleo, null].map((w) => store.canSeeBoard(w, priv.board))).toEqual([true, false, false, false, false]);
    expect([ids.anna, ids.ben, ids.chef, ids.cleo, null].map((w) => store.canSeeBoard(w, sel.board))).toEqual([true, false, false, true, false]);
    expect(store.canSeeBoard(ids.anna, 'gibt-es-nicht')).toBe(false);
  });

  it('wer ein Board sieht: Besitzer und Mitglieder in Reihenfolge der Personenliste, ein unbekanntes Board sieht niemand', () => {
    expect(store.boardPeopleIds(pub.board)).toEqual([ids.anna, ids.ben, ids.chef, ids.cleo]);
    expect(store.boardPeopleIds(priv.board)).toEqual([ids.anna]);
    expect(store.boardPeopleIds(sel.board)).toEqual([ids.anna, ids.cleo]);
    expect(store.boardPeopleIds('gibt-es-nicht')).toEqual([]);
  });

  it('wer aus der Liste der Personen entfernt ist, sieht nur noch Boards für alle', () => {
    store.removePerson(ids.anna);
    expect(store.canSeeBoard(ids.anna, priv.board)).toBe(false);
    expect(store.canSeeBoard(ids.anna, sel.board)).toBe(false);
    expect(store.canSeeBoard(ids.anna, pub.board)).toBe(true);
    // Cleo sieht das ausgewählte Board weiter, auch wenn sein Besitzer gegangen ist
    expect(store.canSeeBoard(ids.cleo, sel.board)).toBe(true);
    // Bestandsboards ohne Besitzer bleiben für alle sichtbar
    const old = store.createBoard({ name: 'Alt' });
    expect(old.ownerId).toBeNull();
    expect(store.canSeeBoard(ids.ben, old.id)).toBe(true);
  });

  it('private Boards und Boards für Ausgewählte brauchen einen Besitzer, der eine Person ist', () => {
    expect(() => store.createBoard({ name: 'x', visibility: 'private' })).toThrow(/Personen in Stups/);
    expect(() => store.createBoard({ name: 'x', visibility: 'private', ownerId: 'niemand' })).toThrow(/Personen in Stups/);
    expect(() => store.createBoard({ name: 'x', visibility: 'geheim' as never, ownerId: ids.anna })).toThrow(/Sichtbarkeit/);
    expect(() => store.createBoard({ name: 'x', visibility: 'selected', ownerId: ids.anna, memberIds: ['niemand'] })).toThrow(/Personen aus Stups/);
  });
});

describe('Ein Fremder sieht nichts: ein Test je Bereich', () => {
  it('Board-Liste', async () => {
    const names = async (who: object) => ((await call(who, 'GET', '/api/boards')).body as { name: string }[]).map((b) => b.name);
    expect(await names(anna)).toEqual(['Alle', 'Meine Ideen', 'Anna und Cleo']);
    expect(await names(cleo)).toEqual(['Alle', 'Anna und Cleo']);
    expect(await names(ben)).toEqual(['Alle']);
    expect(await names(chef)).toEqual(['Alle']); // auch ein Administrator
  });

  it('Board-Ansicht und alles darunter: 404 statt 403', async () => {
    for (const who of [ben, chef]) {
      for (const [method, url] of [
        ['GET', `/api/boards/${priv.board}`],
        ['GET', `/api/boards/${priv.board}/archive`],
        ['PATCH', `/api/boards/${priv.board}`],
        ['DELETE', `/api/boards/${priv.board}`],
        ['POST', `/api/boards/${priv.board}/cards`],
        ['POST', `/api/boards/${priv.board}/columns`],
        ['POST', `/api/boards/${priv.board}/categories`],
        ['POST', `/api/boards/${priv.board}/save-as-template`],
        ['PATCH', `/api/columns/${priv.col}`],
        ['POST', `/api/columns/${priv.col}/move`],
        ['DELETE', `/api/columns/${priv.col}`],
        ['GET', `/api/boards/${sel.board}`],
      ] as const) {
        const res = await call(who, method, url);
        expect(res.status, `${method} ${url}`).toBe(404);
      }
    }
    expect((await call(anna, 'GET', `/api/boards/${priv.board}`)).status).toBe(200);
    expect((await call(cleo, 'GET', `/api/boards/${sel.board}`)).status).toBe(200);
    expect((await call(cleo, 'GET', `/api/boards/${priv.board}`)).status).toBe(404);
  });

  it('Aufgaben-Direktaufrufe und alles an der Aufgabe', async () => {
    const checklist = store.addChecklistItem(priv.card, 'eins').id;
    const link = store.addLink(priv.card, { url: 'https://example.org' } as never).id;
    const comment = store.addComment(priv.card, ids.anna, 'Hallo').id;
    const completion = store.completeCard(store.createCard(priv.board, { columnId: priv.col, title: 'Fertig' }, ids.anna).id, { by: ids.anna, source: 'app' });
    const routes: ['GET' | 'POST' | 'PATCH' | 'DELETE', string][] = [
      ['GET', `/api/cards/${priv.card}`],
      ['PATCH', `/api/cards/${priv.card}`],
      ['DELETE', `/api/cards/${priv.card}`],
      ['POST', `/api/cards/${priv.card}/move`],
      ['POST', `/api/cards/${priv.card}/complete`],
      ['POST', `/api/cards/${priv.card}/duplicate`],
      ['POST', `/api/cards/${priv.card}/archive`],
      ['POST', `/api/cards/${priv.card}/checklist`],
      ['POST', `/api/cards/${priv.card}/comments`],
      ['GET', `/api/cards/${priv.card}/comments`],
      ['POST', `/api/cards/${priv.card}/links`],
      ['GET', `/api/cards/${priv.card}/completions`],
      ['GET', `/api/cards/${priv.card}/nudges`],
      ['POST', `/api/cards/${priv.card}/nudge`],
      ['POST', `/api/cards/${priv.card}/attachments`],
      ['PATCH', `/api/checklist/${checklist}`],
      ['DELETE', `/api/checklist/${checklist}`],
      ['PATCH', `/api/links/${link}`],
      ['DELETE', `/api/links/${link}`],
      ['PATCH', `/api/comments/${comment}`],
      ['DELETE', `/api/comments/${comment}`],
      ['POST', `/api/completions/${completion.completionId}/undo`],
    ];
    for (const who of [ben, chef, cleo]) {
      for (const [method, url] of routes) expect((await call(who, method, url)).status, `${method} ${url}`).toBe(404);
    }
    expect(store.getCard(priv.card).title).toBe('Geheimer Plan');
    expect((await call(anna, 'GET', `/api/cards/${priv.card}`)).status).toBe(200);
    expect((await call(ben, 'GET', `/api/cards/${sel.card}`)).status).toBe(404);
    expect((await call(cleo, 'GET', `/api/cards/${sel.card}`)).status).toBe(200);
  });

  it('Anhänge: Datei und Vorschaubild', async () => {
    const stored = store.addAttachment(priv.card, { id: 'att-1', filename: 'a.png', mime: 'image/png', size: 3, file: 'f.png', thumb: 'f-t.png' }, ids.anna);
    for (const who of [ben, chef]) {
      expect((await call(who, 'GET', `/api/attachments/${stored.id}`)).status).toBe(404);
      expect((await call(who, 'GET', `/api/attachments/${stored.id}/thumb`)).status).toBe(404);
      expect((await call(who, 'DELETE', `/api/attachments/${stored.id}`)).status).toBe(404);
    }
  });

  it('Aufgaben mit Kennungen (Live-Sync) und Termine (Agenda, Kalender)', async () => {
    const list = async (who: object) => ((await call(who, 'GET', `/api/cards?ids=${[pub.card, priv.card, sel.card].join(',')}`)).body as { title: string }[]).map((c) => c.title).sort();
    expect(await list(anna)).toEqual(['Geheimer Plan', 'Müll raus', 'Überraschung']);
    expect(await list(cleo)).toEqual(['Müll raus', 'Überraschung']);
    expect(await list(ben)).toEqual(['Müll raus']);
    expect(await list(chef)).toEqual(['Müll raus']);

    const titles = async (who: object, qs = '') => ((await call(who, 'GET', `/api/schedule${qs}`)).body as { title: string }[]).map((c) => c.title).sort();
    expect(await titles(anna)).toEqual(['Geheimer Plan', 'Müll raus', 'Überraschung']);
    expect(await titles(ben)).toEqual(['Müll raus']);
    expect(await titles(chef)).toEqual(['Müll raus']);
    // auch wenn das fremde Board ausdrücklich verlangt wird
    expect(await titles(ben, `?boards=${priv.board},${sel.board}`)).toEqual([]);
    expect(await titles(ben, '?undated=1')).toEqual([]);
  });

  it('Heute: Aufgaben, Zahlen der anderen und Aufgaben vom Haus', async () => {
    const view = async (who: object) => (await call(who, 'GET', '/api/today')).body as { mine: { title: string }[]; others: { personId: string; open: number }[] };
    expect((await view(anna)).mine.map((c) => c.title)).toEqual(['Geheimer Plan']);
    // Anna und Cleo haben je eine eigene Aufgabe in einem Board, das Ben nicht sieht: Ben sieht davon nichts, auch nicht in den Zahlen
    const forBen = await view(ben);
    expect(forBen.mine.map((c) => c.title)).toEqual(['Müll raus']);
    expect(forBen.others).toEqual([]);
    expect((await view(cleo)).others).toEqual([{ personId: ids.ben, open: 1 }]); // Annas private Aufgabe zählt bei Anna nicht mit
    // Anna sieht beide Boards: bei Cleo und Ben je eine offene Aufgabe
    expect((await view(anna)).others.sort((x, y) => (x.personId < y.personId ? -1 : 1))).toEqual(
      [{ personId: ids.cleo, open: 1 }, { personId: ids.ben, open: 1 }].sort((x, y) => (x.personId < y.personId ? -1 : 1)),
    );
  });

  it('Posteingang: Kommentare, Wächter und Erinnerungen zu fremden Aufgaben erscheinen nie', async () => {
    // Anna ist Zuständige im privaten Board; sie ändert danach ihre Meinung nicht, Ben kommentiert nicht (er sieht die Aufgabe nicht)
    store.addComment(priv.card, ids.cleo, 'Von jemandem, der es nie sehen dürfte');
    store.addComment(sel.card, ids.anna, 'Für Cleo');
    store.addComment(pub.card, ids.anna, 'Für Ben');
    const items = async (who: object) => ((await call(who, 'GET', '/api/inbox')).body.items as { cardId: string }[]).map((i) => i.cardId);
    expect(await items(ben)).toEqual([pub.card]);
    expect(await items(chef)).toEqual([]);
    expect(await items(cleo)).toEqual([sel.card]); // Cleos eigene Aufgabe: Annas Kommentar dazu
    // Anna sieht den Kommentar von Cleo an ihrer privaten Aufgabe (die Aufgabe gehört ihr)
    expect(await items(anna)).toContain(priv.card);
  });

  it('Papierkorb', async () => {
    store.deleteCard(priv.card);
    store.deleteCard(sel.card);
    store.deleteCard(pub.card);
    const titles = async (who: object) => ((await call(who, 'GET', '/api/trash')).body as { title: string }[]).map((t) => t.title).sort();
    expect(await titles(ben)).toEqual(['Müll raus']);
    expect(await titles(chef)).toEqual(['Müll raus']);
    expect(await titles(cleo)).toEqual(['Müll raus', 'Überraschung']);
    expect(await titles(anna)).toEqual(['Geheimer Plan', 'Müll raus', 'Überraschung']);
    expect((await call(ben, 'POST', `/api/trash/card/${priv.card}/restore`)).status).toBe(404);
    expect((await call(chef, 'POST', `/api/trash/card/${sel.card}/restore`)).status).toBe(404);
    expect((await call(anna, 'POST', `/api/trash/card/${priv.card}/restore`)).status).toBe(204);
  });

  it('Symbole erkennen: Kandidaten und Anwenden gelten nur für Aufgaben sichtbarer Boards (auch für Administratoren)', async () => {
    // Chef ist Administrator mit dem Recht „settings“, aber weder Besitzer noch Mitglied der Boards von Anna
    const list = ((await call(chef, 'GET', '/api/icons/candidates')).body as { id: string; title: string }[]).map((c) => c.title);
    expect(list).toContain('Müll raus');
    expect(list).not.toContain('Geheimer Plan');
    expect(list).not.toContain('Überraschung');
    // Auch mit bekannter Kennung lässt sich bei fremden Aufgaben kein Symbol setzen: sie zählen als übersprungen
    const res = await call(chef, 'POST', '/api/icons/apply', {
      items: [
        { id: priv.card, icon: 'dog' },
        { id: sel.card, icon: 'cat' },
        { id: pub.card, icon: 'leaf' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 1, skipped: 2 });
    expect(store.getCard(priv.card).icon).toBeNull();
    expect(store.getCard(sel.card).icon).toBeNull();
    expect(store.getCard(pub.card).icon).toBe('leaf');
  });

  it('Symbole erkennen im Store: die Besitzerin sieht ihre eigenen Aufgaben, ein Hintergrunddienst (null) nur Boards für alle', () => {
    const titles = (viewer: string | null) => store.cardsWithoutIcon(viewer).map((c) => c.title).sort();
    expect(titles(ids.anna)).toEqual(['Geheimer Plan', 'Müll raus', 'Überraschung']);
    expect(titles(ids.cleo)).toEqual(['Müll raus', 'Überraschung']);
    expect(titles(ids.chef)).toEqual(['Müll raus']);
    expect(titles(null)).toEqual(['Müll raus']);
    expect(store.applyDetectedIcons([{ id: priv.card, icon: 'dog' }], ids.ben)).toEqual({ updated: 0, skipped: 1 });
    expect(store.applyDetectedIcons([{ id: priv.card, icon: 'dog' }], ids.anna)).toEqual({ updated: 1, skipped: 0 });
  });

  it('Stupse: wer das Board nicht sieht, steht nicht zur Auswahl und bekommt keinen', async () => {
    const targets = (await call(anna, 'GET', `/api/cards/${priv.card}/nudges`)).body.people as { id: string }[];
    expect(targets).toEqual([]);
    const shared = (await call(anna, 'GET', `/api/cards/${sel.card}/nudges`)).body.people as { id: string }[];
    expect(shared.map((p) => p.id)).toEqual([ids.cleo]);
    // direkt versucht: übersprungen
    const res = store.createNudges(sel.card, ids.anna, { to: [ids.ben], template: 'think' });
    expect(res.sent).toEqual([]);
    expect(res.skipped).toMatchObject([{ to: ids.ben }]);
  });

  it('Push, Erinnerungen und Tageszusammenfassung: nur Zuständige, die das Board sehen; Sensoren nur Boards für alle', () => {
    const due = store.openDueCards();
    expect(due.find((c) => c.id === priv.card)!.assigneeIds).toEqual([ids.anna]);
    // bleibt eine Zuständigkeit stehen, obwohl die Person das Board nicht (mehr) sieht, geht nichts an sie
    store.transaction(() => store.updateCard(sel.card, { assigneeIds: [ids.cleo] }));
    store.setNotifyServices(ids.ben, ['mobile_app_ben']);
    const stale = new Set(store.openDueCards().find((c) => c.id === sel.card)!.assigneeIds);
    expect([...stale]).toEqual([ids.cleo]);
    const publicOnly = store.openDueCards({ publicOnly: true });
    expect(publicOnly.map((c) => c.title)).toEqual(['Müll raus']);
    expect(store.openNudgeCounts({ publicOnly: true }).total).toBe(0);
    expect(store.openWatcherCardCount({ publicOnly: true })).toBe(0);
  });

  it('HA-Sensoren: gesamt und je Person zeigen nur Aufgaben aus Boards für alle', async () => {
    const writes = new Map<string, { state: string; attributes: Record<string, unknown> }>();
    const sensors = createSensors({
      store,
      ha: { setState: async (entity, state, attributes) => void writes.set(entity, { state, attributes }) },
      options: { users: [] },
      now: () => NOW,
      timeZone: () => 'Europe/Berlin',
    });
    await sensors.publish();
    const all = [...writes.values()].flatMap((w) => (w.attributes.tasks as { title: string }[] | undefined)?.map((t) => t.title) ?? []);
    expect(all).toContain('Müll raus');
    expect(all).not.toContain('Geheimer Plan');
    expect(all).not.toContain('Überraschung');
    expect(JSON.stringify([...writes.values()])).not.toMatch(/Geheimer Plan|Überraschung/);
  });

  it('Live-Sync (WebSocket): Aufgaben fremder Boards werden aus den Meldungen genommen', () => {
    const changes = { full: false, cards: [pub.card, priv.card, sel.card] };
    expect(visibleChanges(store, changes, ids.ben)).toEqual({ full: false, cards: [pub.card] });
    expect(visibleChanges(store, changes, ids.chef)).toEqual({ full: false, cards: [pub.card] });
    expect(visibleChanges(store, changes, ids.cleo)).toEqual({ full: false, cards: [pub.card, sel.card] });
    expect(visibleChanges(store, changes, ids.anna)).toEqual(changes);
    expect(visibleChanges(store, { full: true, cards: [] }, ids.ben)).toEqual({ full: true, cards: [] });
    expect(visibleChanges(store, undefined, ids.ben)).toBeUndefined();
  });

  it('Statistik und Fairness: private Boards zählen nie, ausgenommene Boards auch nicht (rückwirkend)', () => {
    const done = (board: { board: string; col: string }, title: string) => {
      const c = store.createCard(board.board, { columnId: board.col, title }, ids.anna);
      store.completeCard(c.id, { by: ids.anna, source: 'app' });
    };
    done(pub, 'A');
    done(priv, 'B');
    done(sel, 'C');
    const week = () => store.fairness('week').people.find((p) => p.id === ids.anna)!;
    expect(week()).toMatchObject({ done: 2, created: 3 + 1 }); // erledigt: A und C; angelegt: Müll raus, A, C (ohne die privaten) + Überraschung
    store.updateBoard(sel.board, { countsForFairness: false }, ids.anna);
    expect(week()).toMatchObject({ done: 1 });
    expect(store.fairness('week').total.done).toBe(1);
    // zurück: die alten Zahlen sind wieder da
    store.updateBoard(sel.board, { countsForFairness: true }, ids.anna);
    expect(week().done).toBe(2);
  });

  it('Admin-Liste „Boards ohne Besitzer": nur Name und Zahl der Aufgaben, löschen geht', async () => {
    store.removePerson(ids.anna);
    expect((await call(ben, 'GET', '/api/admin/orphan-boards')).status).toBe(403);
    const list = (await call(chef, 'GET', '/api/admin/orphan-boards')).body as Record<string, unknown>[];
    expect(list.map((b) => b.name).sort()).toEqual(['Anna und Cleo', 'Meine Ideen']);
    expect(Object.keys(list[0]!).sort()).toEqual(['cards', 'id', 'name']);
    expect((await call(chef, 'GET', `/api/boards/${priv.board}`)).status).toBe(404); // auch jetzt kein Blick hinein
    expect((await call(ben, 'DELETE', `/api/admin/orphan-boards/${priv.board}`)).status).toBe(403);
    expect((await call(chef, 'DELETE', `/api/admin/orphan-boards/${priv.board}`)).status).toBe(204);
    const notOrphan = await call(chef, 'DELETE', `/api/admin/orphan-boards/${pub.board}`);
    expect(notOrphan.status).toBe(404); // nur Boards ohne Besitzer
    expect(notOrphan.body.error).toBe('Board nicht gefunden');
    expect(((await call(chef, 'GET', '/api/admin/orphan-boards')).body as unknown[]).length).toBe(1);
  });
});

describe('Zuständige nur aus den Personen, die das Board sehen', () => {
  it('beim Anlegen und Ändern einer Aufgabe', async () => {
    const bad = await call(anna, 'POST', `/api/boards/${priv.board}/cards`, { columnId: priv.col, title: 'x', assigneeIds: [ids.ben] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/Board sehen/);
    expect((await call(anna, 'POST', `/api/boards/${sel.board}/cards`, { columnId: sel.col, title: 'x', assigneeIds: [ids.cleo, ids.anna] })).status).toBe(201);
    expect((await call(anna, 'PATCH', `/api/cards/${sel.card}`, { assigneeIds: [ids.ben] })).status).toBe(400);
    expect((await call(anna, 'PATCH', `/api/cards/${pub.card}`, { assigneeIds: [ids.ben, ids.cleo] })).status).toBe(200);
  });

  it('beim Wechsel der Sichtbarkeit werden unzulässige Zuständigkeiten entfernt', async () => {
    store.updateCard(pub.card, { assigneeIds: [ids.ben, ids.cleo, ids.anna] });
    const res = await call(anna, 'PATCH', `/api/boards/${pub.board}`, { visibility: 'selected', memberIds: [ids.cleo] });
    expect(res.status).toBe(200);
    expect(store.getCard(pub.card).assigneeIds.sort()).toEqual([ids.anna, ids.cleo].sort());
    // „nur ich": nur Anna bleibt
    expect((await call(anna, 'PATCH', `/api/boards/${pub.board}`, { visibility: 'private' })).status).toBe(200);
    expect(store.getCard(pub.card).assigneeIds).toEqual([ids.anna]);
    // jetzt sieht Cleo es nicht mehr
    expect((await call(cleo, 'GET', `/api/boards/${pub.board}`)).status).toBe(404);
  });

  it('die Vorschau sagt vorher, wen es trifft, ohne etwas zu ändern', async () => {
    store.updateCard(pub.card, { assigneeIds: [ids.ben] });
    const preview = await call(anna, 'GET', `/api/boards/${pub.board}/access-preview?visibility=private`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ removedIds: expect.arrayContaining([ids.ben, ids.cleo, ids.chef]), assigneeCards: 1, watchers: [], blocking: [] });
    expect(store.getCard(pub.card).assigneeIds).toEqual([ids.ben]);
    expect((await call(ben, 'GET', `/api/boards/${pub.board}/access-preview?visibility=private`)).status).toBe(403);
  });
});

describe('Wer das Board ändern darf', () => {
  it('Sichtbarkeit, Fairness und Mitglieder: nur der Besitzer; Bestandsboards ohne Besitzer: ein Administrator', async () => {
    expect((await call(ben, 'PATCH', `/api/boards/${pub.board}`, { countsForFairness: false })).status).toBe(403);
    expect((await call(chef, 'PATCH', `/api/boards/${pub.board}`, { visibility: 'selected', memberIds: [] })).status).toBe(403);
    expect((await call(ben, 'PATCH', `/api/boards/${pub.board}`, { name: 'Umbenannt' })).status).toBe(200); // der Name wie bisher für alle Erwachsenen
    expect((await call(anna, 'PATCH', `/api/boards/${pub.board}`, { countsForFairness: false })).body.countsForFairness).toBe(false);

    const old = store.createBoard({ name: 'Alt' });
    expect((await call(ben, 'PATCH', `/api/boards/${old.id}`, { visibility: 'private' })).status).toBe(403);
    // wer ein Bestandsboard auf „nur ich" stellt, wird Besitzer
    const res = await call(chef, 'PATCH', `/api/boards/${old.id}`, { visibility: 'private' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ visibility: 'private', ownerId: ids.chef });
    expect((await call(ben, 'GET', `/api/boards/${old.id}`)).status).toBe(404);
  });

  it('Anlegen: Besitzer ist die anlegende Person; Standard ist „alle" und zählt zur Fairness', async () => {
    const plain = await call(ben, 'POST', '/api/boards', { name: 'Neu' });
    expect(plain.body).toMatchObject({ visibility: 'all', ownerId: ids.ben, countsForFairness: true, memberIds: [] });
    const mine = await call(ben, 'POST', '/api/boards', { name: 'Nur Ben', visibility: 'private', countsForFairness: false });
    expect(mine.body).toMatchObject({ visibility: 'private', ownerId: ids.ben, countsForFairness: false });
    expect((await call(anna, 'GET', `/api/boards/${mine.body.id}`)).status).toBe(404);
    const group = await call(ben, 'POST', '/api/boards', { name: 'Zu zweit', visibility: 'selected', memberIds: [ids.anna, ids.ben] });
    expect(group.body).toMatchObject({ visibility: 'selected', memberIds: [ids.anna] }); // der Besitzer steht nie in der Liste
    expect((await call(anna, 'GET', `/api/boards/${group.body.id}`)).status).toBe(200);
    expect((await call(cleo, 'GET', `/api/boards/${group.body.id}`)).status).toBe(404);
  });
});

describe('Die Tür kennt jede Route mit Kennung', () => {
  it('jede Route mit Board, Spalte, Kategorie, Aufgabe oder etwas an einer Aufgabe ist einem Board zugeordnet (sonst wäre sie ungeschützt)', () => {
    const routes = JSON.parse(readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'api-routes.json'), 'utf8')) as string[];
    const resource = /^\w+ \/api\/(boards|columns|categories|cards|checklist|links|comments|completions|attachments|trash)\/:/;
    const bound = routes.filter((r) => !r.startsWith('HEAD ') && resource.test(r));
    expect(bound.length).toBeGreaterThan(30);
    for (const r of bound) {
      const url = r.split(' ')[1]!;
      const target = boardOfRoute(store, { routeOptions: { url }, params: { id: 'x', type: 'card' } } as never);
      expect(target, r).not.toBeNull();
    }
  });
});

describe('Die Tür im Einzelnen: Ziel und Meldung je Route', () => {
  const route = (url: string, params: Record<string, string> = { id: 'x' }) => boardOfRoute(store, { routeOptions: { url }, params } as never);

  it('jede Art von Route führt zum Board dahinter und nennt im 404, was fehlt', () => {
    const checklist = store.addChecklistItem(priv.card, 'eins').id;
    const link = store.addLink(priv.card, { url: 'https://example.org' } as never).id;
    const comment = store.addComment(priv.card, ids.anna, 'Hallo').id;
    const completion = store.completeCard(store.createCard(priv.board, { columnId: priv.col, title: 'Fertig' }, ids.anna).id, { by: ids.anna, source: 'app' });
    const category = store.addCategory(priv.board, { name: 'Küche', color: '#ff0000' }).id;
    store.addAttachment(priv.card, { id: 'att-1', filename: 'a.png', mime: 'image/png', size: 3, file: 'f.png', thumb: 'f-t.png' }, ids.anna);
    store.deleteCard(sel.card);
    const card = 'Aufgabe nicht gefunden';
    expect(route('/api/boards/:id', { id: priv.board })).toEqual({ board: priv.board, what: 'Board nicht gefunden', archived: false });
    expect(route('/api/boards/:id/cards', { id: priv.board })).toEqual({ board: priv.board, what: 'Board nicht gefunden', archived: false });
    expect(route('/api/boards/:id/unarchive', { id: priv.board })).toEqual({ board: priv.board, what: 'Board nicht gefunden', archived: true });
    expect(route('/api/columns/:id', { id: priv.col })).toEqual({ board: priv.board, what: 'Spalte nicht gefunden' });
    expect(route('/api/categories/:id', { id: category })).toEqual({ board: priv.board, what: 'Kategorie nicht gefunden' });
    expect(route('/api/cards/:id/move', { id: priv.card })).toEqual({ board: priv.board, what: card });
    expect(route('/api/checklist/:id', { id: checklist })).toEqual({ board: priv.board, what: card });
    expect(route('/api/links/:id', { id: link })).toEqual({ board: priv.board, what: card });
    expect(route('/api/comments/:id', { id: comment })).toEqual({ board: priv.board, what: card });
    expect(route('/api/completions/:id/undo', { id: completion.completionId! })).toEqual({ board: priv.board, what: card });
    expect(route('/api/attachments/:id/thumb', { id: 'att-1' })).toEqual({ board: priv.board, what: 'Anhang nicht gefunden' });
    expect(route('/api/trash/:type/:id/restore', { type: 'card', id: sel.card })).toEqual({ board: sel.board, what: 'Nicht im Papierkorb' });
  });

  it('was es nicht gibt, hat kein Board (die Route antwortet selbst); eine Route ohne Kennung gehört keinem Board', () => {
    expect(route('/api/cards/:id', { id: 'gibt-es-nicht' })).toMatchObject({ board: null });
    expect(route('/api/columns/:id', { id: 'gibt-es-nicht' })).toMatchObject({ board: null });
    expect(route('/api/attachments/:id', { id: 'gibt-es-nicht' })).toMatchObject({ board: null, what: 'Anhang nicht gefunden' });
    expect(route('/api/trash/:type/:id', { type: 'unbekannt', id: priv.card })).toMatchObject({ board: null });
    expect(route('/api/trash/:type/:id', { id: priv.card })).toMatchObject({ board: null });
    expect(route('/api/inbox', {})).toBeNull();
    expect(boardOfRoute(store, { routeOptions: {}, params: {} } as never)).toBeNull();
    expect(boardOfRoute(store, { routeOptions: { url: '/api/boards/:id' }, params: {} } as never)).toEqual({ board: '', what: 'Board nicht gefunden', archived: false });
  });

  it('der 404 an der Tür trägt die Meldung des Ziels', async () => {
    const res = await call(ben, 'GET', `/api/boards/${priv.board}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Board nicht gefunden');
    expect((await call(ben, 'GET', `/api/cards/${priv.card}`)).body.error).toBe('Aufgabe nicht gefunden');
    expect((await call(ben, 'PATCH', `/api/columns/${priv.col}`)).body.error).toBe('Spalte nicht gefunden');
  });

  it('Wiederherstellen aus dem Archiv: es zählt nur die Sichtbarkeit; ein archiviertes Board ist sonst für alle verborgen', async () => {
    store.archiveBoard(priv.board, ids.anna);
    expect((await call(ben, 'POST', `/api/boards/${priv.board}/unarchive`)).status).toBe(404);
    expect((await call(chef, 'POST', `/api/boards/${priv.board}/unarchive`)).status).toBe(404);
    // die Besitzerin darf es zurückholen, obwohl das Archiv es sonst verbirgt
    expect((await call(anna, 'POST', `/api/boards/${priv.board}/unarchive`)).status).toBe(200);
    expect((await call(anna, 'GET', `/api/boards/${priv.board}`)).status).toBe(200);
    // alle anderen Routen des Boards zählen das Archiv mit: Die Tür weist ab, bevor die Route antwortet
    store.archiveBoard(sel.board, ids.anna);
    const behind = await call(anna, 'GET', `/api/boards/${sel.board}`);
    expect(behind.status).toBe(404);
    expect(behind.body.error).toBe('Board nicht gefunden');
  });

  it('ohne bekannte Person (kein Nutzer an der Anfrage) gilt „niemand Bestimmtes": nur Boards für alle', async () => {
    store.archiveBoard(pub.board, ids.anna);
    const mini = Fastify();
    mini.setErrorHandler((err: Error, _req, reply) => reply.code(err instanceof AppError ? err.status : 500).send({ error: err.message }));
    await mini.register(ingressAuth, { enforceIp: false });
    registerBoardGuard(mini, store);
    mini.get('/api/boards/:id', async () => ({ ok: true }));
    mini.post('/api/boards/:id/unarchive', async () => ({ ok: true }));
    await mini.ready();
    const ask = async (method: 'GET' | 'POST', url: string) => {
      const res = await mini.inject({ method, url, headers: ben as Record<string, string> });
      return { status: res.statusCode, body: res.json() as { error?: string } };
    };
    expect((await ask('GET', `/api/boards/${sel.board}`)).status).toBe(404);
    expect((await ask('GET', `/api/boards/${priv.board}`)).body.error).toBe('Board nicht gefunden');
    expect((await ask('GET', `/api/boards/${priv.board}`)).status).toBe(404);
    expect((await ask('POST', `/api/boards/${priv.board}/unarchive`)).status).toBe(404);
    // Boards für alle: der Zugriff geht durch (das archivierte nur zum Wiederherstellen)
    store.unarchiveBoard(pub.board);
    expect((await ask('GET', `/api/boards/${pub.board}`)).status).toBe(200);
    store.archiveBoard(pub.board, ids.anna);
    expect((await ask('GET', `/api/boards/${pub.board}`)).status).toBe(404);
    expect((await ask('POST', `/api/boards/${pub.board}/unarchive`)).status).toBe(200);
    await mini.close();
  });
});
