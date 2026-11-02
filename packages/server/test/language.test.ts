import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { migrations } from '../src/migrations.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
const anna = as('ha-anna', 'Anna');
const fremd = as('ha-fremd', 'Fremd');

describe('Migration 14', () => {
  it('übernimmt eine Datenbank im Stand von Migration 13 unverändert und legt beide Spalten leer an', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-mig14-'));
    const file = join(dir, 'k.sqlite');
    const old = openDb(file, { migrations: migrations.filter((m) => m.version <= 13) });
    old.exec(`insert into users (id, name, display_name, is_person, color, created_at, notify_services) values ('u1','anna','Anna',1,'#fff','2026-01-01T00:00:00Z','["svc"]')`);
    old.close();

    const db = openDb(file, { backupDir: join(dir, 'backups') });
    const s = createStore(db);
    expect(s.people().map((p) => [p.name, p.notifyServices, p.languageChoice])).toEqual([['anna', ['svc'], 'auto']]);
    expect(s.languageOf('u1')).toBeNull();
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(15);
    expect(() => new DatabaseSync(file).prepare('select language, language_choice, accent_hue from users').all()).not.toThrow();
    expect(s.people()[0]!.accentHue).toBeNull();
    db.close();
  });
});

describe('Sprache je Person im Store', () => {
  let store: Store;
  let id: string;
  beforeEach(() => {
    store = createStore(openDb(':memory:'));
    id = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  });

  it('speichert die zuletzt gemeldete Sprache und die Wahl', () => {
    store.setLanguage(id, { choice: 'en', effective: 'en' });
    expect(store.languageOf(id)).toBe('en');
    expect(store.people()[0]!.languageChoice).toBe('en');
  });

  it('Automatisch löscht die Wahl, die gemeldete Sprache bleibt', () => {
    store.setLanguage(id, { choice: 'de', effective: 'de' });
    store.setLanguage(id, { choice: 'auto', effective: 'en' });
    expect(store.people()[0]!.languageChoice).toBe('auto');
    expect(store.languageOf(id)).toBe('en');
  });

  it('eine unbekannte Person: nichts bekannt', () => {
    expect(store.languageOf('gibt-es-nicht')).toBeNull();
  });
});

describe('PUT /api/me/language', () => {
  let app: FastifyInstance;
  let store: Store;

  beforeEach(async () => {
    store = createStore(openDb(':memory:'));
    store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    app = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, { store, directory: { isAdmin: async () => false, persons: async () => [] } });
  });

  const put = (who: object, payload: object) => app.inject({ method: 'PUT', url: '/api/me/language', headers: who as Record<string, string>, payload });
  const me = async (who: object) => (await app.inject({ url: '/api/me', headers: who as Record<string, string> })).json();

  it('speichert Wahl und Sprache, /api/me zeigt die Wahl', async () => {
    expect((await put(anna, { choice: 'en', effective: 'en' })).statusCode).toBe(204);
    expect((await me(anna)).user).toMatchObject({ languageChoice: 'en', language: 'en' });
    expect(store.languageOf(store.people()[0]!.id)).toBe('en');
    expect((await put(anna, { choice: 'auto', effective: 'de' })).statusCode).toBe(204);
    expect((await me(anna)).user.languageChoice).toBe('auto');
  });

  it('ungültige Werte: 400', async () => {
    expect((await put(anna, { choice: 'fr', effective: 'en' })).statusCode).toBe(400);
    expect((await put(anna, { choice: 'en', effective: 'auto' })).statusCode).toBe(400);
    expect((await put(anna, { choice: 'en' })).statusCode).toBe(400);
    expect((await put(anna, {})).statusCode).toBe(400);
  });

  it('ohne Zugriff (nur freigegebene): 403', async () => {
    store.setAccessMode('selected');
    expect((await put(fremd, { choice: 'en', effective: 'en' })).statusCode).toBe(403);
  });
});
