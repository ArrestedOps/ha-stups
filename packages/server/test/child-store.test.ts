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

let store: Store;
let ben: string;
let anna: string;
let mia: string;

beforeEach(() => {
  store = createStore(openDb(':memory:'));
  ben = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  anna = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  mia = store.addPerson({ haUserId: 'ha-mia', name: 'Mia' }).id;
});

describe('Migration 19', () => {
  it('übernimmt eine Datenbank im Stand von 18 unverändert: niemand ist Kind, keine Bestätigung', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-mig19-'));
    const file = join(dir, 'k.sqlite');
    const old = openDb(file, { migrations: migrations.filter((m) => m.version <= 18) });
    old.exec(`insert into users (id, name, display_name, is_person, color, created_at, notify_services) values ('u1','anna','Anna',1,'#fff','2026-01-01T00:00:00Z','["svc"]')`);
    old.exec(`insert into boards (id, name, position, archive_after_days, created_at, updated_at) values ('b1','B','a',7,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);
    old.exec(`insert into columns (id, board_id, name, position, is_done, is_planned) values ('c1','b1','Offen','a',0,0)`);
    old.exec(`insert into cards (id, board_id, column_id, position, title, created_at, updated_at) values ('k1','b1','c1','a','Alt','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);
    old.close();
    const db = openDb(file, { backupDir: join(dir, 'backups') });
    const s = createStore(db);
    expect(s.people()[0]).toMatchObject({ isChild: false, childScope: 'all', confirmDefault: false, confirmers: [] });
    expect(s.getCard('k1')).toMatchObject({ confirm: null, confirmRequestedAt: null });
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBeGreaterThanOrEqual(19);
    expect(() => new DatabaseSync(file).prepare('select child_id from child_confirmers').all()).not.toThrow();
    db.close();
  });
});

describe('Kind einrichten im Store', () => {
  it('Vorgaben: kein Kind, alle Boards, keine Bestätigung, keine Bestätiger', () => {
    expect(store.people().find((p) => p.id === mia)).toMatchObject({ isChild: false, childScope: 'all', confirmDefault: false, confirmers: [] });
  });

  it('setzt Rolle, Sichtbarkeit, Vorgabe der Bestätigung und die Bestätiger', () => {
    const u = store.setChild(mia, { isChild: true, childScope: 'assigned', confirmDefault: true, confirmers: [anna, ben] });
    expect(u).toMatchObject({ isChild: true, childScope: 'assigned', confirmDefault: true });
    expect(u.confirmers.sort()).toEqual([anna, ben].sort());
    // Teilweise ändern: der Rest bleibt
    const v = store.setChild(mia, { childScope: 'all' });
    expect(v).toMatchObject({ isChild: true, childScope: 'all', confirmDefault: true });
    expect(v.confirmers).toHaveLength(2);
    // Bestätiger ersetzen
    expect(store.setChild(mia, { confirmers: [anna] }).confirmers).toEqual([anna]);
    expect(store.setChild(mia, { confirmers: [] }).confirmers).toEqual([]);
    expect(store.setChild(mia, { isChild: false }).isChild).toBe(false);
  });

  it('prüft die Angaben', () => {
    expect(() => store.setChild(mia, { isChild: 'ja' })).toThrow(/wahr oder falsch/);
    expect(() => store.setChild(mia, { childScope: 'alle' })).toThrow(/alle Boards/);
    expect(() => store.setChild(mia, { confirmDefault: 1 })).toThrow(/wahr oder falsch/);
    expect(() => store.setChild(mia, { confirmers: 'anna' })).toThrow(/Liste/);
    expect(() => store.setChild(mia, { confirmers: [mia] })).toThrow(/selbst/); // das Kind bestätigt sich nicht selbst
    expect(() => store.setChild(mia, { confirmers: ['gibt-es-nicht'] })).toThrow(/Person/);
    expect(() => store.setChild('gibt-es-nicht', { isChild: true })).toThrow(/nicht gefunden/);
    expect(store.people().find((p) => p.id === mia)!.isChild).toBe(false); // nichts wurde halb geschrieben
  });

  it('entfernte Personen sind keine Bestätiger mehr', () => {
    store.setChild(mia, { isChild: true, confirmers: [anna, ben] });
    store.removePerson(anna);
    expect(store.people().find((p) => p.id === mia)!.confirmers).toEqual([ben]);
  });
});

describe('Kind einrichten über die Schnittstelle', () => {
  let app: FastifyInstance;
  const as = (id: string, name = id) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name });
  const admin = as('ha-admin', 'Admin');

  beforeEach(async () => {
    store.addPerson({ haUserId: 'ha-admin', name: 'Admin' });
    app = Fastify();
    await app.register(ingressAuth, { enforceIp: false });
    await app.register(apiRoutes, { store, directory: { isAdmin: async (id) => id === 'ha-admin', persons: async () => [] } });
  });
  const patch = (who: object, id: string, payload: object) => app.inject({ method: 'PATCH', url: `/api/access/people/${id}`, headers: who as Record<string, string>, payload });
  const me = async (who: object) => (await app.inject({ url: '/api/me', headers: who as Record<string, string> })).json();

  it('nur Administratoren dürfen, auch für sich selbst', async () => {
    const res = await patch(admin, mia, { isChild: true, childScope: 'assigned', confirmDefault: true, confirmers: [anna] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ isChild: true, childScope: 'assigned', confirmDefault: true, confirmers: [anna] });
    expect((await patch(as('ha-ben', 'Ben'), ben, { isChild: false })).statusCode).toBe(403);
    expect((await patch(as('ha-mia', 'Mia'), mia, { confirmDefault: false })).statusCode).toBe(403); // ein Kind ändert seine Regeln nicht
  });

  it('ein Administrator kann kein Kind sein', async () => {
    const adminId = store.people().find((p) => p.name === 'Admin')!.id;
    const res = await patch(admin, adminId, { isChild: true });
    expect(res.statusCode).toBe(409);
    expect(store.people().find((p) => p.id === adminId)!.isChild).toBe(false);
  });

  it('ungültige Angaben: 400', async () => {
    expect((await patch(admin, mia, { childScope: 'x' })).statusCode).toBe(400);
    expect((await patch(admin, mia, { confirmers: [mia] })).statusCode).toBe(400);
  });

  it('/api/me nennt die Rolle; wer Administrator ist, ist nie Kind, auch wenn es eingetragen ist', async () => {
    await patch(admin, mia, { isChild: true });
    expect((await me(as('ha-mia', 'Mia'))).isChild).toBe(true);
    expect((await me(as('ha-ben', 'Ben'))).isChild).toBe(false);
    const adminId = store.people().find((p) => p.name === 'Admin')!.id;
    store.setChild(adminId, { isChild: true }); // später in Home Assistant zum Administrator geworden
    expect((await me(admin)).isChild).toBe(false);
  });
});
