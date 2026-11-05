import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createFileStore, extensionFor, sniffMime, type FileStore } from '../src/files.js';
import { createStore, type Store } from '../src/store.js';

// Kleinste gültige Dateien: nur die Kennung am Anfang zählt für die Erkennung
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF = Buffer.from('%PDF-1.4\n%fake\n');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00');

describe('sniffMime', () => {
  it('erkennt Bilder und PDFs am Inhalt, nicht am Namen', () => {
    expect(sniffMime(JPEG)).toBe('image/jpeg');
    expect(sniffMime(PNG)).toBe('image/png');
    expect(sniffMime(PDF)).toBe('application/pdf');
    expect(sniffMime(WEBP)).toBe('image/webp');
    expect(sniffMime(GIF)).toBe('image/gif');
  });

  it('lehnt alles andere ab', () => {
    expect(sniffMime(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffMime(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
  });

  it('liefert passende Endungen', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('application/pdf')).toBe('pdf');
  });
});

describe('Dateispeicher', () => {
  let dir: string;
  let files: FileStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kb-files-'));
    files = createFileStore(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('speichert, liest und löscht Dateien', () => {
    files.write('a.jpg', JPEG);
    expect(files.read('a.jpg')).toEqual(JPEG);
    files.remove('a.jpg');
    expect(existsSync(join(dir, 'a.jpg'))).toBe(false);
    expect(() => files.remove('a.jpg')).not.toThrow();
  });

  it('verhindert Pfade außerhalb des Ordners', () => {
    expect(() => files.write('../boese.jpg', JPEG)).toThrow();
    expect(() => files.read('../../etc/passwd')).toThrow();
  });

  it('räumt verwaiste Dateien auf, aber keine referenzierten', () => {
    files.write('behalten.jpg', JPEG);
    files.write('weg.jpg', JPEG);
    writeFileSync(join(dir, 'weg2.pdf'), PDF);
    expect(files.cleanup(new Set(['behalten.jpg']))).toBe(2);
    expect(readdirSync(dir)).toEqual(['behalten.jpg']);
  });
});

describe('Anhänge', () => {
  let dir: string;
  let app: FastifyInstance;
  let store: Store;
  let cardId: string;
  const headers = { 'x-remote-user-id': 'ha-rene', 'x-remote-user-name': 'rene' };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'kb-att-'));
    store = createStore(openDb(':memory:'), { now: () => new Date('2026-10-30T10:00:00Z') });
    store.syncPeople([{ name: 'Rene' }]);
    const rene = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'René' });
    const b = store.createBoard({ name: 'Haushalt' });
    cardId = store.createCard(b.id, { columnId: store.getBoardView(b.id).columns[0]!.id, title: 'Fenster' }, rene.id).id;
    app = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, { store, files: createFileStore(dir) });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function upload(parts: { name: string; filename: string; type: string; data: Buffer }[]) {
    const form = new FormData();
    for (const p of parts) form.append(p.name, new Blob([new Uint8Array(p.data)], { type: p.type }), p.filename);
    const res = new Response(form);
    const payload = Buffer.from(await res.arrayBuffer());
    return app.inject({
      method: 'POST',
      url: `/api/cards/${cardId}/attachments`,
      headers: { ...headers, 'content-type': res.headers.get('content-type')! },
      payload,
    });
  }

  it('lädt ein Foto mit Vorschaubild hoch und liefert beides wieder aus', async () => {
    const res = await upload([
      { name: 'file', filename: 'Heizung.jpg', type: 'image/jpeg', data: JPEG },
      { name: 'thumb', filename: 'thumb.jpg', type: 'image/jpeg', data: JPEG },
    ]);
    expect(res.statusCode).toBe(201);
    const att = res.json();
    expect(att).toMatchObject({ filename: 'Heizung.jpg', mime: 'image/jpeg', hasThumb: true, size: JPEG.length });
    expect(att.file).toBeUndefined(); // interne Dateinamen bleiben intern

    const file = await app.inject({ url: `/api/attachments/${att.id}`, headers });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.rawPayload).toEqual(JPEG);
    const thumb = await app.inject({ url: `/api/attachments/${att.id}/thumb`, headers });
    expect(thumb.statusCode).toBe(200);
  });

  it('nimmt PDFs ohne Vorschaubild an und zeigt sie in der Kartenansicht', async () => {
    const res = await upload([{ name: 'file', filename: 'Angebot.pdf', type: 'application/pdf', data: PDF }]);
    expect(res.statusCode).toBe(201);
    expect(res.json().hasThumb).toBe(false);
    const card = store.getCard(cardId);
    expect(card.attachments.map((a) => a.filename)).toEqual(['Angebot.pdf']);
    expect(store.getBoardView(store.getCard(cardId).boardId).cards[0]?.attachmentCount).toBe(1);
    const thumb = await app.inject({ url: `/api/attachments/${res.json().id}/thumb`, headers });
    expect(thumb.statusCode).toBe(404);
  });

  it('erkennt den Typ am Inhalt: ein als Bild getarntes HTML wird abgelehnt', async () => {
    const res = await upload([
      { name: 'file', filename: 'bild.jpg', type: 'image/jpeg', data: Buffer.from('<script>alert(1)</script>') },
    ]);
    expect(res.statusCode).toBe(400);
    expect(store.getCard(cardId).attachments).toHaveLength(0);
  });

  describe('Obergrenzen (Speicher und Platte schützen)', () => {
    const pdf = (n: number) => Buffer.concat([PDF, Buffer.alloc(n)]);
    const send = (data: Buffer) => upload([{ name: 'file', filename: 'x.pdf', type: 'application/pdf', data }]);
    async function withLimits(limits: object) {
      app = Fastify();
      await app.register(ingressAuth, { enforceIp: false });
      await app.register(apiRoutes, { store, files: createFileStore(dir), uploadLimits: limits, now: () => new Date('2026-10-30T10:00:00Z') });
    }

    it('je Karte höchstens so viele Anhänge (413 mit klarem Text)', async () => {
      await withLimits({ cardFiles: 3 });
      for (let i = 0; i < 3; i += 1) expect((await send(pdf(10))).statusCode).toBe(201);
      const res = await send(pdf(10));
      expect(res.statusCode).toBe(413);
      expect(res.json().error).toMatch(/3 Anhänge/);
      expect(store.getCard(cardId).attachments).toHaveLength(3);
    });

    it('je Karte höchstens so viele Bytes insgesamt (413)', async () => {
      await withLimits({ cardBytes: 1000 });
      expect((await send(pdf(600))).statusCode).toBe(201);
      const res = await send(pdf(600));
      expect(res.statusCode).toBe(413);
      expect(store.getCard(cardId).attachments).toHaveLength(1);
    });

    it('je Person und Stunde höchstens so viele Dateien (429), nach einer Stunde wieder frei', async () => {
      let t = new Date('2026-10-30T10:00:00Z').getTime();
      app = Fastify();
      await app.register(ingressAuth, { enforceIp: false });
      await app.register(apiRoutes, { store, files: createFileStore(dir), uploadLimits: { hourFiles: 2 }, now: () => new Date(t) });
      const b = store.createBoard({ name: 'Zwei' });
      const col = store.getBoardView(b.id).columns[0]!.id;
      const others = [store.createCard(b.id, { columnId: col, title: 'A' }, null).id, store.createCard(b.id, { columnId: col, title: 'B' }, null).id, store.createCard(b.id, { columnId: col, title: 'C' }, null).id];
      const to = async (id: string) => {
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(pdf(10))], { type: 'application/pdf' }), 'x.pdf');
        const res = new Response(form);
        return app.inject({ method: 'POST', url: `/api/cards/${id}/attachments`, headers: { ...headers, 'content-type': res.headers.get('content-type')! }, payload: Buffer.from(await res.arrayBuffer()) });
      };
      expect((await to(others[0]!)).statusCode).toBe(201);
      expect((await to(others[1]!)).statusCode).toBe(201);
      const limited = await to(others[2]!);
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error).toMatch(/Stunde/);
      t += 61 * 60_000;
      expect((await to(others[2]!)).statusCode).toBe(201);
    });

    it('die Typ-Prüfung bleibt: ein abgelehnter Upload zählt nicht gegen die Stunde', async () => {
      await withLimits({ hourFiles: 1 });
      const bad = await upload([{ name: 'file', filename: 'x.jpg', type: 'image/jpeg', data: Buffer.from('<html>') }]);
      expect(bad.statusCode).toBe(400);
      expect((await send(pdf(10))).statusCode).toBe(201);
    });
  });

  it('lehnt zu große Dateien ab (20 MB)', async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(21 * 1024 * 1024)]);
    const res = await upload([{ name: 'file', filename: 'riesig.pdf', type: 'application/pdf', data: big }]);
    expect(res.statusCode).toBe(413);
    expect(store.getCard(cardId).attachments).toHaveLength(0);
  });

  it('verlangt eine Datei und eine existierende Karte', async () => {
    const none = await upload([{ name: 'thumb', filename: 't.jpg', type: 'image/jpeg', data: JPEG }]);
    expect(none.statusCode).toBe(400);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(PDF)], { type: 'application/pdf' }), 'a.pdf');
    const res = new Response(form);
    const missing = await app.inject({
      method: 'POST',
      url: '/api/cards/gibt-es-nicht/attachments',
      headers: { ...headers, 'content-type': res.headers.get('content-type')! },
      payload: Buffer.from(await res.arrayBuffer()),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('löscht den Anhang samt Dateien', async () => {
    const res = await upload([
      { name: 'file', filename: 'a.jpg', type: 'image/jpeg', data: JPEG },
      { name: 'thumb', filename: 't.jpg', type: 'image/jpeg', data: JPEG },
    ]);
    expect(readdirSync(dir)).toHaveLength(2);
    const del = await app.inject({ method: 'DELETE', url: `/api/attachments/${res.json().id}`, headers });
    expect(del.statusCode).toBe(204);
    expect(readdirSync(dir)).toHaveLength(0);
    expect(store.getCard(cardId).attachments).toHaveLength(0);
    expect((await app.inject({ url: `/api/attachments/${res.json().id}`, headers })).statusCode).toBe(404);
  });

  it('der Dateiname aus dem Upload wird bereinigt', async () => {
    const res = await upload([{ name: 'file', filename: '../../evil\n.pdf', type: 'application/pdf', data: PDF }]);
    expect(res.statusCode).toBe(201);
    expect(res.json().filename).toBe('evil .pdf');
    expect(readdirSync(dir).every((f) => /^[0-9a-f-]+\.pdf$/.test(f))).toBe(true);
    expect(readFileSync(join(dir, readdirSync(dir)[0]!))).toEqual(PDF);
  });
});
