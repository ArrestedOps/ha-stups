import { describe, expect, it } from 'vitest';
import { withLanguage } from '../src/i18n/index.js';
import { stateText } from '../src/state-text.js';

describe('Zustand in Worten (stateText)', () => {
  it('bekannte Zustände auf Deutsch', () => {
    expect(stateText('off')).toBe('aus');
    expect(stateText('on')).toBe('an');
    expect(stateText('not_home')).toBe('unterwegs');
    expect(stateText('unavailable')).toBe('nicht erreichbar');
  });

  it('Zahlen mit Einheit und deutschem Komma, höchstens eine Nachkommastelle', () => {
    expect(stateText('412', 'W')).toBe('412 W');
    expect(stateText('3', '%')).toBe('3 %');
    expect(stateText('2.44', 'W')).toBe('2,4 W');
    expect(stateText('1234.5', 'kWh')).toBe('1.234,5 kWh');
  });

  it('Zahlen ohne Einheit bleiben Zahlen', () => {
    expect(stateText('21.5')).toBe('21,5');
  });

  it('Unbekanntes erscheint, wie es ist', () => {
    expect(stateText('heating')).toBe('heating');
    expect(stateText('')).toBe('');
  });

  it('auf Englisch: Wörter und englische Zahlen', () => {
    withLanguage('en', () => {
      expect(stateText('off')).toBe('off');
      expect(stateText('not_home')).toBe('away');
      expect(stateText('2.44', 'W')).toBe('2.4 W');
      expect(stateText('1234.5', 'kWh')).toBe('1,234.5 kWh');
    });
  });
});
