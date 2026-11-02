import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type QuickContext } from '../src/lib/quickadd';
import { blockingProblem, chipLabel } from '../src/lib/quickadd/labels';

const TZ = 'Europe/Berlin';
const NOW = Date.parse('2026-11-02T09:00:00Z'); // Montag, 10:00 Berlin
const ctx: QuickContext = {
  now: NOW,
  tz: TZ,
  lang: 'de',
  defaultTime: '09:00',
  people: [
    { id: 'p-ben', name: 'Ben', displayName: 'Ben' },
    { id: 'p-anna', name: 'Anna', displayName: 'Anna' },
    { id: 'p-annabell', name: 'Annabell', displayName: 'Annabell' },
  ],
  categories: [{ id: 'c-haus', name: 'Haushalt' }],
};
const labels = (text: string) => {
  const r = parseQuickAdd(text, ctx);
  return r.tokens.map((t) => chipLabel(t, r, TZ, NOW));
};

describe('Chips der Schnell-Eingabe', () => {
  it('Datum mit Standard-Uhrzeit, wenn keine Uhrzeit dasteht', () => {
    expect(labels('A morgen')).toEqual(['Di 3. Nov · 09:00']);
  });

  it('Datum und Uhrzeit getrennt, wenn beide dastehen (jedes lässt sich einzeln zurücknehmen)', () => {
    expect(labels('A morgen 19 Uhr')).toEqual(['Di 3. Nov', '19:00']);
  });

  it('Uhrzeit allein nennt den Tag dazu', () => {
    expect(labels('A 19 Uhr')).toEqual(['heute 19:00']);
  });

  it('ein anderes Jahr steht dabei', () => {
    expect(labels('A 1.12.2027')).toEqual(['Mi 1. Dez 2027 · 09:00']);
  });

  it('Person, Kategorie, Wiederholung, Priorität', () => {
    expect(labels('A @Ben #Haushalt !')).toEqual(['@Ben', 'Haushalt', 'Priorität mittel']);
    expect(labels('A !!')).toEqual(['Priorität hoch']);
    expect(labels('A jeden Montag')).toEqual(['jeden Montag']);
    expect(labels('A #Reisen')).toEqual(['neu: Reisen']);
  });

  it('Unbekannte und mehrdeutige Personen sind Warnungen', () => {
    expect(labels('A @Niemand')).toEqual(['„Niemand" unbekannt']);
    expect(labels('A @an')).toEqual(['„an" nicht eindeutig']);
  });

  it('Anlegen ist gesperrt, solange eine Person nicht passt; Kategorien und alles andere sperren nie', () => {
    expect(blockingProblem(parseQuickAdd('A @Niemand', ctx))).toMatch(/gibt es nicht/);
    expect(blockingProblem(parseQuickAdd('A @an', ctx))).toMatch(/mehrere Personen/);
    expect(blockingProblem(parseQuickAdd('A @Ben', ctx))).toBeNull();
    expect(blockingProblem(parseQuickAdd('A #Reisen morgen !', ctx))).toBeNull();
    expect(blockingProblem(parseQuickAdd('A', ctx))).toBeNull();
  });
});
