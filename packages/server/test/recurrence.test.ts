import { describe, expect, it, vi } from 'vitest';
import { nextDue, type Recurrence } from '../src/recurrence.js';

const TZ = 'Europe/Berlin';
// Berlin 2026: Sommerzeit ab So 29.03. (01:00Z), Winterzeit ab So 25.10. (01:00Z)

const weekly = (weekdays: number[], every = 1): Recurrence => ({ type: 'fixed', freq: 'weekly', every, weekdays });

describe('fester Rhythmus: wöchentlich', () => {
  it('Bad putzen jeden Samstag, am Montag erledigt: nächster Termin ist der Samstag danach', () => {
    // Sa 17.10. 10:00 (Sommerzeit), erledigt Mo 19.10.
    expect(nextDue(weekly([6]), '2026-10-17T08:00:00Z', '2026-10-19T12:00:00Z', TZ)).toBe('2026-10-24T08:00:00.000Z');
  });

  it('bleibt 10:00 Ortszeit über die Zeitumstellung hinweg', () => {
    // Sa 24.10. 10:00 CEST, erledigt Mo 26.10. → Sa 31.10. 10:00 CET
    expect(nextDue(weekly([6]), '2026-10-24T08:00:00Z', '2026-10-26T12:00:00Z', TZ)).toBe('2026-10-31T09:00:00.000Z');
  });

  it('früh erledigt (Freitag vor dem Termin): nächster Termin ist der Samstag danach, 8 Tage später', () => {
    expect(nextDue(weekly([6]), '2026-11-07T09:00:00Z', '2026-11-06T18:00:00Z', TZ)).toBe('2026-11-14T09:00:00.000Z');
  });

  it('überspringt verpasste Termine bei langer Verspätung', () => {
    expect(nextDue(weekly([6]), '2026-10-17T08:00:00Z', '2026-11-20T12:00:00Z', TZ)).toBe('2026-11-21T09:00:00.000Z');
  });

  it('nimmt ohne Wochentage den Wochentag des bisherigen Termins', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'weekly', every: 1 };
    expect(nextDue(rule, '2026-11-02T08:00:00Z', '2026-11-02T08:30:00Z', TZ)).toBe('2026-11-09T08:00:00.000Z');
  });

  it('kennt mehrere Wochentage und Wochenabstand', () => {
    const rule = weekly([1, 4], 2); // Mo + Do, alle 2 Wochen
    const first = nextDue(rule, '2026-11-02T08:00:00Z', '2026-11-02T08:30:00Z', TZ);
    expect(first).toBe('2026-11-05T08:00:00.000Z');
    expect(nextDue(rule, first, '2026-11-05T08:10:00Z', TZ)).toBe('2026-11-16T08:00:00.000Z');
  });
});

describe('fester Rhythmus: wöchentlich, Reihenfolge und späte Erledigung', () => {
  it('ungeordnete Wochentage liefern trotzdem den frühesten Termin (Do + Mo, Erledigung am Freitag)', () => {
    // Mo 2.11. fällig, Fr 6.11. erledigt → nächster ist Mo 9.11., nicht Do 12.11.
    expect(nextDue(weekly([4, 1]), '2026-11-02T08:00:00Z', '2026-11-06T12:00:00Z', TZ)).toBe('2026-11-09T08:00:00.000Z');
  });

  it('holt bei Wochenabstand 2 eine längere Verspätung korrekt auf', () => {
    // Sa 17.10. alle 2 Wochen: 31.10., 14.11., 28.11., 12.12., 26.12. (10:00 CET = 09:00Z)
    expect(nextDue(weekly([6], 2), '2026-10-17T08:00:00Z', '2026-12-20T12:00:00Z', TZ)).toBe('2026-12-26T09:00:00.000Z');
  });

  it('findet den Termin auch nach mehreren tausend Jahren Verspätung', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] };
    expect(nextDue(rule, '2026-01-03T09:00:00Z', '6100-01-01T00:00:00Z', 'UTC')).toBe('6100-01-02T09:00:00.000Z');
  });
});

describe('fester Rhythmus: täglich', () => {
  it('alle 3 Tage', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'daily', every: 3 };
    expect(nextDue(rule, '2026-10-30T08:00:00Z', '2026-10-30T08:30:00Z', TZ)).toBe('2026-11-02T08:00:00.000Z');
  });

  it('bleibt über die Zeitumstellung bei der Ortszeit', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'daily', every: 1 };
    expect(nextDue(rule, '2026-10-24T08:00:00Z', '2026-10-24T09:00:00Z', TZ)).toBe('2026-10-25T09:00:00.000Z');
  });

  it('holt eine mehrjährige Verspätung ohne Endlosschleife auf', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'daily', every: 1 };
    const got = nextDue(rule, '2020-01-01T09:00:00Z', '2026-10-30T12:00:00Z', TZ);
    expect(got).toBe('2026-10-31T09:00:00.000Z');
  });
});

describe('fester Rhythmus: täglich, Randfälle', () => {
  const daily: Recurrence = { type: 'fixed', freq: 'daily', every: 1 };

  it('der Termin am selben Tag zählt, wenn die Winterzeit ihn hinter die Erledigung schiebt', () => {
    // Di 20.10. 10:00 CEST (08:00Z); Mo 26.10. 10:00 CET = 09:00Z liegt nach der Erledigung um 08:30Z
    expect(nextDue(daily, '2026-10-20T08:00:00Z', '2026-10-26T08:30:00Z', TZ)).toBe('2026-10-26T09:00:00.000Z');
  });

  it('findet den Termin auch nach mehr als 200.000 Tagen Verspätung', () => {
    expect(nextDue(daily, '2026-01-01T09:00:00Z', '2800-01-01T00:00:00Z', 'UTC')).toBe('2800-01-01T09:00:00.000Z');
  });
});

describe('Zeitzonen mit Sonderfällen', () => {
  it('halbstündige Umstellung (Lord Howe): 02:45 nach dem Zurückstellen gilt einmal', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'daily', every: 1 };
    // So 5.4.2026 02:00 LHDT → 01:30 LHST; 02:45 danach ist 16:15Z am Vortag
    expect(nextDue(rule, '2026-04-03T15:45:00Z', '2026-04-03T16:15:00Z', 'Australia/Lord_Howe')).toBe('2026-04-04T16:15:00.000Z');
  });

  it('übersprungener Kalendertag (Samoa, 30.12.2011): Termin rückt hinter die Lücke', () => {
    const rule: Recurrence = { type: 'after_completion', every: 1, unit: 'days' };
    // erledigt Do 29.12. 12:00 (UTC-10); der 30.12. entfällt, 10:00 am 31.12. (UTC+14) = 30.12. 20:00Z
    expect(nextDue(rule, '2011-12-20T20:00:00Z', '2011-12-29T22:00:00Z', 'Pacific/Apia')).toBe('2011-12-30T20:00:00.000Z');
  });

  it('legt den Zeitzonen-Formatierer nur einmal an', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat');
    try {
      const rule: Recurrence = { type: 'fixed', freq: 'daily', every: 1 };
      // Der Zwischenspeicher gilt fürs ganze Modul: Ob der erste Aufruf ihn füllt, hängt von früheren Tests ab, der zweite nie
      nextDue(rule, '2026-11-10T08:00:00Z', '2026-11-10T08:30:00Z', 'Pacific/Auckland');
      const afterFirst = spy.mock.calls.length;
      expect(afterFirst).toBeLessThanOrEqual(1);
      nextDue(rule, '2026-11-11T08:00:00Z', '2026-11-11T08:30:00Z', 'Pacific/Auckland');
      expect(spy).toHaveBeenCalledTimes(afterFirst);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('fester Rhythmus: monatlich und jährlich', () => {
  const m31: Recurrence = { type: 'fixed', freq: 'monthly', every: 1, monthDay: 31 };

  it('der 31. fällt in kürzeren Monaten auf den letzten Tag und kehrt zurück', () => {
    const feb = nextDue(m31, '2026-01-31T09:00:00Z', '2026-01-31T09:30:00Z', TZ);
    expect(feb).toBe('2026-02-28T09:00:00.000Z');
    const mar = nextDue(m31, feb, '2026-02-28T09:30:00Z', TZ);
    expect(mar).toBe('2026-03-31T08:00:00.000Z'); // Sommerzeit: 10:00 = 08:00Z
    expect(nextDue(m31, mar, '2026-03-31T08:30:00Z', TZ)).toBe('2026-04-30T08:00:00.000Z');
  });

  it('kennt den Schalttag', () => {
    expect(nextDue(m31, '2028-01-31T09:00:00Z', '2028-01-31T09:30:00Z', TZ)).toBe('2028-02-29T09:00:00.000Z');
  });

  it('monthDay -1 ist der letzte Tag des Monats', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'monthly', every: 1, monthDay: -1 };
    expect(nextDue(rule, '2026-01-31T09:00:00Z', '2026-01-31T09:30:00Z', TZ)).toBe('2026-02-28T09:00:00.000Z');
  });

  it('nimmt ohne monthDay den Tag des bisherigen Termins, auch mit Monatsabstand', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'monthly', every: 2 };
    expect(nextDue(rule, '2026-11-15T09:00:00Z', '2026-11-15T09:30:00Z', TZ)).toBe('2027-01-15T09:00:00.000Z');
  });

  it('liefert noch den späteren Termin im selben Monat, wenn er nach dem Erledigen liegt', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'monthly', every: 1, monthDay: 20 };
    expect(nextDue(rule, '2026-11-15T09:00:00Z', '2026-11-16T09:00:00Z', TZ)).toBe('2026-11-20T09:00:00.000Z');
  });

  it('jährlich, mit 29.2. → 28.2. in Nicht-Schaltjahren', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'yearly', every: 1 };
    expect(nextDue(rule, '2026-03-01T09:00:00Z', '2026-03-01T09:30:00Z', TZ)).toBe('2027-03-01T09:00:00.000Z');
    expect(nextDue(rule, '2028-02-29T09:00:00Z', '2028-02-29T09:30:00Z', TZ)).toBe('2029-02-28T09:00:00.000Z');
  });
});

describe('Jährlich und unbekannte Häufigkeit', () => {
  it('unbekannte Häufigkeit: Fehler mit Meldung statt eines erfundenen Termins', () => {
    const rule = { type: 'fixed', freq: 'quarterly', every: 1 } as unknown as Recurrence;
    expect(() => nextDue(rule, '2026-01-15T00:00:00Z', '2026-01-15T00:10:00Z', 'UTC')).toThrow('Kein nächster Termin gefunden');
  });

  it('jährlich mit Abstand 2: der nächste Termin liegt zwei Jahre später', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'yearly', every: 2 };
    expect(nextDue(rule, '2026-03-01T09:00:00Z', '2026-03-02T09:00:00Z', TZ)).toBe('2028-03-01T09:00:00.000Z');
  });
});

describe('Intervall ab Erledigung', () => {
  it('Filter alle 3 Monate: erledigt am 14.11. um 21:30 → 14.02. um 18:00', () => {
    const rule: Recurrence = { type: 'after_completion', every: 3, unit: 'months' };
    expect(nextDue(rule, '2026-11-14T17:00:00Z', '2026-11-14T20:30:00Z', TZ)).toBe('2027-02-14T17:00:00.000Z');
  });

  it('kappt auf das Monatsende (31.01. + 1 Monat)', () => {
    const rule: Recurrence = { type: 'after_completion', every: 1, unit: 'months' };
    expect(nextDue(rule, '2026-11-14T17:00:00Z', '2027-01-31T10:00:00Z', TZ)).toBe('2027-02-28T17:00:00.000Z');
  });

  it('rechnet in Tagen über die Zeitumstellung', () => {
    const rule: Recurrence = { type: 'after_completion', every: 10, unit: 'days' };
    expect(nextDue(rule, '2026-10-20T16:00:00Z', '2026-10-20T19:00:00Z', TZ)).toBe('2026-10-30T17:00:00.000Z');
  });

  it('rechnet in Wochen', () => {
    const rule: Recurrence = { type: 'after_completion', every: 2, unit: 'weeks' };
    expect(nextDue(rule, '2026-11-02T08:00:00Z', '2026-11-02T20:00:00Z', TZ)).toBe('2026-11-16T08:00:00.000Z');
  });

  it('zählt das Datum in Ortszeit, nicht in UTC (23:30 Uhr Ortszeit)', () => {
    const rule: Recurrence = { type: 'after_completion', every: 1, unit: 'days' };
    // erledigt Sa 14.11. 23:30 Berlin = 22:30Z → nächster Tag ist der 15.11.
    expect(nextDue(rule, '2026-11-10T17:00:00Z', '2026-11-14T22:30:00Z', TZ)).toBe('2026-11-15T17:00:00.000Z');
  });
});

describe('Zeitumstellung bei der Uhrzeit selbst', () => {
  it('eine nicht existierende Uhrzeit (02:30 am Umstellungstag) rutscht auf 03:30', () => {
    // So 22.03. 02:30 CET = 01:30Z; So 29.03. gibt es 02:30 nicht
    expect(nextDue(weekly([7]), '2026-03-22T01:30:00Z', '2026-03-23T12:00:00Z', TZ)).toBe('2026-03-29T01:30:00.000Z');
  });

  it('eine doppelte Uhrzeit (02:30 am 25.10.) nimmt das erste Vorkommen', () => {
    expect(nextDue(weekly([7]), '2026-10-18T00:30:00Z', '2026-10-19T12:00:00Z', TZ)).toBe('2026-10-25T00:30:00.000Z');
  });
});

describe('ungültige Eingaben', () => {
  it('lehnt ein unlesbares Datum ab', () => {
    expect(() => nextDue(weekly([6]), 'kaputt', '2026-10-19T12:00:00Z', TZ)).toThrow();
  });

  it('nennt beim unlesbaren bisherigen Termin die Eingabe in der Meldung', () => {
    expect(() => nextDue(weekly([6]), 'kaputt', '2026-10-19T12:00:00Z', TZ)).toThrow(
      'Der bisherige Termin ist kein gültiges Datum: kaputt',
    );
  });

  it('nennt beim unlesbaren Erledigungszeitpunkt die Eingabe in der Meldung', () => {
    expect(() => nextDue(weekly([6]), '2026-10-17T08:00:00Z', 'gestern', TZ)).toThrow(
      'Der Erledigungszeitpunkt ist kein gültiges Datum: gestern',
    );
  });
});

describe('stündlich', () => {
  const hourly = (every: number, window?: { from: string; to: string }): Recurrence => ({ type: 'fixed', freq: 'hourly', every, ...(window ? { window } : {}) });

  it('alle 3 Stunden ab dem bisherigen Termin', () => {
    expect(nextDue(hourly(3), '2026-11-10T08:00:00Z', '2026-11-10T08:30:00Z', TZ)).toBe('2026-11-10T11:00:00.000Z');
  });

  it('überspringt verpasste Termine: zu spät erledigt landet auf dem nächsten Raster-Termin danach', () => {
    expect(nextDue(hourly(3), '2026-11-10T08:00:00Z', '2026-11-10T15:00:00Z', TZ)).toBe('2026-11-10T17:00:00.000Z');
  });

  it('früh erledigt: trotzdem erst der Termin nach dem bisherigen', () => {
    expect(nextDue(hourly(1), '2026-11-10T08:00:00Z', '2026-11-10T06:00:00Z', TZ)).toBe('2026-11-10T09:00:00.000Z');
  });

  it('zählt echte Stunden über die Zeitumstellung (Herbst: 02:00 CEST → 02:00 CET)', () => {
    expect(nextDue(hourly(1), '2026-10-25T00:00:00Z', '2026-10-25T00:10:00Z', TZ)).toBe('2026-10-25T01:00:00.000Z');
    expect(nextDue(hourly(1), '2026-10-25T01:00:00Z', '2026-10-25T01:10:00Z', TZ)).toBe('2026-10-25T02:00:00.000Z');
  });

  it('zählt echte Stunden über die Zeitumstellung (Frühjahr: 01:00 CET → 03:00 CEST)', () => {
    expect(nextDue(hourly(1), '2026-03-29T00:00:00Z', '2026-03-29T00:10:00Z', TZ)).toBe('2026-03-29T01:00:00.000Z');
  });

  describe('mit Zeitfenster 08:00–20:00', () => {
    const win = { from: '08:00', to: '20:00' };

    it('Termine im Fenster bleiben (20:00 gehört noch dazu)', () => {
      // 17:00 Berlin → alle 3 Std. → 20:00
      expect(nextDue(hourly(3, win), '2026-11-10T16:00:00Z', '2026-11-10T16:10:00Z', TZ)).toBe('2026-11-10T19:00:00.000Z');
    });

    it('nach dem Fensterende rückt der Termin auf den Fensteranfang des nächsten Tages', () => {
      // 18:00 Berlin + 3 Std. = 21:00 → Mi 11.11. 08:00 (07:00Z)
      expect(nextDue(hourly(3, win), '2026-11-10T17:00:00Z', '2026-11-10T17:10:00Z', TZ)).toBe('2026-11-11T07:00:00.000Z');
    });

    it('vor dem Fensteranfang rückt der Termin auf den Anfang desselben Tages', () => {
      // 06:00 Berlin + 1 Std. = 07:00 → 08:00 (07:00Z)
      expect(nextDue(hourly(1, win), '2026-11-10T05:00:00Z', '2026-11-10T05:10:00Z', TZ)).toBe('2026-11-10T07:00:00.000Z');
    });

    it('der Fensteranfang gilt in Ortszeit über die Zeitumstellung (Herbst)', () => {
      // Sa 24.10. 18:00 CEST (16:00Z) + 3 Std. = 21:00 → So 25.10. 08:00 CET (07:00Z)
      expect(nextDue(hourly(3, win), '2026-10-24T16:00:00Z', '2026-10-24T16:10:00Z', TZ)).toBe('2026-10-25T07:00:00.000Z');
    });

    it('der Fensteranfang gilt in Ortszeit über die Zeitumstellung (Frühjahr)', () => {
      // Sa 28.03. 18:00 CET (17:00Z) + 3 Std. = 21:00 → So 29.03. 08:00 CEST (06:00Z)
      expect(nextDue(hourly(3, win), '2026-03-28T17:00:00Z', '2026-03-28T17:10:00Z', TZ)).toBe('2026-03-29T06:00:00.000Z');
    });
  });

  describe('Zeitfenster mit Minuten', () => {
    it('ein Termin vor 08:30 rückt auf 08:30, nicht auf 08:00', () => {
      // 07:00 Berlin + 1 Std. = 08:00 < 08:30 → 08:30 (07:30Z)
      expect(nextDue(hourly(1, { from: '08:30', to: '20:00' }), '2026-11-10T06:00:00Z', '2026-11-10T06:10:00Z', TZ)).toBe('2026-11-10T07:30:00.000Z');
    });

    it('ein Termin um 20:05 gehört zum Fenster bis 20:15', () => {
      expect(nextDue(hourly(1, { from: '08:30', to: '20:15' }), '2026-11-10T18:05:00Z', '2026-11-10T18:10:00Z', TZ)).toBe('2026-11-10T19:05:00.000Z');
    });

    it('der Fensteranfang selbst gehört dazu (08:00 bleibt 08:00)', () => {
      expect(nextDue(hourly(1, { from: '08:00', to: '20:00' }), '2026-11-10T06:00:00Z', '2026-11-10T06:10:00Z', TZ)).toBe('2026-11-10T07:00:00.000Z');
    });

    it('die Minuten zählen mit: 20:30 liegt nach 20:00, 08:10 nach 08:00 im Fenster', () => {
      const win = { from: '08:00', to: '20:00' };
      // 19:30 + 1 Std. = 20:30 → nächster Tag 08:00 (07:00Z)
      expect(nextDue(hourly(1, win), '2026-11-10T18:30:00Z', '2026-11-10T18:40:00Z', TZ)).toBe('2026-11-11T07:00:00.000Z');
      // 07:10 + 1 Std. = 08:10 bleibt
      expect(nextDue(hourly(1, win), '2026-11-10T06:10:00Z', '2026-11-10T06:20:00Z', TZ)).toBe('2026-11-10T07:10:00.000Z');
    });
  });

  it('nach Erledigung in Stunden: Erledigungszeitpunkt + N Stunden', () => {
    const rule: Recurrence = { type: 'after_completion', every: 4, unit: 'hours' };
    expect(nextDue(rule, '2026-11-10T08:00:00Z', '2026-11-10T10:07:33Z', TZ)).toBe('2026-11-10T14:07:00.000Z');
  });
});

describe('Toleranz bei Verspätung', () => {
  // Sa alle 2 Wochen, fällig Sa 14.11. 10:00, Toleranz 3 Tage
  const sat: Recurrence = { type: 'fixed', freq: 'weekly', every: 2, weekdays: [6], lateTolerance: 3 };
  const due = '2026-11-14T09:00:00Z';

  it('Mo 16.11. erledigt (2 Tage zu spät): Plan bleibt, Sa 28.11.', () => {
    expect(nextDue(sat, due, '2026-11-16T12:00:00Z', TZ)).toBe('2026-11-28T09:00:00.000Z');
  });

  it('genau am letzten Toleranztag (Di 17.11., 3 Tage): Plan bleibt', () => {
    expect(nextDue(sat, due, '2026-11-17T12:00:00Z', TZ)).toBe('2026-11-28T09:00:00.000Z');
  });

  it('Mi 18.11. erledigt (4 Tage zu spät): Plan beginnt neu, Sa 5.12.', () => {
    expect(nextDue(sat, due, '2026-11-18T12:00:00Z', TZ)).toBe('2026-12-05T09:00:00.000Z');
  });

  it('ohne lateTolerance bleibt es beim festen Plan', () => {
    const { lateTolerance: _t, ...plain } = sat as Extract<Recurrence, { type: 'fixed' }>;
    expect(nextDue(plain, due, '2026-11-18T12:00:00Z', TZ)).toBe('2026-11-28T09:00:00.000Z');
  });

  it('Toleranz 0: schon ein Tag zu spät startet neu', () => {
    expect(nextDue({ ...sat, lateTolerance: 0 } as Recurrence, due, '2026-11-14T12:00:00Z', TZ)).toBe('2026-11-28T09:00:00.000Z');
    expect(nextDue({ ...sat, lateTolerance: 0 } as Recurrence, due, '2026-11-16T12:00:00Z', TZ)).toBe('2026-12-05T09:00:00.000Z');
  });

  it('der Verspätungstag zählt in Ortszeit (Mi 23:30 Berlin = 22:30Z)', () => {
    expect(nextDue(sat, due, '2026-11-18T22:30:00Z', TZ)).toBe('2026-12-05T09:00:00.000Z');
    expect(nextDue(sat, due, '2026-11-17T22:30:00Z', TZ)).toBe('2026-11-28T09:00:00.000Z'); // Di 23:30 = noch L=3
  });

  it('Neustart mit mehreren Wochentagen: erster Wochentag der Woche + every Wochen', () => {
    const rule: Recurrence = { type: 'fixed', freq: 'weekly', every: 1, weekdays: [2, 6], lateTolerance: 1 };
    // fällig Di 10.11., erledigt Fr 13.11. (L=3 > 1) → Woche Mo 9.11. + 1 Woche, Di = 17.11.
    expect(nextDue(rule, '2026-11-10T09:00:00Z', '2026-11-13T12:00:00Z', TZ)).toBe('2026-11-17T09:00:00.000Z');
  });

  it('Neustart über die Zeitumstellung behält die Ortszeit', () => {
    // Sa 17.10. 10:00 CEST fällig, erledigt Do 22.10. (L=5), Woche Mo 19.10. + 2 Wochen = Sa 7.11. 10:00 CET
    expect(nextDue({ ...sat, lateTolerance: 3 } as Recurrence, '2026-10-17T08:00:00Z', '2026-10-22T12:00:00Z', TZ)).toBe('2026-11-07T09:00:00.000Z');
  });

  describe('monatlich', () => {
    const m28: Recurrence = { type: 'fixed', freq: 'monthly', every: 1, monthDay: 28, lateTolerance: 7 };

    it('innerhalb der Toleranz bleibt der Plan (fällig 28.11., erledigt 3.12.)', () => {
      expect(nextDue(m28, '2026-11-28T09:00:00Z', '2026-12-03T12:00:00Z', TZ)).toBe('2026-12-28T09:00:00.000Z');
    });

    it('darüber beginnt der Plan im Monat der Erledigung neu: Dez. + 1 Monat', () => {
      expect(nextDue({ ...m28, lateTolerance: 3 } as Recurrence, '2026-11-28T09:00:00Z', '2026-12-03T12:00:00Z', TZ)).toBe('2027-01-28T09:00:00.000Z');
    });

    it('Monatsende wird gekappt (monthDay 31, Neustart im Januar + 1 Monat)', () => {
      const r: Recurrence = { type: 'fixed', freq: 'monthly', every: 1, monthDay: 31, lateTolerance: 0 };
      expect(nextDue(r, '2026-12-31T09:00:00Z', '2027-01-05T12:00:00Z', TZ)).toBe('2027-02-28T09:00:00.000Z');
    });
  });
});
