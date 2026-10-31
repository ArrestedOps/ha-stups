import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { NotFoundError, ValidationError } from '../src/errors.js';
import { createStore, type Store } from '../src/store.js';

let store: Store;

beforeEach(() => {
  store = createStore(openDb(':memory:'), { timeZone: () => 'Europe/Berlin' });
});

describe('Personen verwalten', () => {
  it('fügt eine Person mit Home-Assistant-Benutzer hinzu und vergibt eine Farbe', () => {
    const p = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    expect(p).toMatchObject({ haUserId: 'ha-anna', name: 'Anna', displayName: 'Anna', isPerson: true, notifyServices: [] });
    expect(p.color).toBeTruthy();
    expect(store.people().map((x) => x.id)).toEqual([p.id]);
  });

  it('ist idempotent: dieselbe Person nicht doppelt', () => {
    const a = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    const b = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    expect(b.id).toBe(a.id);
    expect(store.people()).toHaveLength(1);
  });

  it('macht einen Benutzer, der die App schon geöffnet hat, zur Person', () => {
    const u = store.resolveUser({ haId: 'ha-ben', name: 'ben', displayName: 'Ben' });
    expect(u.isPerson).toBe(false);
    expect(store.pendingUsers().map((x) => x.id)).toEqual([u.id]);
    const p = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' });
    expect(p.id).toBe(u.id);
    expect(p.isPerson).toBe(true);
    expect(store.pendingUsers()).toEqual([]);
  });

  it('eine Person ohne Benutzer wird beim ersten Öffnen verknüpft', () => {
    const p = store.addPerson({ name: 'Cora' });
    const u = store.resolveUser({ haId: 'ha-cora', name: 'cora', displayName: 'Cora' });
    expect(u.id).toBe(p.id);
    expect(store.userById(p.id)?.haUserId).toBe('ha-cora');
  });

  it('prüft den Namen', () => {
    expect(() => store.addPerson({ name: '   ' })).toThrow(ValidationError);
    expect(() => store.addPerson({ name: 'x'.repeat(61) })).toThrow(ValidationError);
  });

  it('entfernt eine Person nur aus der Liste, ihre Zuweisungen bleiben erhalten', () => {
    const p = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    const b = store.createBoard({ name: 'B' });
    const col = store.getBoardView(b.id).columns[0]!;
    const card = store.createCard(b.id, { columnId: col.id, title: 'x', assigneeIds: [p.id] }, null);
    store.removePerson(p.id);
    expect(store.people()).toEqual([]);
    expect(store.getCard(card.id).assigneeIds).toEqual([p.id]);
    // Wieder hinzugefügt ist alles wie vorher
    store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    expect(store.people().map((x) => x.id)).toEqual([p.id]);
  });

  it('entfernte Personen lösen keine Erinnerungen und Sensoren mehr aus', () => {
    const p = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    const b = store.createBoard({ name: 'B' });
    const col = store.getBoardView(b.id).columns[0]!;
    store.createCard(b.id, { columnId: col.id, title: 'x', dueAt: '2030-01-01T10:00:00Z', assigneeIds: [p.id] }, null);
    expect(store.openDueCards()[0]?.assigneeIds).toEqual([p.id]);
    store.removePerson(p.id);
    expect(store.openDueCards()[0]?.assigneeIds).toEqual([]);
  });

  it('removePerson und renamePerson melden unbekannte Kennungen', () => {
    expect(() => store.removePerson('gibt-es-nicht')).toThrow(NotFoundError);
    expect(() => store.renamePerson('gibt-es-nicht', 'X')).toThrow(NotFoundError);
  });

  it('benennt die Anzeige um, der technische Name (Sensoren) bleibt', () => {
    const p = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    const r = store.renamePerson(p.id, '  Mama ');
    expect(r).toMatchObject({ displayName: 'Mama', name: 'Anna' });
    expect(() => store.renamePerson(p.id, '')).toThrow(ValidationError);
  });
});

describe('Push-Geräte einer Person', () => {
  it('speichert Dienste ohne notify.-Vorsatz, ohne Doppelte und ohne Leere', () => {
    const p = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    const r = store.setNotifyServices(p.id, ['notify.mobile_app_a', 'mobile_app_a', ' mobile_app_b ', '']);
    expect(r.notifyServices).toEqual(['mobile_app_a', 'mobile_app_b']);
    expect(store.userById(p.id)?.notifyServices).toEqual(['mobile_app_a', 'mobile_app_b']);
  });

  it('lehnt Unsinn ab', () => {
    const p = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
    expect(() => store.setNotifyServices(p.id, 'mobile_app_a')).toThrow(ValidationError);
    expect(() => store.setNotifyServices(p.id, [42])).toThrow(ValidationError);
    expect(() => store.setNotifyServices(p.id, ['a/b'])).toThrow(ValidationError);
    expect(() => store.setNotifyServices('gibt-es-nicht', [])).toThrow(NotFoundError);
  });
});

describe('Zugriffsmodus', () => {
  it('ist ohne Eintrag „alle" und lässt nur bekannte Werte zu', () => {
    expect(store.getAccessMode()).toBe('everyone');
    store.setAccessMode('selected');
    expect(store.getAccessMode()).toBe('selected');
    expect(() => store.setAccessMode('irgendwas')).toThrow(ValidationError);
  });
});

describe('Übernahme der bisherigen Add-on-Optionen', () => {
  const legacy = [
    { name: 'Rene', notify: ['mobile_app_r1', 'mobile_app_r2'] },
    { name: 'Conny', notify: ['mobile_app_c'] },
  ];

  it('übernimmt Personen mit Diensten einmalig und lässt bestehende Installationen bei „alle"', () => {
    store.syncPeople([{ name: 'Rene' }, { name: 'Conny' }]); // wie bei Version 0.10.x
    expect(store.importLegacyPeople(legacy)).toBe(true);
    expect(store.people().map((p) => [p.name, p.notifyServices])).toEqual([
      ['Rene', ['mobile_app_r1', 'mobile_app_r2']],
      ['Conny', ['mobile_app_c']],
    ]);
    expect(store.getAccessMode()).toBe('everyone');
  });

  it('ändert beim zweiten Start nichts mehr, auch wenn die Optionen anders lauten', () => {
    store.importLegacyPeople(legacy);
    const rene = store.people().find((p) => p.name === 'Rene')!;
    store.setNotifyServices(rene.id, ['mobile_app_neu']);
    store.removePerson(store.people().find((p) => p.name === 'Conny')!.id);

    expect(store.importLegacyPeople(legacy)).toBe(false);
    expect(store.people().map((p) => [p.name, p.notifyServices])).toEqual([['Rene', ['mobile_app_neu']]]);
  });

  it('eine frische Installation ohne Personen startet mit „nur freigegebene"', () => {
    expect(store.importLegacyPeople([])).toBe(true);
    expect(store.getAccessMode()).toBe('selected');
    expect(store.people()).toEqual([]);
  });

  it('ein vorhandener Modus wird nicht überschrieben', () => {
    store.setAccessMode('selected');
    store.importLegacyPeople(legacy);
    expect(store.getAccessMode()).toBe('selected');
  });
});

describe('Verwaltung aus der Add-on-Konfiguration', () => {
  const list = [
    { name: 'Anna', notify: ['mobile_app_anna'] },
    { name: 'Ben', notify: ['mobile_app_ben', 'mobile_app_ben_ipad'] },
  ];

  it('legt die genannten Personen mit ihren Geräten an und stellt den Zugriff ein', () => {
    store.applyManagedPeople(list, 'selected');
    expect(store.isManaged()).toBe(true);
    expect(store.getAccessMode()).toBe('selected');
    expect(store.people().map((p) => [p.name, p.notifyServices])).toEqual([
      ['Anna', ['mobile_app_anna']],
      ['Ben', ['mobile_app_ben', 'mobile_app_ben_ipad']],
    ]);
  });

  it('wer nicht in der Liste steht, ist keine Person mehr; die Liste gilt bei jedem Start neu', () => {
    store.syncPeople([{ name: 'Conny' }, { name: 'Anna' }]);
    store.applyManagedPeople(list, 'everyone');
    expect(store.people().map((p) => p.name).sort()).toEqual(['Anna', 'Ben']);
    expect(store.getAccessMode()).toBe('everyone');

    // geändert in der Konfiguration: Gerät getauscht, Ben gestrichen
    store.applyManagedPeople([{ name: 'Anna', notify: ['mobile_app_neu'] }], 'selected');
    expect(store.people().map((p) => [p.name, p.notifyServices])).toEqual([['Anna', ['mobile_app_neu']]]);
  });

  it('Namen werden ohne Rücksicht auf Groß- und Kleinschreibung gefunden', () => {
    store.syncPeople([{ name: 'Anna' }]);
    store.applyManagedPeople([{ name: 'anna', notify: ['mobile_app_a'] }], 'selected');
    expect(store.people()).toHaveLength(1);
    expect(store.people()[0]!.notifyServices).toEqual(['mobile_app_a']);
  });

  it('ist die Liste wieder leer, darf die App Personen und Zugriff selbst ändern', () => {
    store.applyManagedPeople(list, 'selected');
    store.clearManaged();
    expect(store.isManaged()).toBe(false);
    expect(store.people()).toHaveLength(2); // die Personen bleiben
  });

  it('ohne Konfiguration ist nichts verwaltet', () => {
    expect(store.isManaged()).toBe(false);
  });
});