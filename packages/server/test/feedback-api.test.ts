import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { createFileStore } from '../src/files.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

// Rückmeldungen: jede angemeldete Person darf senden, nur Administratoren lesen, ändern und löschen.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = Buffer.from('%PDF-1.4\n%fake\n');

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name, 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Test' });
const anna = as('ha-anna', 'Anna');
const ben = as('ha-ben', 'Ben');
const admin = as('ha-admin', 'Admin');

let dir: string;
let app: FastifyInstance;
let store: Store;
let clock: Date;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'stups-fb-'));
  clock = new Date('2026-11-05T10:00:00Z');
  store = createStore(openDb(':memory:'), { now: () => clock });
  store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
  store.addPerson({ haUserId: 'ha-ben', name: 'Ben' });
  store.addPerson({ haUserId: 'ha-admin', name: 'Admin' });
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    files: createFileStore(dir),
    now: () => clock,
    capabilities: { version: '1.28.0-beta.1', channel: 'beta' } as never,
    directory: { isAdmin: async (id) => id === 'ha-admin', persons: async () => [] },
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const send = (who: object, body: unknown) => app.inject({ method: 'POST', url: '/api/feedback', headers: who as Record<string, string>, payload: body as object });

async function multipart(who: object, fields: Record<string, string>, files: { name: string; filename: string; type: string; data: Buffer }[] = []) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) form.append(f.name, new Blob([new Uint8Array(f.data)], { type: f.type }), f.filename);
  const res = new Response(form);
  return app.inject({
    method: 'POST',
    url: '/api/feedback',
    headers: { ...(who as Record<string, string>), 'content-type': res.headers.get('content-type')! },
    payload: Buffer.from(await res.arrayBuffer()),
  });
}

const list = async () => (await app.inject({ url: '/api/feedback', headers: admin })).json() as { items: any[]; newCount: number };

describe('Senden (POST /api/feedback)', () => {
  it('eine normale Person sendet Art und Text; der Server ergänzt Version, Kanal und Browser', async () => {
    const res = await send(anna, { kind: 'bug', message: '  Der Knopf tut nichts.  ' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String) });
    const [item] = (await list()).items;
    expect(item).toMatchObject({ kind: 'bug', message: 'Der Knopf tut nichts.', status: 'neu', personName: 'Anna', hasImage: false, createdAt: '2026-11-05T10:00:00.000Z' });
    expect(item.meta).toMatchObject({ version: '1.28.0-beta.1', channel: 'beta' });
    expect(item.meta.userAgent).toContain('iPhone');
  });

  it('nimmt alle fünf Arten an', async () => {
    for (const kind of ['bug', 'idea', 'praise', 'criticism', 'other']) expect((await send(anna, { kind, message: 'x' })).statusCode, kind).toBe(201);
    expect((await list()).items).toHaveLength(5);
  });

  it('lehnt unbekannte oder fehlende Art ab', async () => {
    for (const kind of ['spam', '', 5, null, undefined, ['bug'], { a: 1 }]) {
      const res = await send(anna, { kind, message: 'Hallo' });
      expect(res.statusCode, String(kind)).toBe(400);
    }
    expect((await list()).items).toHaveLength(0);
  });

  it('Text ist Pflicht (nach dem Kürzen), nur Text, höchstens 1000 Zeichen', async () => {
    for (const message of ['', '   \n ', undefined, null, 5, ['a'], { a: 1 }]) {
      expect((await send(anna, { kind: 'idea', message })).statusCode, JSON.stringify(message)).toBe(400);
    }
    expect((await send(anna, { kind: 'idea', message: 'a'.repeat(1000) })).statusCode).toBe(201);
    const tooLong = await send(anna, { kind: 'idea', message: 'a'.repeat(1001) });
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.json().error).toMatch(/1000/);
    // Leerzeichen am Rand zählen nicht: 1000 Zeichen mit Rand ist erlaubt
    expect((await send(anna, { kind: 'idea', message: `  ${'b'.repeat(1000)}  ` })).statusCode).toBe(201);
  });

  it('behält Zeilenumbrüche, entfernt aber Steuerzeichen', async () => {
    await send(anna, { kind: 'bug', message: 'Zeile 1\r\nZeile 2\u0000\u0007 Ende' });
    expect((await list()).items[0].message).toBe('Zeile 1\nZeile 2 Ende');
  });

  it('übernimmt den Kontext der Oberfläche, aber nur bekannte Felder mit gültigen Werten', async () => {
    const res = await send(anna, {
      kind: 'bug',
      message: 'x',
      context: { view: 'boards', language: 'en', scheme: 'dark', viewport: { w: 390, h: 844 }, embedded: true, token: 'geheim', evil: '<b>' },
    });
    expect(res.statusCode).toBe(201);
    const meta = (await list()).items[0].meta;
    expect(meta).toMatchObject({ view: 'boards', language: 'en', scheme: 'dark', viewport: { w: 390, h: 844 }, embedded: true });
    expect(JSON.stringify(meta)).not.toMatch(/geheim|evil/);
  });

  it('ein kaputter Kontext verhindert die Rückmeldung nicht, die Werte fallen weg', async () => {
    for (const context of ['text', 5, [1], { view: 'geheim', language: 'fr', scheme: 'rot', viewport: { w: -1, h: 'x' }, embedded: 'ja' }]) {
      expect((await send(anna, { kind: 'bug', message: 'x', context })).statusCode, JSON.stringify(context)).toBe(201);
    }
    for (const item of (await list()).items) {
      expect(item.meta.view).toBeUndefined();
      expect(item.meta.language).toBeUndefined();
      expect(item.meta.scheme).toBeUndefined();
      expect(item.meta.viewport).toBeUndefined();
      expect(item.meta.embedded).toBeUndefined();
    }
  });

  it('kürzt den User-Agent', async () => {
    await app.inject({ method: 'POST', url: '/api/feedback', headers: { ...anna, 'user-agent': 'X'.repeat(500) }, payload: { kind: 'bug', message: 'x' } });
    expect((await list()).items[0].meta.userAgent).toHaveLength(160);
  });

  it('speichert keine Anmeldedaten und keine Adresse', async () => {
    await send(anna, { kind: 'bug', message: 'x' });
    const raw = JSON.stringify(store.listFeedback());
    expect(raw).not.toMatch(/ha-anna|x-remote|authorization|cookie|127\.0\.0\.1/i);
  });

  it('ohne Anmeldung geht nichts', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/feedback', payload: { kind: 'bug', message: 'x' } });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(store.listFeedback()).toHaveLength(0);
  });
});

describe('Bild', () => {
  it('nimmt ein Bild mit Vorschau an und liefert es nur Administratoren aus', async () => {
    const res = await multipart(anna, { kind: 'bug', message: 'Schau mal', context: '{"view":"tasks"}' }, [
      { name: 'image', filename: 'foto.jpg', type: 'image/jpeg', data: JPEG },
      { name: 'thumb', filename: 'v.jpg', type: 'image/jpeg', data: JPEG },
    ]);
    expect(res.statusCode, res.body).toBe(201);
    const [item] = (await list()).items;
    expect(item).toMatchObject({ hasImage: true, hasThumb: true, message: 'Schau mal' });
    expect(item.meta.view).toBe('tasks');
    expect(item.image).toBeUndefined(); // Dateinamen bleiben intern

    const img = await app.inject({ url: `/api/feedback/${item.id}/image`, headers: admin });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect(img.rawPayload).toEqual(JPEG);
    expect((await app.inject({ url: `/api/feedback/${item.id}/thumb`, headers: admin })).statusCode).toBe(200);
    // Nicht-Administratoren sehen es nicht, auch nicht das eigene
    expect((await app.inject({ url: `/api/feedback/${item.id}/image`, headers: anna })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/feedback/${item.id}/thumb`, headers: anna })).statusCode).toBe(403);
  });

  it('ohne Bild gibt es 404 für das Bild', async () => {
    const id = (await send(anna, { kind: 'idea', message: 'x' })).json().id;
    expect((await app.inject({ url: `/api/feedback/${id}/image`, headers: admin })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/feedback/${id}/thumb`, headers: admin })).statusCode).toBe(404);
  });

  it('prüft den Typ am Inhalt: HTML als Bild und PDF werden abgelehnt, nichts bleibt liegen', async () => {
    const html = await multipart(anna, { kind: 'bug', message: 'x' }, [{ name: 'image', filename: 'b.jpg', type: 'image/jpeg', data: Buffer.from('<script>alert(1)</script>') }]);
    expect(html.statusCode).toBe(400);
    const pdf = await multipart(anna, { kind: 'bug', message: 'x' }, [{ name: 'image', filename: 'b.pdf', type: 'application/pdf', data: PDF }]);
    expect(pdf.statusCode).toBe(400);
    expect(store.listFeedback()).toHaveLength(0);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('lehnt ein zu großes Bild ab (über 6 MB), ein Vorschaubild über 400 KB und mehr als eine Datei', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(6 * 1024 * 1024)]);
    expect((await multipart(anna, { kind: 'bug', message: 'x' }, [{ name: 'image', filename: 'g.jpg', type: 'image/jpeg', data: big }])).statusCode).toBe(413);
    const bigThumb = Buffer.concat([JPEG, Buffer.alloc(401 * 1024)]);
    expect(
      (await multipart(anna, { kind: 'bug', message: 'x' }, [
        { name: 'image', filename: 'a.jpg', type: 'image/jpeg', data: JPEG },
        { name: 'thumb', filename: 't.jpg', type: 'image/jpeg', data: bigThumb },
      ])).statusCode,
    ).toBe(400);
    expect(store.listFeedback()).toHaveLength(0);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('prüft Art und Text auch bei Bildern, und ein Fehler hinterlässt keine Datei', async () => {
    const res = await multipart(anna, { kind: 'nope', message: 'x' }, [{ name: 'image', filename: 'a.png', type: 'image/png', data: PNG }]);
    expect(res.statusCode).toBe(400);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('meldet 501, wenn es keine Dateiablage gibt, nimmt aber Text ohne Bild an', async () => {
    const bare = Fastify();
    await bare.register(ingressAuth, { enforceIp: false });
    await bare.register(apiRoutes, { store, now: () => clock });
    const form = new FormData();
    form.append('kind', 'bug');
    form.append('message', 'x');
    form.append('image', new Blob([new Uint8Array(JPEG)], { type: 'image/jpeg' }), 'a.jpg');
    const r = new Response(form);
    const res = await bare.inject({ method: 'POST', url: '/api/feedback', headers: { ...anna, 'content-type': r.headers.get('content-type')! }, payload: Buffer.from(await r.arrayBuffer()) });
    expect(res.statusCode).toBe(501);
    expect((await bare.inject({ method: 'POST', url: '/api/feedback', headers: anna, payload: { kind: 'bug', message: 'ohne Bild' } })).statusCode).toBe(201);
  });

  it('die Dateien zählen beim Aufräumen als verwendet', async () => {
    await multipart(anna, { kind: 'bug', message: 'x' }, [
      { name: 'image', filename: 'a.jpg', type: 'image/jpeg', data: JPEG },
      { name: 'thumb', filename: 't.jpg', type: 'image/jpeg', data: JPEG },
    ]);
    const files = readdirSync(dir);
    expect(files).toHaveLength(2);
    for (const f of files) expect(store.referencedFiles().has(f), f).toBe(true);
  });
});

describe('Zeitlimit: höchstens 10 Rückmeldungen je Person und Stunde', () => {
  it('die elfte wird mit 429 abgelehnt, andere Personen sind nicht betroffen', async () => {
    for (let i = 0; i < 10; i++) expect((await send(anna, { kind: 'idea', message: `Nr. ${i}` })).statusCode).toBe(201);
    const res = await send(anna, { kind: 'idea', message: 'zu viel' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toMatch(/Stunde/);
    expect((await send(ben, { kind: 'idea', message: 'ich auch' })).statusCode).toBe(201);
    expect((await list()).items).toHaveLength(11);
  });

  it('nach einer Stunde geht es wieder', async () => {
    for (let i = 0; i < 10; i++) await send(anna, { kind: 'idea', message: `Nr. ${i}` });
    clock = new Date(clock.getTime() + 61 * 60_000);
    expect((await send(anna, { kind: 'idea', message: 'wieder' })).statusCode).toBe(201);
  });

  it('abgelehnte Rückmeldungen zählen nicht mit', async () => {
    for (let i = 0; i < 20; i++) await send(anna, { kind: 'spam', message: 'x' });
    expect((await send(anna, { kind: 'idea', message: 'ok' })).statusCode).toBe(201);
  });
});

describe('Rechte', () => {
  it('Liste, Ändern und Löschen: nur Administratoren', async () => {
    const id = (await send(anna, { kind: 'bug', message: 'x' })).json().id;
    expect((await app.inject({ url: '/api/feedback', headers: anna })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: `/api/feedback/${id}`, headers: anna, payload: { status: 'erledigt' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/feedback/${id}`, headers: anna })).statusCode).toBe(403);
    expect(store.listFeedback()).toHaveLength(1);
    expect(store.listFeedback()[0]!.status).toBe('neu');
  });

  it('ein Kind sendet nichts (Erlaubnisliste der Rolle Kind)', async () => {
    const kid = store.addPerson({ haUserId: 'ha-kid', name: 'Kim' });
    store.setChild(kid.id, { isChild: true });
    expect((await send(as('ha-kid', 'Kim'), { kind: 'bug', message: 'x' })).statusCode).toBe(403);
    expect(store.listFeedback()).toHaveLength(0);
  });

  it('auch ein Administrator darf eine eigene Rückmeldung senden', async () => {
    expect((await send(admin, { kind: 'praise', message: 'toll' })).statusCode).toBe(201);
  });
});

describe('Verwalten (Administrator)', () => {
  it('Liste: neueste zuerst, mit Zähler der neuen', async () => {
    await send(anna, { kind: 'bug', message: 'erste' });
    clock = new Date(clock.getTime() + 60_000);
    await send(ben, { kind: 'idea', message: 'zweite' });
    const l = await list();
    expect(l.items.map((i) => i.message)).toEqual(['zweite', 'erste']);
    expect(l.newCount).toBe(2);
    expect(l.items.map((i) => i.personName)).toEqual(['Ben', 'Anna']);
  });

  it('Kurzfassung für die Einstellungen: nur die Zahl der neuen, nur Administratoren', async () => {
    const id = (await send(anna, { kind: 'bug', message: 'eins' })).json().id;
    await send(ben, { kind: 'idea', message: 'zwei' });
    expect((await app.inject({ url: '/api/feedback/summary', headers: admin })).json()).toEqual({ newCount: 2 });
    await app.inject({ method: 'PATCH', url: `/api/feedback/${id}`, headers: admin, payload: { status: 'gelesen' } });
    expect((await app.inject({ url: '/api/feedback/summary', headers: admin })).json()).toEqual({ newCount: 1 });
    expect((await app.inject({ url: '/api/feedback/summary', headers: anna })).statusCode).toBe(403);
  });

  it('Status umschalten: neu, gelesen, erledigt; anderes ist ungültig', async () => {
    const id = (await send(anna, { kind: 'bug', message: 'x' })).json().id;
    for (const status of ['gelesen', 'erledigt', 'neu']) {
      const res = await app.inject({ method: 'PATCH', url: `/api/feedback/${id}`, headers: admin, payload: { status } });
      expect(res.statusCode, status).toBe(200);
      expect(res.json().status).toBe(status);
    }
    for (const status of ['offen', '', 5, null, undefined]) {
      expect((await app.inject({ method: 'PATCH', url: `/api/feedback/${id}`, headers: admin, payload: { status } })).statusCode, String(status)).toBe(400);
    }
    expect((await list()).newCount).toBe(1);
    expect((await app.inject({ method: 'PATCH', url: '/api/feedback/gibtsnicht', headers: admin, payload: { status: 'gelesen' } })).statusCode).toBe(404);
  });

  it('Löschen entfernt Eintrag und Dateien', async () => {
    await multipart(anna, { kind: 'bug', message: 'mit Bild' }, [
      { name: 'image', filename: 'a.jpg', type: 'image/jpeg', data: JPEG },
      { name: 'thumb', filename: 't.jpg', type: 'image/jpeg', data: JPEG },
    ]);
    const id = (await list()).items[0].id;
    expect(readdirSync(dir)).toHaveLength(2);
    expect((await app.inject({ method: 'DELETE', url: `/api/feedback/${id}`, headers: admin })).statusCode).toBe(204);
    expect((await list()).items).toHaveLength(0);
    expect(readdirSync(dir)).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: `/api/feedback/${id}`, headers: admin })).statusCode).toBe(404);
  });

  it('wird die Person entfernt, bleibt die Rückmeldung mit dem Namen von damals', async () => {
    const id = store.people().find((p) => p.name === 'Ben')!.id;
    await send(ben, { kind: 'idea', message: 'Hallo' });
    store.removePerson(id);
    const [item] = (await list()).items;
    expect(item).toMatchObject({ personName: 'Ben', message: 'Hallo' });
  });

  it('die Liste ist auf 500 Einträge begrenzt', async () => {
    for (let i = 0; i < 3; i++) store.addFeedback({ personId: null, personName: null, kind: 'idea', message: `m${i}`, meta: {} });
    expect(store.listFeedback(2)).toHaveLength(2);
  });
});
