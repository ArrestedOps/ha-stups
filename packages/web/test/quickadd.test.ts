import { describe, expect, it } from 'vitest';
import { toInputValue } from '../src/lib/datetime';
import { highlightSegments, parseQuickAdd, type QuickContext } from '../src/lib/quickadd';
import { DICTIONARIES } from '../src/lib/quickadd/dictionary';

const TZ = 'Europe/Berlin';
/** Montag, 2. November 2026, 10:00 Uhr in Berlin (Winterzeit) */
const NOW = Date.parse('2026-11-02T09:00:00Z');

const PEOPLE = [
  { id: 'p-ben', name: 'Ben', displayName: 'Ben' },
  { id: 'p-anna', name: 'Anna', displayName: 'Anna' },
  { id: 'p-annabell', name: 'Annabell', displayName: 'Annabell' },
  { id: 'p-rene', name: 'rene', displayName: 'René' },
];
const CATEGORIES = [
  { id: 'c-haus', name: 'Haushalt' },
  { id: 'c-garten', name: 'Garten' },
  { id: 'c-buero', name: 'Büro' },
];

const ctx = (over: Partial<QuickContext> = {}): QuickContext => ({
  now: NOW,
  tz: TZ,
  lang: 'de',
  defaultTime: '09:00',
  people: PEOPLE,
  categories: CATEGORIES,
  ...over,
});
const p = (text: string, over: Partial<QuickContext> = {}) => parseQuickAdd(text, ctx(over));
const local = (iso: string | null) => (iso ? toInputValue(iso, TZ) : null);

describe('Datum', () => {
  it('heute, morgen, übermorgen: mit Standard-Uhrzeit', () => {
    expect(local(p('Müll raus morgen').dueAt)).toBe('2026-11-03T09:00');
    expect(p('Müll raus morgen').title).toBe('Müll raus');
    expect(local(p('Paket übermorgen').dueAt)).toBe('2026-11-04T09:00');
    expect(local(p('Paket ubermorgen').dueAt)).toBe('2026-11-04T09:00');
    expect(local(p('Bad putzen heute 18 Uhr').dueAt)).toBe('2026-11-02T18:00');
  });

  it('„heute" ohne Uhrzeit nach der Standard-Uhrzeit: die nächste volle Stunde statt eines überfälligen Termins', () => {
    expect(local(p('Anrufen heute').dueAt)).toBe('2026-11-02T11:00');
    // vor der Standard-Uhrzeit gilt sie
    expect(local(p('Anrufen heute', { now: Date.parse('2026-11-02T06:00:00Z') }).dueAt)).toBe('2026-11-02T09:00');
    // spät am Abend: höchstens 23:00
    expect(local(p('Anrufen heute', { now: Date.parse('2026-11-02T22:30:00Z') }).dueAt)).toBe('2026-11-02T23:00');
  });

  it('Wochentage: der nächste nach heute; ist heute Montag, ist „Montag" der nächste Montag', () => {
    expect(local(p('Sport Montag').dueAt)).toBe('2026-11-09T09:00');
    expect(local(p('Sport Dienstag').dueAt)).toBe('2026-11-03T09:00');
    expect(local(p('Sport Sonntag').dueAt)).toBe('2026-11-08T09:00');
    expect(local(p('Sport Samstag').dueAt)).toBe('2026-11-07T09:00');
    expect(local(p('Sport nächsten Montag').dueAt)).toBe('2026-11-09T09:00');
    expect(local(p('Sport kommenden Freitag').dueAt)).toBe('2026-11-06T09:00');
  });

  it('„am" und „bis" vor dem Datum gehören dazu', () => {
    const r = p('Sport am Freitag');
    expect(r.title).toBe('Sport');
    expect(local(r.dueAt)).toBe('2026-11-06T09:00');
    expect(p('Steuer bis 1.12.').title).toBe('Steuer');
  });

  it('in N Tagen, Wochen, Monaten, Jahren', () => {
    expect(local(p('A in 3 Tagen').dueAt)).toBe('2026-11-05T09:00');
    expect(local(p('A in 1 Tag').dueAt)).toBe('2026-11-03T09:00');
    expect(local(p('A in 2 Wochen').dueAt)).toBe('2026-11-16T09:00');
    expect(local(p('A in einer Woche').dueAt)).toBe('2026-11-09T09:00');
    expect(local(p('A in einem Monat').dueAt)).toBe('2026-12-02T09:00');
    expect(local(p('A in 3 Monaten').dueAt)).toBe('2027-02-02T09:00');
    expect(local(p('A in einem Jahr').dueAt)).toBe('2027-11-02T09:00');
    expect(p('A in 3 Tagen').title).toBe('A');
  });

  it('Monatsende: „in einem Monat" bleibt im Zielmonat (auch im Schaltjahr)', () => {
    expect(local(p('A in einem Monat', { now: Date.parse('2027-01-31T09:00:00Z') }).dueAt)).toBe('2027-02-28T09:00');
    expect(local(p('A in einem Monat', { now: Date.parse('2028-01-31T09:00:00Z') }).dueAt)).toBe('2028-02-29T09:00');
    expect(local(p('A in einem Monat', { now: Date.parse('2026-08-31T09:00:00Z') }).dueAt)).toBe('2026-09-30T09:00');
    expect(local(p('A in einem Jahr', { now: Date.parse('2028-02-29T09:00:00Z') }).dueAt)).toBe('2029-02-28T09:00');
  });

  it('1.12., 1.12.2027, 1. Dezember, 1. Dez: ohne Jahr die nächste Wiederkehr', () => {
    expect(local(p('A 1.12.').dueAt)).toBe('2026-12-01T09:00');
    expect(local(p('A 1.12.2027').dueAt)).toBe('2027-12-01T09:00');
    expect(local(p('A 01.12.27').dueAt)).toBe('2027-12-01T09:00');
    expect(local(p('A 1. Dezember').dueAt)).toBe('2026-12-01T09:00');
    expect(local(p('A 1. dez').dueAt)).toBe('2026-12-01T09:00');
    expect(local(p('A 24. März').dueAt)).toBe('2027-03-24T09:00');
    expect(local(p('A 3. Mai 2028').dueAt)).toBe('2028-05-03T09:00');
    // schon vorbei in diesem Jahr: im nächsten
    expect(local(p('A 15.10.').dueAt)).toBe('2027-10-15T09:00');
    // heute selbst zählt als dieses Jahr
    expect(local(p('A 2.11.', { now: Date.parse('2026-11-02T06:00:00Z') }).dueAt)).toBe('2026-11-02T09:00');
  });

  it('Jahreswechsel', () => {
    expect(local(p('A 1.1.', { now: Date.parse('2026-12-30T09:00:00Z') }).dueAt)).toBe('2027-01-01T09:00');
    expect(local(p('A in 3 Tagen', { now: Date.parse('2026-12-30T09:00:00Z') }).dueAt)).toBe('2027-01-02T09:00');
  });

  it('ungültige Daten werden nicht erkannt und bleiben im Titel', () => {
    for (const bad of ['31.4.', '30.2.', '0.5.', '32.1.', '1.13.', '29.2.2027']) {
      const r = p(`A ${bad}`);
      expect(r.dueAt, bad).toBeNull();
      expect(r.title, bad).toBe(`A ${bad}`);
    }
  });

  it('29.2. ohne Jahr: der nächste Schalttag', () => {
    expect(local(p('A 29.2.').dueAt)).toBe('2028-02-29T09:00');
  });

  it('Sommerzeit: die Uhrzeit bleibt, der Abstand zu UTC ändert sich', () => {
    const before = Date.parse('2026-10-24T10:00:00Z'); // Samstag vor der Umstellung (CEST)
    expect(p('A heute 19 Uhr', { now: before }).dueAt).toBe('2026-10-24T17:00:00.000Z'); // 19:00 CEST
    expect(p('A morgen 19 Uhr', { now: before }).dueAt).toBe('2026-10-25T18:00:00.000Z'); // Sonntag: 19:00 CET
    // Frühling: 02:30 gibt es am 28.3.2027 nicht, es gilt nach der Lücke
    expect(p('A morgen 02:30', { now: Date.parse('2027-03-27T10:00:00Z') }).dueAt).toBe('2027-03-28T01:30:00.000Z');
  });

  it('nur das erste Datum zählt, das zweite bleibt im Titel', () => {
    const r = p('A morgen übermorgen');
    expect(local(r.dueAt)).toBe('2026-11-03T09:00');
    expect(r.title).toBe('A übermorgen');
  });

  it('Groß- und Kleinschreibung egal', () => {
    expect(local(p('A MORGEN').dueAt)).toBe('2026-11-03T09:00');
    expect(local(p('A Nächsten FREITAG').dueAt)).toBe('2026-11-06T09:00');
  });

  it('ein Wort, das nur so aussieht, ist kein Datum („Morgenstern", „Montagsmaler")', () => {
    expect(p('Morgenstern anrufen').dueAt).toBeNull();
    expect(p('Montagsmaler spielen').dueAt).toBeNull();
    expect(p('Heutebericht').dueAt).toBeNull();
  });
});

describe('Uhrzeit', () => {
  it('19 Uhr, 19:30, um 19, 7:05, 19.30 Uhr', () => {
    expect(local(p('A morgen 19 Uhr').dueAt)).toBe('2026-11-03T19:00');
    expect(local(p('A morgen 19:30').dueAt)).toBe('2026-11-03T19:30');
    expect(local(p('A morgen um 19').dueAt)).toBe('2026-11-03T19:00');
    expect(local(p('A morgen 7:05').dueAt)).toBe('2026-11-03T07:05');
    expect(local(p('A morgen 19.30 Uhr').dueAt)).toBe('2026-11-03T19:30');
    expect(local(p('A morgen um 8:15 Uhr').dueAt)).toBe('2026-11-03T08:15');
    expect(p('A morgen um 19 Uhr').title).toBe('A');
  });

  it('ungültige Uhrzeiten werden nicht erkannt', () => {
    for (const bad of ['25 Uhr', '24:00', '12:60', '99:99']) {
      const r = p(`A morgen ${bad}`);
      expect(local(r.dueAt), bad).toBe('2026-11-03T09:00'); // nur das Datum
      expect(r.title, bad).toBe(`A ${bad}`);
    }
  });

  it('nur eine Uhrzeit: heute, wenn sie noch kommt, sonst morgen', () => {
    expect(local(p('Anrufen 19 Uhr').dueAt)).toBe('2026-11-02T19:00');
    expect(local(p('Anrufen 8 Uhr').dueAt)).toBe('2026-11-03T08:00');
    expect(local(p('Anrufen 10:00').dueAt)).toBe('2026-11-03T10:00'); // genau jetzt ist vorbei
  });

  it('Standard-Uhrzeit aus der Einstellung', () => {
    expect(local(p('A morgen', { defaultTime: '07:30' }).dueAt)).toBe('2026-11-03T07:30');
    expect(local(p('A morgen 20 Uhr', { defaultTime: '07:30' }).dueAt)).toBe('2026-11-03T20:00');
  });

  it('„halb 8" gibt es noch nicht (Vormittag oder Abend wäre geraten)', () => {
    const r = p('A morgen halb 8');
    expect(local(r.dueAt)).toBe('2026-11-03T09:00');
    expect(r.title).toBe('A halb 8');
  });
});

describe('Wiederholung', () => {
  it('täglich, wöchentlich, monatlich, jährlich in beiden Schreibweisen', () => {
    expect(p('A jeden Tag').recurrence).toEqual({ type: 'fixed', freq: 'daily', every: 1 });
    expect(p('A täglich').recurrence).toEqual({ type: 'fixed', freq: 'daily', every: 1 });
    expect(p('A monatlich 15.11.').recurrence).toEqual({ type: 'fixed', freq: 'monthly', every: 1, monthDay: 15 });
    expect(p('A jeden Monat 15.11.').recurrence).toEqual({ type: 'fixed', freq: 'monthly', every: 1, monthDay: 15 });
    expect(p('A jährlich 1.12.').recurrence).toEqual({ type: 'fixed', freq: 'yearly', every: 1 });
    expect(p('A jedes Jahr 1.12.').recurrence).toEqual({ type: 'fixed', freq: 'yearly', every: 1 });
  });

  it('jede Woche: am Wochentag des Termins', () => {
    const r = p('A morgen jede Woche'); // morgen = Dienstag
    expect(r.recurrence).toEqual({ type: 'fixed', freq: 'weekly', every: 1, weekdays: [2] });
    expect(p('A wöchentlich morgen').recurrence).toEqual({ type: 'fixed', freq: 'weekly', every: 1, weekdays: [2] });
  });

  it('alle 2 Tage, alle 3 Wochen, alle 2 Monate, alle 2 Jahre', () => {
    expect(p('A alle 2 Tage').recurrence).toEqual({ type: 'fixed', freq: 'daily', every: 2 });
    expect(p('A alle 3 Wochen morgen').recurrence).toEqual({ type: 'fixed', freq: 'weekly', every: 3, weekdays: [2] });
    expect(p('A alle 2 Monate 20.11.').recurrence).toEqual({ type: 'fixed', freq: 'monthly', every: 2, monthDay: 20 });
    expect(p('A alle 2 Jahre 1.12.').recurrence).toEqual({ type: 'fixed', freq: 'yearly', every: 2 });
    expect(p('A alle 2 Tagen').recurrence).toEqual({ type: 'fixed', freq: 'daily', every: 2 });
  });

  it('jeden Montag: wöchentlich am Montag, der Termin ist der nächste Montag', () => {
    const r = p('Müll jeden Montag 19 Uhr');
    expect(r.recurrence).toEqual({ type: 'fixed', freq: 'weekly', every: 1, weekdays: [1] });
    expect(local(r.dueAt)).toBe('2026-11-09T19:00');
    expect(r.title).toBe('Müll');
    expect(p('Sport jeden Donnerstag').recurrence).toEqual({ type: 'fixed', freq: 'weekly', every: 1, weekdays: [4] });
    // mit eigenem Datum gilt das Datum
    expect(local(p('Sport jeden Donnerstag morgen').dueAt)).toBe('2026-11-03T09:00');
  });

  it('nur eine Wiederholung: der Termin ist heute (kommt die Uhrzeit noch) oder morgen', () => {
    expect(local(p('A jeden Tag').dueAt)).toBe('2026-11-03T09:00'); // 09:00 ist schon vorbei
    expect(local(p('A jeden Tag', { now: Date.parse('2026-11-02T06:00:00Z') }).dueAt)).toBe('2026-11-02T09:00');
  });

  it('„alle" ohne Zahl und Einheit ist keine Wiederholung', () => {
    const r = p('Alle Fenster putzen');
    expect(r.recurrence).toBeNull();
    expect(r.title).toBe('Alle Fenster putzen');
  });
});

describe('Priorität', () => {
  it('! = mittel, !! = hoch, „wichtig" = hoch', () => {
    expect(p('A !').priority).toBe('medium');
    expect(p('A !!').priority).toBe('high');
    expect(p('A wichtig').priority).toBe('high');
    expect(p('! A').priority).toBe('medium');
    expect(p('A ! morgen').priority).toBe('medium');
  });

  it('nur als eigenes Wort: „Achtung!", „Hallo!!!", „wichtiger" bleiben im Titel', () => {
    for (const t of ['Achtung!', 'Hallo!!!', 'wichtiger Termin', 'unwichtig', 'Was?!']) {
      const r = p(t);
      expect(r.priority, t).toBeNull();
      expect(r.title, t).toBe(t);
    }
  });
});

describe('@Person', () => {
  it('nach Namen oder Anzeigenamen, Groß- und Kleinschreibung egal', () => {
    expect(p('A @Ben').assignees).toEqual([{ name: 'Ben', personId: 'p-ben', status: 'ok' }]);
    expect(p('A @ben').assignees[0]).toMatchObject({ personId: 'p-ben' });
    expect(p('A @rene').assignees[0]).toMatchObject({ personId: 'p-rene' });
    expect(p('A @René').assignees[0]).toMatchObject({ personId: 'p-rene' });
    expect(p('A @Ben').title).toBe('A');
  });

  it('ein eindeutiger Anfang genügt; ein genauer Name gewinnt gegen einen Anfang', () => {
    expect(p('A @be').assignees[0]).toMatchObject({ personId: 'p-ben', status: 'ok' });
    expect(p('A @anna').assignees[0]).toMatchObject({ personId: 'p-anna', status: 'ok' }); // Anna statt Annabell
    expect(p('A @annab').assignees[0]).toMatchObject({ personId: 'p-annabell', status: 'ok' });
  });

  it('mehrdeutig oder unbekannt: bleibt sichtbar als Warnung, wird nie stillschweigend verworfen', () => {
    expect(p('A @an').assignees).toEqual([{ name: 'an', personId: null, status: 'ambiguous' }]);
    expect(p('A @Niemand').assignees).toEqual([{ name: 'Niemand', personId: null, status: 'unknown' }]);
    // der Text bleibt aus dem Titel heraus: die Warnung steht als Chip, der Titel ist sauber
    expect(p('A @Niemand').title).toBe('A');
  });

  it('mehrere Personen, jede nur einmal', () => {
    const r = p('A @Ben @Anna @ben');
    expect(r.assignees.map((a) => a.personId)).toEqual(['p-ben', 'p-anna']);
  });

  it('ein @ in einer E-Mail-Adresse ist keine Person', () => {
    const r = p('Mail an ben@example.org schicken');
    expect(r.assignees).toEqual([]);
    expect(r.title).toBe('Mail an ben@example.org schicken');
  });
});

describe('#Kategorie', () => {
  it('bekannte Kategorie im Board, Groß- und Kleinschreibung egal, auch mit Umlaut', () => {
    expect(p('A #Haushalt').categories).toEqual([{ name: 'Haushalt', categoryId: 'c-haus', status: 'ok' }]);
    expect(p('A #haushalt').categories[0]).toMatchObject({ categoryId: 'c-haus', name: 'Haushalt' });
    expect(p('A #Büro').categories[0]).toMatchObject({ categoryId: 'c-buero' });
    expect(p('A #Haushalt').title).toBe('A');
  });

  it('unbekannte Kategorie: „neu", wird erst nach Rückfrage angelegt', () => {
    expect(p('A #Reisen').categories).toEqual([{ name: 'Reisen', categoryId: null, status: 'new' }]);
  });

  it('ein # ohne Namen oder mitten im Wort ist keine Kategorie', () => {
    expect(p('Nummer #1 anrufen').categories).toEqual([{ name: '1', categoryId: null, status: 'new' }]);
    expect(p('A # B').categories).toEqual([]);
    expect(p('Farbe#ff0000 setzen').categories).toEqual([]);
  });
});

describe('Titel', () => {
  it('Zahlen und gewöhnliche Wörter bleiben', () => {
    for (const t of ['Kauf 2 Kisten Wasser', 'Zimmer 12 streichen', 'Die 3 Fragezeichen hören']) {
      const r = p(t);
      expect(r.title).toBe(t);
      expect(r.dueAt).toBeNull();
      expect(r.tokens).toEqual([]);
    }
  });

  it('ohne erkannte Teile bleibt der Titel genau so, wie er getippt wurde (nur der Rand wird gekürzt)', () => {
    expect(p('Einkaufen:').title).toBe('Einkaufen:');
    expect(p('Wasser  und  Brot, bitte -').title).toBe('Wasser  und  Brot, bitte -');
    expect(p('  Bad putzen  ').title).toBe('Bad putzen');
  });

  it('Reste werden aufgeräumt: Leerzeichen, Komma am Ende, Rand', () => {
    expect(p('  Müll   raus  morgen  ').title).toBe('Müll raus');
    expect(p('Müll raus, morgen').title).toBe('Müll raus');
    expect(p('Müll raus - morgen').title).toBe('Müll raus');
    expect(p('morgen: Müll raus').title).toBe('Müll raus');
  });

  it('nur Erkanntes ergibt einen leeren Titel (Anlegen ist dann gesperrt)', () => {
    expect(p('morgen').title).toBe('');
    expect(p('@Ben #Haushalt !').title).toBe('');
  });

  it('leere Eingabe', () => {
    const r = p('');
    expect(r).toMatchObject({ title: '', dueAt: null, recurrence: null, priority: null, assignees: [], categories: [], tokens: [] });
  });
});

describe('Alles zusammen', () => {
  it('Müll raus morgen 19 Uhr @Ben #Haushalt jede Woche !', () => {
    const r = p('Müll raus morgen 19 Uhr @Ben #Haushalt jede Woche !');
    expect(r.title).toBe('Müll raus');
    expect(local(r.dueAt)).toBe('2026-11-03T19:00');
    expect(r.assignees).toEqual([{ name: 'Ben', personId: 'p-ben', status: 'ok' }]);
    expect(r.categories).toEqual([{ name: 'Haushalt', categoryId: 'c-haus', status: 'ok' }]);
    expect(r.recurrence).toEqual({ type: 'fixed', freq: 'weekly', every: 1, weekdays: [2] });
    expect(r.priority).toBe('medium');
  });

  it('die Reihenfolge der Teile im Satz ist egal', () => {
    const a = p('! jede Woche #Haushalt @Ben 19 Uhr morgen Müll raus');
    expect(a.title).toBe('Müll raus');
    expect(local(a.dueAt)).toBe('2026-11-03T19:00');
    expect(a.assignees[0]).toMatchObject({ personId: 'p-ben' });
  });
});

describe('Erkannte Teile (für Hervorhebung und Zurücknehmen)', () => {
  it('jedes Token kennt Art, Ort und Text im Original; sortiert, ohne Überlappung', () => {
    const text = 'Müll raus morgen 19 Uhr @Ben #Haushalt jede Woche !';
    const r = p(text);
    const kinds = r.tokens.map((t) => t.kind);
    expect(kinds).toEqual(['date', 'time', 'person', 'category', 'recurrence', 'priority']);
    let end = 0;
    for (const t of r.tokens) {
      expect(text.slice(t.start, t.end)).toBe(t.text);
      expect(t.start).toBeGreaterThanOrEqual(end);
      end = t.end;
    }
    expect(r.tokens.find((t) => t.kind === 'date')!.text).toBe('morgen');
    expect(r.tokens.find((t) => t.kind === 'time')!.text).toBe('19 Uhr');
    expect(r.tokens.find((t) => t.kind === 'person')!.status).toBe('ok');
  });

  it('Kennungen sind stabil: dieselben Wörter geben dieselbe Kennung, auch wenn der Text davor sich ändert', () => {
    const a = p('Müll raus morgen').tokens[0]!;
    const b = p('Ganz anderer Satz mit morgen').tokens[0]!;
    expect(a.id).toBe(b.id);
    expect(a.id).toBe('date:morgen');
  });

  it('ein zurückgenommenes Token bleibt Text im Titel', () => {
    const r = p('Müll raus morgen', { ignore: new Set(['date:morgen']) });
    expect(r.dueAt).toBeNull();
    expect(r.title).toBe('Müll raus morgen');
    expect(r.tokens).toEqual([]);
  });

  it('Zurücknehmen einer Person oder Kategorie', () => {
    const r = p('A @Ben #Haushalt', { ignore: new Set(['person:ben', 'category:haushalt']) });
    expect(r.assignees).toEqual([]);
    expect(r.categories).toEqual([]);
    expect(r.title).toBe('A @Ben #Haushalt');
  });

  it('das zweite Datum rückt nicht nach, wenn das erste zurückgenommen wird: beide bleiben im Titel, übrig bleibt, was ausdrücklich erkannt ist', () => {
    const r = p('A morgen übermorgen', { ignore: new Set(['date:morgen']) });
    expect(local(r.dueAt)).toBe('2026-11-04T09:00');
    expect(r.title).toBe('A morgen');
  });
});

describe('Hervorhebung', () => {
  it('zerlegt den Text so, dass die Stücke wieder den Originaltext ergeben', () => {
    for (const text of ['Müll raus morgen 19 Uhr @Ben #Haushalt jede Woche !', 'nur Titel', '', '@Ben', 'A morgen', '  morgen  ']) {
      const segs = highlightSegments(text, p(text).tokens);
      expect(segs.map((s) => s.text).join(''), text).toBe(text);
    }
  });

  it('erkannte Stücke tragen ihr Token, der Rest nicht', () => {
    const segs = highlightSegments('Müll raus morgen 19 Uhr', p('Müll raus morgen 19 Uhr').tokens);
    expect(segs.map((s) => [s.text, s.token?.kind])).toEqual([
      ['Müll raus ', undefined],
      ['morgen', 'date'],
      [' ', undefined],
      ['19 Uhr', 'time'],
    ]);
  });
});

describe('Sprachen', () => {
  it('jede Sprache hat alle Wörter (Grundlage für Englisch)', () => {
    const keys = (o: object): string[] => Object.keys(o).sort();
    const de = DICTIONARIES.de;
    for (const [lang, d] of Object.entries(DICTIONARIES)) {
      expect(keys(d), lang).toEqual(keys(de));
      expect(d.weekdays, lang).toHaveLength(7);
      expect(d.months, lang).toHaveLength(12);
      for (const list of [...d.weekdays, ...d.months]) expect(list.length, lang).toBeGreaterThan(0);
    }
  });
});
