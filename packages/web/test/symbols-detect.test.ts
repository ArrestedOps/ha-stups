import { describe, expect, it } from 'vitest';
import { detectSymbol, symbolSuggestions } from '../src/lib/symbols/detect';
import { SYMBOLS } from '../src/lib/symbols/library';

const TRASH = 'trash-can-outline';

describe('Symbol aus dem Titel erkennen (Deutsch)', () => {
  const table: [string, string | null][] = [
    // Beispiele aus dem Mockup
    ['Müll raus', TRASH],
    ['Müll rausbringen', TRASH],
    ['Waschmaschine ausräumen', 'washing-machine'],
    ['Bad putzen', 'water-outline'],
    ['Milch kaufen', 'cart-outline'],
    // Mehrdeutigkeit: das stärkere Wort und der genauere Treffer gewinnen
    ['Spülmaschine ausräumen', 'dishwasher'],
    ['Hund füttern', 'dog'],
    ['Katze füttern', 'cat'],
    ['Auto zur Werkstatt', 'car-outline'],
    ['Zahnarzt anrufen', 'tooth-outline'],
    ['Oma anrufen', 'phone-outline'],
    ['Arzttermin', 'stethoscope'],
    ['Rasen mähen', 'grass'],
    // Mehrwortausdrücke, Zusammensetzungen, Beugung
    ['Gelber Sack rausstellen', 'recycle'],
    ['Altpapier wegbringen', 'recycle'],
    ['Mülltonnen an die Straße', TRASH],
    ['Bettwäsche wechseln', 'bed-outline'],
    ['Blumen gießen', 'flower-outline'],
    ['Rechnung bezahlen', 'currency-eur'],
    ['Geschenk für Oma kaufen', 'gift-outline'],
    // Groß und klein, Umlaute (auch ohne), Leerraum
    ['MÜLL RAUS', TRASH],
    ['muell raus', TRASH],
    ['  müll   raus  ', TRASH],
    ['Waesche waschen', 'washing-machine'],
    // nichts erkannt
    ['', null],
    ['   ', null],
    ['xyzzy', null],
    ['Dinge', null],
  ];
  for (const [title, expected] of table) {
    it(`„${title}“ → ${expected ?? 'nichts'}`, () => expect(detectSymbol(title, 'de')).toBe(expected));
  }
});

describe('Symbol aus dem Titel erkennen (Englisch)', () => {
  const table: [string, string | null][] = [
    ['Take out the rubbish', TRASH],
    ['Buy milk', 'cart-outline'],
    ['Clean the bathroom', 'water-outline'],
    ['Walk the dog', 'dog'],
    ['Water the plants', 'watering-can-outline'],
    ['Call the doctor', 'stethoscope'],
    ['Feed the cats', 'cat'],
    ['Do the laundry', 'washing-machine'],
    ['Pay the invoice', 'currency-eur'],
    ['', null],
    ['qqqq', null],
  ];
  for (const [title, expected] of table) {
    it(`"${title}" → ${expected ?? 'nothing'}`, () => expect(detectSymbol(title, 'en')).toBe(expected));
  }
});

describe('Erkennung: Eigenschaften', () => {
  it('liefert immer ein Symbol der Bibliothek', () => {
    const ids = new Set(SYMBOLS.map((s) => s.id));
    for (const title of ['Müll', 'Pflanzen gießen', 'Steuererklärung', 'Zug nach Hamburg']) {
      const hit = detectSymbol(title, 'de');
      if (hit) expect(ids.has(hit)).toBe(true);
    }
  });
  it('ein deutscher Titel wird mit englischer Einstellung nicht erkannt, ein englischer mit deutscher nicht', () => {
    expect(detectSymbol('Müll raus', 'en')).toBeNull();
    expect(detectSymbol('Take out the rubbish', 'de')).toBeNull();
  });
  it('ist deterministisch: gleicher Titel, gleiches Symbol', () => {
    expect(detectSymbol('Müll raus', 'de')).toBe(detectSymbol('Müll raus', 'de'));
  });
});

describe('Vorschläge zum Titel', () => {
  it('der beste Treffer steht vorn, höchstens die gewünschte Anzahl, ohne Doppelungen', () => {
    const s = symbolSuggestions('Müll rausbringen', 'de', 4);
    expect(s[0]).toBe(TRASH);
    expect(s.length).toBeLessThanOrEqual(4);
    expect(new Set(s).size).toBe(s.length);
    expect(s).toContain('recycle');
  });
  it('ohne Treffer keine Vorschläge', () => {
    expect(symbolSuggestions('xyzzy', 'de', 4)).toEqual([]);
    expect(symbolSuggestions('', 'de', 4)).toEqual([]);
  });
  it('der erste Vorschlag ist das erkannte Symbol', () => {
    for (const title of ['Waschmaschine ausräumen', 'Bad putzen', 'Milch kaufen']) {
      expect(symbolSuggestions(title, 'de', 4)[0]).toBe(detectSymbol(title, 'de'));
    }
  });
});
