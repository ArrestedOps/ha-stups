import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pushRecent, recentSymbols, resetRecentMemory, RECENT_KEY, RECENT_MAX } from '../src/lib/symbols/recent';
import { searchSymbols } from '../src/lib/symbols/search';

const ids = (q: string, lang: 'de' | 'en' = 'de') => searchSymbols(q, lang).map((s) => s.id);

describe('Symbole suchen', () => {
  it('ohne Suchbegriff gibt es keine Treffer', () => {
    expect(ids('')).toEqual([]);
    expect(ids('   ')).toEqual([]);
  });
  it('findet über Name und Suchwörter, auch ähnliche Wörter: „Wäsche“ findet die Waschmaschine', () => {
    expect(ids('Wäsche')[0]).toBe('washing-machine');
    expect(ids('Waschmaschine')).toContain('washing-machine');
    expect(ids('müll')).toEqual(expect.arrayContaining(['trash-can-outline', 'recycle']));
  });
  it('Groß und klein, Umlaute und ihre Umschrift sind egal', () => {
    expect(ids('WÄSCHE')).toContain('washing-machine');
    expect(ids('waesche')).toContain('washing-machine');
    expect(ids('mull')).toContain('trash-can-outline');
    expect(ids('muell')).toContain('trash-can-outline');
  });
  it('Teiltreffer: der Anfang eines Wortes genügt', () => {
    expect(ids('waschm')).toContain('washing-machine');
    expect(ids('saugr')).toContain('robot-vacuum');
  });
  it('einfache Tippfehlertoleranz (ein Zeichen daneben, vertauscht, fehlt)', () => {
    expect(ids('Rasn')).toContain('grass');
    expect(ids('Staubsagur')).toContain('vacuum-outline');
    expect(ids('Waschmschine')).toContain('washing-machine');
    expect(ids('Kuehlschrnak')).toContain('fridge-outline');
  });
  it('kurze Eingaben werden nicht „ähnlich“ gemacht (kein Zufallstreffer)', () => {
    expect(ids('zz')).toEqual([]);
    expect(ids('qx')).toEqual([]);
  });
  it('Englisch, und die Kennung eines Symbols', () => {
    expect(ids('robot vacuum', 'en')).toContain('robot-vacuum');
    expect(ids('laundry', 'en')).toContain('washing-machine');
    expect(ids('robot-vacuum')).toContain('robot-vacuum');
    expect(ids('mdi:robot-vacuum')).toContain('robot-vacuum');
  });
  it('findet die Wörter der anderen Sprache ebenfalls (Auto, Laptop heißen gleich)', () => {
    expect(ids('laundry', 'de')).toContain('washing-machine');
    expect(ids('Wäsche', 'en')).toContain('washing-machine');
  });
  it('unsinnige Eingabe: nichts gefunden', () => {
    expect(ids('xyzqwv')).toEqual([]);
  });
  it('der genaue Treffer steht vor dem ähnlichen', () => {
    expect(ids('Pflanze')[0]).toBe('leaf');
    expect(ids('Hund')[0]).toBe('dog');
  });
});

/** Ein Speicher im Arbeitsspeicher, der sich wie localStorage verhält */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}
const brokenStorage = (): Storage =>
  new Proxy({} as Storage, {
    get() {
      throw new Error('gesperrt');
    },
  });

describe('zuletzt benutzt', () => {
  let store: Storage;
  beforeEach(() => {
    store = memoryStorage();
  });
  afterEach(() => resetRecentMemory());

  it('beginnt leer, merkt sich das Neueste vorn und jedes Symbol nur einmal', () => {
    expect(recentSymbols(store)).toEqual([]);
    pushRecent('leaf', store);
    pushRecent('recycle', store);
    pushRecent('leaf', store);
    expect(recentSymbols(store)).toEqual(['leaf', 'recycle']);
  });
  it(`behält höchstens ${RECENT_MAX}`, () => {
    for (const id of ['leaf', 'recycle', 'dog', 'cat', 'bone', 'tree-outline', 'grass', 'fence']) pushRecent(id, store);
    expect(recentSymbols(store)).toHaveLength(RECENT_MAX);
    expect(recentSymbols(store)[0]).toBe('fence');
  });
  it('unbekannte oder beschädigte Einträge werden ausgelassen', () => {
    store.setItem(RECENT_KEY, JSON.stringify(['leaf', 'gibt-es-nicht', 5, null]));
    expect(recentSymbols(store)).toEqual(['leaf']);
    store.setItem(RECENT_KEY, '{kaputt');
    expect(recentSymbols(store)).toEqual([]);
    store.setItem(RECENT_KEY, '"text"');
    expect(recentSymbols(store)).toEqual([]);
  });
  it('ohne Speicher (gesperrt) bleibt alles benutzbar: Rückfall auf den Arbeitsspeicher der Sitzung', () => {
    const broken = brokenStorage();
    expect(recentSymbols(broken)).toEqual([]);
    pushRecent('leaf', broken);
    pushRecent('dog', broken);
    expect(recentSymbols(broken)).toEqual(['dog', 'leaf']);
  });
});
