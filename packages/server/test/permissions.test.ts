import { beforeEach, describe, expect, it } from 'vitest';
import { createAccess } from '../src/access.js';
import { openDb } from '../src/db.js';
import { ConflictError, NotFoundError, ValidationError } from '../src/errors.js';
import { cleanPermissions, hasPermission, PERMISSIONS } from '../src/permissions.js';
import { createStore, type Store } from '../src/store.js';

describe('Liste der Berechtigungen', () => {
  it('ist klein und fest: sechs Schlüssel', () => {
    expect([...PERMISSIONS]).toEqual(['watchers', 'house', 'settings', 'people', 'confirm', 'feedback']);
  });

  it('cleanPermissions: bekannte Schlüssel, ohne Doppelte, in fester Reihenfolge', () => {
    expect(cleanPermissions(['people', 'watchers', 'people'])).toEqual(['watchers', 'people']);
    expect(cleanPermissions([])).toEqual([]);
  });

  it('cleanPermissions: unbekannte Schlüssel, falsche Typen und Nicht-Listen werden abgelehnt', () => {
    expect(() => cleanPermissions(['admin'])).toThrow(ValidationError);
    expect(() => cleanPermissions(['watchers', 'panelPath'])).toThrow(ValidationError);
    expect(() => cleanPermissions([1])).toThrow(ValidationError);
    expect(() => cleanPermissions('watchers')).toThrow(ValidationError);
    expect(() => cleanPermissions(null)).toThrow(ValidationError);
    expect(() => cleanPermissions({ watchers: true })).toThrow(ValidationError);
  });

  it('hasPermission: ohne Zugriffsangabe nie', () => {
    expect(hasPermission(null, 'watchers')).toBe(false);
    expect(hasPermission(undefined, 'watchers')).toBe(false);
  });
});

describe('Berechtigungen im Store', () => {
  let store: Store;
  let anna: string;
  let kim: string;
  beforeEach(() => {
    store = createStore(openDb(':memory:'));
    anna = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
    kim = store.addPerson({ haUserId: 'ha-kim', name: 'Kim' }).id;
  });

  it('neue Personen haben keine', () => {
    expect(store.permissionsOf(anna)).toEqual([]);
    expect(store.allPermissions()).toEqual({});
  });

  it('setzt und ersetzt die Liste, in fester Reihenfolge', () => {
    expect(store.setPermissions(anna, ['people', 'watchers'])).toEqual(['watchers', 'people']);
    expect(store.permissionsOf(anna)).toEqual(['watchers', 'people']);
    expect(store.setPermissions(anna, ['house'])).toEqual(['house']);
    expect(store.permissionsOf(anna)).toEqual(['house']);
    expect(store.allPermissions()).toEqual({ [anna]: ['house'] });
    expect(store.setPermissions(anna, [])).toEqual([]);
    expect(store.allPermissions()).toEqual({});
  });

  it('lehnt Unbekanntes ab und ändert dann nichts', () => {
    store.setPermissions(anna, ['watchers']);
    expect(() => store.setPermissions(anna, ['watchers', 'admin'])).toThrow(ValidationError);
    expect(store.permissionsOf(anna)).toEqual(['watchers']);
  });

  it('nur für eingetragene Personen', () => {
    expect(() => store.setPermissions('gibt-es-nicht', ['watchers'])).toThrow(NotFoundError);
    store.removePerson(kim);
    expect(() => store.setPermissions(kim, ['watchers'])).toThrow(NotFoundError);
  });

  it('Kinder bekommen keine; wer Kind wird, verliert sie', () => {
    store.setPermissions(kim, ['watchers', 'confirm']);
    store.setChild(kim, { isChild: true });
    expect(store.permissionsOf(kim)).toEqual([]);
    expect(() => store.setPermissions(kim, ['watchers'])).toThrow(ConflictError);
    expect(store.permissionsOf(kim)).toEqual([]);
    // leeren bleibt erlaubt
    expect(store.setPermissions(kim, [])).toEqual([]);
  });

  it('wer aus der Liste genommen wird, verliert sie auch bei der Rückkehr', () => {
    store.setPermissions(anna, ['people']);
    store.removePerson(anna);
    expect(store.permissionsOf(anna)).toEqual([]);
    const back = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    expect(store.permissionsOf(back.id)).toEqual([]);
  });

  it('meldet die Änderung den anderen Geräten (alles neu laden)', () => {
    store.takeChanges();
    store.setPermissions(anna, ['watchers']);
    expect(store.takeChanges().full).toBe(true);
  });
});

describe('Berechtigungen im Zugriff', () => {
  let store: Store;
  let db: ReturnType<typeof openDb>;
  let admins: string[];
  let roles: 'known' | 'unknown';
  const access = () =>
    createAccess({
      store,
      directory: { isAdmin: async (id: string) => (roles === 'unknown' ? null : admins.includes(id)), persons: async () => [] },
    });
  const who = (id: string) => ({ id, name: id, displayName: id });

  beforeEach(() => {
    db = openDb(':memory:');
    store = createStore(db);
    admins = ['ha-chef'];
    roles = 'known';
    store.addPerson({ haUserId: 'ha-chef', name: 'Chef' });
    store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    store.addPerson({ haUserId: 'ha-kim', name: 'Kim' });
  });

  it('Mitglied: genau die gegebenen Rechte', async () => {
    store.setPermissions(store.userByHaId('ha-anna')!.id, ['watchers', 'people']);
    const r = await access().evaluate(who('ha-anna'));
    expect(r.permissions).toEqual(['watchers', 'people']);
    expect(hasPermission(r, 'watchers')).toBe(true);
    expect(hasPermission(r, 'house')).toBe(false);
  });

  it('Administrator: immer alle, auch ohne Eintrag in der Datenbank', async () => {
    const r = await access().evaluate(who('ha-chef'));
    expect(r.permissions).toEqual([...PERMISSIONS]);
    for (const p of PERMISSIONS) expect(hasPermission(r, p)).toBe(true);
  });

  it('Kind: nie, auch wenn die Datenbank etwas enthielte', async () => {
    const kim = store.userByHaId('ha-kim')!.id;
    store.setPermissions(kim, ['watchers']);
    store.setChild(kim, { isChild: true });
    // Rest in der Datenbank, wie nach einem Umbau von Hand: gilt trotzdem nicht
    db.prepare("insert into user_permissions (user_id, permission) values (?, 'watchers')").run(kim);
    const r = await access().evaluate(who('ha-kim'));
    expect(r.isChild).toBe(true);
    expect(r.permissions).toEqual([]);
    expect(hasPermission(r, 'watchers')).toBe(false);
  });

  it('wer nicht in der Liste steht (nur Konto, „alle dürfen"), hat nichts', async () => {
    const r = await access().evaluate(who('ha-fremd'));
    expect(r.allowed).toBe(true);
    expect(r.user.isPerson).toBe(false);
    expect(r.permissions).toEqual([]);
  });

  it('Rollen unbekannt: niemand wird befördert, die Rechte aus der Datenbank gelten nur für Personen', async () => {
    roles = 'unknown';
    store.setPermissions(store.userByHaId('ha-anna')!.id, ['house']);
    const anna = await access().evaluate(who('ha-anna'));
    expect(anna.isAdmin).toBe(false);
    expect(anna.permissions).toEqual(['house']);
    const chef = await access().evaluate(who('ha-chef'));
    expect(chef.isAdmin).toBe(false);
    expect(chef.permissions).toEqual([]);
    const fremd = await access().evaluate(who('ha-fremd'));
    expect(fremd.permissions).toEqual([]);
  });

  it('wer zum Administrator wird, hat alle (die gespeicherten sind dann ohne Wirkung)', async () => {
    store.setPermissions(store.userByHaId('ha-anna')!.id, ['house']);
    admins.push('ha-anna');
    const r = await access().evaluate(who('ha-anna'));
    expect(r.permissions).toEqual([...PERMISSIONS]);
  });
});
