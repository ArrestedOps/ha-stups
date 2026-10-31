import { beforeEach, describe, expect, it } from 'vitest';
import { createAccess } from '../src/access.js';
import { openDb } from '../src/db.js';
import { createDirectory } from '../src/directory.js';
import { createStore, type Store } from '../src/store.js';

describe('Verzeichnis (Personen und Administratoren aus Home Assistant)', () => {
  const authList = [
    { id: 'u-admin', name: 'anna', is_owner: true, is_active: true, system_generated: false, group_ids: ['system-admin'] },
    { id: 'u-user', name: 'ben', is_owner: false, is_active: true, system_generated: false, group_ids: ['system-users'] },
    { id: 'u-off', name: 'off', is_owner: false, is_active: false, system_generated: false, group_ids: ['system-admin'] },
    { id: 'u-sys', name: 'Supervisor', is_owner: false, is_active: true, system_generated: true, group_ids: ['system-admin'] },
  ];
  const personList = {
    storage: [
      { id: 'p1', name: 'Anna', user_id: 'u-admin' },
      { id: 'p2', name: 'Gast', user_id: null },
    ],
    config: [{ id: 'p3', name: 'Ben', user_id: 'u-user' }],
  };

  function fakeWs(handlers: Record<string, () => unknown>) {
    const calls: string[] = [];
    return {
      calls,
      wsCommand: async (type: string) => {
        calls.push(type);
        const h = handlers[type];
        if (!h) throw new Error('unbekannt');
        return h();
      },
    };
  }

  it('erkennt Administratoren, ignoriert deaktivierte und System-Benutzer', async () => {
    const ws = fakeWs({ 'config/auth/list': () => authList, 'person/list': () => personList });
    const dir = createDirectory({ ha: ws });
    expect(await dir.isAdmin('u-admin')).toBe(true);
    expect(await dir.isAdmin('u-user')).toBe(false);
    expect(await dir.isAdmin('u-off')).toBe(false);
    expect(await dir.isAdmin('u-sys')).toBe(false);
    expect(await dir.isAdmin('unbekannt')).toBe(false);
  });

  it('listet die Personen mit verknüpftem Benutzer', async () => {
    const dir = createDirectory({ ha: fakeWs({ 'config/auth/list': () => authList, 'person/list': () => personList }) });
    expect(await dir.persons()).toEqual([
      { name: 'Anna', userId: 'u-admin' },
      { name: 'Gast', userId: null },
      { name: 'Ben', userId: 'u-user' },
    ]);
  });

  it('fragt nur einmal je Zeitfenster ab', async () => {
    let t = 1_000_000;
    const ws = fakeWs({ 'config/auth/list': () => authList, 'person/list': () => personList });
    const dir = createDirectory({ ha: ws, ttlMs: 60_000, now: () => t });
    await dir.isAdmin('u-admin');
    await dir.isAdmin('u-user');
    expect(ws.calls.filter((c) => c === 'config/auth/list')).toHaveLength(1);
    t += 61_000;
    await dir.isAdmin('u-admin');
    expect(ws.calls.filter((c) => c === 'config/auth/list')).toHaveLength(2);
  });

  it('wartet nicht auf ein langsames Home Assistant, wenn schon ein Stand da ist, und erneuert im Hintergrund', async () => {
    let t = 0;
    let hang = false;
    let release: () => void = () => undefined;
    let admins = ['u-admin'];
    const ws = {
      wsCommand: (type: string): Promise<unknown> => {
        if (type === 'person/list') return Promise.resolve(personList);
        if (hang) return new Promise((resolve) => (release = () => resolve(authListFor(admins))));
        return Promise.resolve(authListFor(admins));
      },
    };
    const authListFor = (ids: string[]) =>
      ids.map((id) => ({ id, is_owner: false, is_active: true, system_generated: false, group_ids: ['system-admin'] }));
    const dir = createDirectory({ ha: ws, ttlMs: 10, now: () => t });

    expect(await dir.isAdmin('u-admin')).toBe(true);
    t += 100;
    hang = true;
    admins = ['u-neu'];
    expect(await dir.isAdmin('u-admin')).toBe(true); // sofort, mit dem alten Stand
    release();
    await new Promise((r) => setTimeout(r, 0));
    t += 100;
    expect(await dir.isAdmin('u-neu')).toBe(true); // der erneuerte Stand ist da
  });

  it('antwortet mit null, wenn Home Assistant nichts liefert, und behält alte Werte bei Fehlern', async () => {
    let fail = false;
    let t = 0;
    const ws = fakeWs({
      'config/auth/list': () => {
        if (fail) throw new Error('weg');
        return authList;
      },
      'person/list': () => personList,
    });
    const dir = createDirectory({ ha: ws, ttlMs: 10, now: () => t });
    expect(await dir.isAdmin('u-admin')).toBe(true);
    fail = true;
    t += 100;
    expect(await dir.isAdmin('u-admin')).toBe(true); // alter Stand

    const broken = createDirectory({ ha: fakeWs({}) });
    expect(await broken.isAdmin('u-admin')).toBeNull();
    expect(await broken.persons()).toBeNull();
  });
});

describe('Zugriffsregeln', () => {
  let store: Store;
  const who = (id: string, name = id) => ({ id, name, displayName: name });
  const dirWith = (admins: string[] | null) => ({
    isAdmin: async (id: string) => (admins === null ? null : admins.includes(id)),
    persons: async () => [],
  });

  beforeEach(() => {
    store = createStore(openDb(':memory:'), { timeZone: () => 'Europe/Berlin' });
  });

  it('„alle": jeder Home-Assistant-Benutzer darf hinein', async () => {
    const access = createAccess({ store, directory: dirWith([]) });
    const r = await access.evaluate(who('ha-x'));
    expect(r).toMatchObject({ allowed: true, isAdmin: false });
    expect(r.user.isPerson).toBe(false);
  });

  it('„nur freigegebene": Personen und Administratoren dürfen, andere nicht', async () => {
    store.setAccessMode('selected');
    store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    const access = createAccess({ store, directory: dirWith(['ha-chef']) });

    expect((await access.evaluate(who('ha-anna'))).allowed).toBe(true);
    expect(await access.evaluate(who('ha-chef'))).toMatchObject({ allowed: true, isAdmin: true });
    const fremd = await access.evaluate(who('ha-fremd'));
    expect(fremd).toMatchObject({ allowed: false, isAdmin: false });
    // Der Aussperrte steht danach bei „Wartet auf Freigabe"
    expect(store.pendingUsers().map((u) => u.haUserId)).toContain('ha-fremd');
  });

  it('nach dem Freigeben darf der Wartende hinein', async () => {
    store.setAccessMode('selected');
    const access = createAccess({ store, directory: dirWith([]) });
    const first = await access.evaluate(who('ha-ben', 'Ben'));
    expect(first.allowed).toBe(false);
    store.addPerson({ haUserId: 'ha-ben', name: 'Ben' });
    expect((await access.evaluate(who('ha-ben', 'Ben'))).allowed).toBe(true);
  });

  it('eine entfernte Person verliert den Zugang in „nur freigegebene"', async () => {
    store.setAccessMode('selected');
    const p = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    const access = createAccess({ store, directory: dirWith([]) });
    store.removePerson(p.id);
    expect((await access.evaluate(who('ha-anna'))).allowed).toBe(false);
  });

  it('ohne Verzeichnis (Home Assistant nicht erreichbar) gelten Personen als Administratoren', async () => {
    const access = createAccess({ store, directory: dirWith(null) });
    store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    expect((await access.evaluate(who('ha-anna'))).isAdmin).toBe(true);
    expect((await access.evaluate(who('ha-gast'))).isAdmin).toBe(false);
  });

  it('ohne Verzeichnis und ohne jede Person darf der Erste einrichten (sonst käme niemand hinein)', async () => {
    store.setAccessMode('selected');
    const access = createAccess({ store, directory: dirWith(null) });
    expect(await access.evaluate(who('ha-erster'))).toMatchObject({ allowed: true, isAdmin: true });
  });
});
