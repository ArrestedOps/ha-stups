import { describe, expect, it } from 'vitest';
import { matchesQuery } from '../src/lib/search';

describe('matchesQuery', () => {
  it('eine leere Eingabe passt zu allem', () => {
    expect(matchesQuery('', 'Bad putzen')).toBe(true);
    expect(matchesQuery('   ', null)).toBe(true);
  });

  it('Groß- und Kleinschreibung und Akzente zählen nicht', () => {
    expect(matchesQuery('MÜLL', 'Müll rausbringen')).toBe(true);
    expect(matchesQuery('muell', 'Müll rausbringen')).toBe(false);
    expect(matchesQuery('mull', 'Müll rausbringen')).toBe(true);
    expect(matchesQuery('cafe', 'Café Beck')).toBe(true);
  });

  it('jedes Wort muss vorkommen, in beliebiger Reihenfolge und auch über mehrere Texte', () => {
    expect(matchesQuery('putzen bad', 'Bad putzen')).toBe(true);
    expect(matchesQuery('bad fenster', 'Bad putzen')).toBe(false);
    expect(matchesQuery('bad schimmel', 'Bad putzen', 'Schimmel an der Decke')).toBe(true);
  });

  it('fehlende Texte stören nicht', () => {
    expect(matchesQuery('x', undefined, null)).toBe(false);
    expect(matchesQuery('bad', 'Bad', null, undefined)).toBe(true);
  });
});
