import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { createWatcherData } from '../src/watcher-data.js';
import { parseWatcher } from '../src/watcher-types.js';

const input = (extra: Record<string, unknown> = {}) => ({
  name: 'Batterie schwach',
  trigger: { entityId: 'sensor.tuer_batterie', kind: 'below', value: 20 },
  card: { boardId: 'b', columnId: 'c', title: 'Batterie wechseln' },
  assign: { mode: 'none', personIds: [] },
  ...extra,
});

function make() {
  const db = openDb(':memory:');
  // Wächter verweisen auf kein Board per Fremdschlüssel: Zeilen direkt über die Daten-Schicht
  return createWatcherData(db);
}

describe('Wächter: Kategorie parsen', () => {
  it('ohne Angabe keine Kategorie, mit Angabe getrimmt', () => {
    expect(parseWatcher(input()).category).toBeNull();
    expect(parseWatcher(input({ category: '' })).category).toBeNull();
    expect(parseWatcher(input({ category: '  Batterien ' })).category).toBe('Batterien');
  });
  it('zu lang oder kein Text ist ein Fehler', () => {
    expect(() => parseWatcher(input({ category: 'x'.repeat(41) }))).toThrow(/zu lang/);
    expect(() => parseWatcher(input({ category: 3 }))).toThrow(/Text/);
  });
});

describe('Wächter: Kategorie speichern', () => {
  it('Anlegen und Lesen', () => {
    const d = make();
    const w = d.create(parseWatcher(input({ category: 'Batterien' })));
    expect(w.category).toBe('Batterien');
    expect(d.get(w.id).category).toBe('Batterien');
    expect(d.list()[0]!.category).toBe('Batterien');
    expect(d.create(parseWatcher(input())).category).toBeNull();
  });

  it('gleiche Namen ohne Beachtung der Groß-/Kleinschreibung werden zusammengelegt (die erste Schreibweise gilt)', () => {
    const d = make();
    d.create(parseWatcher(input({ category: 'Garten' })));
    expect(d.create(parseWatcher(input({ category: 'garten' }))).category).toBe('Garten');
    const c = d.create(parseWatcher(input({ category: 'Keller' })));
    expect(d.update(c.id, parseWatcher(input({ category: ' GARTEN ' }))).category).toBe('Garten');
    expect(d.list().map((w) => w.category)).toEqual(['Garten', 'Garten', 'Garten']);
  });

  it('Batterien und Batteries sind dieselbe Standardkategorie', () => {
    const d = make();
    d.create(parseWatcher(input({ category: 'Batterien' })));
    expect(d.create(parseWatcher(input({ category: 'Batteries' }))).category).toBe('Batterien');
  });

  it('setCategory ändert nur die Kategorie (und legt zusammen); null entfernt sie', () => {
    const d = make();
    const a = d.create(parseWatcher(input({ category: 'Garten', name: 'A' })));
    const b = d.create(parseWatcher(input({ name: 'B' })));
    d.setCategory(b.id, 'garten');
    expect(d.get(b.id)).toMatchObject({ category: 'Garten', name: 'B', active: true });
    d.setCategory(a.id, null);
    expect(d.get(a.id).category).toBeNull();
    // die Zeile des zweiten Wächters behält die eigene Schreibweise bei Gleichstand: die erste vorhandene bleibt
    expect(d.get(b.id).category).toBe('Garten');
  });

  it('setCategory zählt als Schreibzugriff (Live-Sync)', () => {
    let writes = 0;
    const d = createWatcherData(openDb(':memory:'), () => new Date(), () => (writes += 1));
    const w = d.create(parseWatcher(input()));
    writes = 0;
    d.setCategory(w.id, 'X');
    expect(writes).toBeGreaterThan(0);
  });

  it('Kategorien: die vorhandenen, ohne Doppelte', () => {
    const d = make();
    d.create(parseWatcher(input({ category: 'Garten' })));
    d.create(parseWatcher(input({ category: 'Keller' })));
    d.create(parseWatcher(input({ category: 'keller' })));
    d.create(parseWatcher(input()));
    expect(d.categories()).toEqual(['Garten', 'Keller']);
  });
});
