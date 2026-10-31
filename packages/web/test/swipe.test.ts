import { describe, expect, it } from 'vitest';
import { cardTargets, columnForDue, swipeTarget, type SwipeColumn } from '../src/lib/swipe';

const col = (id: string, extra: Partial<SwipeColumn> = {}): SwipeColumn => ({
  id,
  name: id,
  isDone: false,
  isPlanned: false,
  ...extra,
});

// Offen | Geplant | In Arbeit | Erledigt
const columns = [col('offen'), col('geplant', { isPlanned: true }), col('arbeit'), col('erledigt', { isDone: true })];

describe('swipeTarget', () => {
  it('nach rechts: nächster Status, „Geplant" wird übersprungen', () => {
    expect(swipeTarget(columns, 'offen', 'right')?.id).toBe('arbeit');
    expect(swipeTarget(columns, 'arbeit', 'right')?.id).toBe('erledigt');
  });

  it('nach links: voriger Status, „Geplant" wird übersprungen', () => {
    expect(swipeTarget(columns, 'erledigt', 'left')?.id).toBe('arbeit');
    expect(swipeTarget(columns, 'arbeit', 'left')?.id).toBe('offen');
  });

  it('am Rand gibt es kein Ziel', () => {
    expect(swipeTarget(columns, 'offen', 'left')).toBeNull();
    expect(swipeTarget(columns, 'erledigt', 'right')).toBeNull();
  });

  it('aus „Geplant": nach rechts geht es weiter, nach links nicht (die Karte würde zurückspringen)', () => {
    expect(swipeTarget(columns, 'geplant', 'right')?.id).toBe('arbeit');
    expect(swipeTarget(columns, 'geplant', 'left')).toBeNull();
  });

  it('ohne „Geplant"-Spalte wie gewohnt Nachbar für Nachbar', () => {
    const plain = [col('a'), col('b'), col('c', { isDone: true })];
    expect(swipeTarget(plain, 'a', 'right')?.id).toBe('b');
    expect(swipeTarget(plain, 'c', 'left')?.id).toBe('b');
  });

  it('liefert null für eine unbekannte Spalte', () => {
    expect(swipeTarget(columns, 'gibt-es-nicht', 'right')).toBeNull();
  });

  it('mehrere „Geplant"-Spalten werden alle übersprungen', () => {
    const odd = [col('a'), col('p1', { isPlanned: true }), col('p2', { isPlanned: true }), col('b')];
    expect(swipeTarget(odd, 'a', 'right')?.id).toBe('b');
  });
});

describe('cardTargets (Ziele im Menü)', () => {
  it('„Geplant" erscheint nur für Karten mit Termin nach heute', () => {
    expect(cardTargets(columns, true).map((c) => c.id)).toEqual(['offen', 'geplant', 'arbeit', 'erledigt']);
    expect(cardTargets(columns, false).map((c) => c.id)).toEqual(['offen', 'arbeit', 'erledigt']);
  });

  it('„Offen" erscheint nicht für Karten mit Termin nach heute, die Karte käme sofort zurück nach „Geplant"', () => {
    expect(cardTargets(columns, true, 'offen').map((c) => c.id)).toEqual(['geplant', 'arbeit', 'erledigt']);
  });

  it('ohne „Geplant"-Spalte bleibt alles erreichbar', () => {
    const plain = [col('a'), col('b'), col('c', { isDone: true })];
    expect(cardTargets(plain, true).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('columnForDue (neue Karte)', () => {
  it('„Geplant" bleibt nur mit einem Termin nach heute, sonst landet die Karte in der ersten offenen Spalte', () => {
    expect(columnForDue(columns, 'geplant', true)).toBe('geplant');
    expect(columnForDue(columns, 'geplant', false)).toBe('offen'); // z. B. Termin heute 18:06 oder keiner
  });

  it('andere Spalten bleiben, wie sie sind', () => {
    expect(columnForDue(columns, 'arbeit', false)).toBe('arbeit');
    expect(columnForDue(columns, 'arbeit', true)).toBe('arbeit');
    expect(columnForDue(columns, 'erledigt', false)).toBe('erledigt');
    expect(columnForDue(columns, 'offen', true)).toBe('offen'); // der Server legt sie von selbst nach „Geplant"
  });

  it('ohne offene Spalte bleibt alles unverändert', () => {
    const only = [col('geplant', { isPlanned: true }), col('erledigt', { isDone: true })];
    expect(columnForDue(only, 'geplant', false)).toBe('geplant');
  });
});