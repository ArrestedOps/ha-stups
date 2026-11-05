import { describe, expect, it } from 'vitest';
import { isDashboardPath, readHaDefaultPanel, resolveDashboardPath } from '../src/lib/dashboard';

describe('resolveDashboardPath: Wahl der Person, sonst Standard von Home Assistant, sonst Option der App, sonst „/"', () => {
  it.each([
    ['Wahl der Person gewinnt', { person: '/dashboard-handy', haDefaultPanel: 'lovelace', addon: '/lovelace/0' }, '/dashboard-handy', 'person'],
    ['nichts gewählt: Standard von Home Assistant', { person: null, haDefaultPanel: 'dashboard-wohnung', addon: '/lovelace/0' }, '/dashboard-wohnung', 'ha'],
    ['Übersicht als Standard von Home Assistant', { person: null, haDefaultPanel: 'lovelace', addon: '/lovelace/0' }, '/lovelace', 'ha'],
    ['kein Standard lesbar: Option der App', { person: null, haDefaultPanel: null, addon: '/lovelace/0' }, '/lovelace/0', 'addon'],
    ['Person fehlt ganz', { haDefaultPanel: null, addon: '/x' }, '/x', 'addon'],
    ['nichts: Wurzel', { person: null, haDefaultPanel: null, addon: null }, '/', 'root'],
    ['alles leer', {}, '/', 'root'],
    ['ungültige Wahl der Person (Adresse) wird übergangen', { person: 'https://evil.example', haDefaultPanel: 'lovelace' }, '/lovelace', 'ha'],
    ['ungültige Wahl (doppelter Schrägstrich)', { person: '//evil.example', haDefaultPanel: null, addon: '/a' }, '/a', 'addon'],
    ['ungültiger Standard von Home Assistant (Schrägstrich, Leerzeichen)', { person: null, haDefaultPanel: '../x y', addon: '/a' }, '/a', 'addon'],
    ['ungültige Option der App', { person: null, haDefaultPanel: null, addon: 'lovelace/0' }, '/', 'root'],
    ['leere Wahl', { person: '', haDefaultPanel: null, addon: null }, '/', 'root'],
  ])('%s', (_n, input, path, source) => {
    expect(resolveDashboardPath(input)).toEqual({ path, source });
  });
});

describe('isDashboardPath', () => {
  it.each([['/', true], ['/lovelace/0', true], ['//x', false], ['x', false], ['/a\\b', false], ['https://x', false], ['/a b', false], ['/' + 'a'.repeat(200), false], [null, false]])('%j → %s', (v, ok) => {
    expect(isDashboardPath(v)).toBe(ok);
  });
});

describe('readHaDefaultPanel: defaultPanel aus dem Speicher der Home-Assistant-Seite', () => {
  const win = (getItem: (k: string) => string | null) => ({ parent: { localStorage: { getItem } } }) as never;
  it('liest den JSON-Text', () => {
    expect(readHaDefaultPanel(win((k) => (k === 'defaultPanel' ? '"dashboard-handy"' : null)))).toBe('dashboard-handy');
  });
  it.each([['nicht gesetzt', null], ['kein JSON', 'lovelace'], ['kein Text', '5'], ['Objekt', '{"a":1}'], ['ungültige Kennung', '"a/b"'], ['leer', '""']])('%s → null', (_n, raw) => {
    expect(readHaDefaultPanel(win(() => raw))).toBeNull();
  });
  it('Zugriff verweigert oder Speicher fehlt → null, nie ein Fehler', () => {
    expect(readHaDefaultPanel(win(() => { throw new Error('SecurityError'); }))).toBeNull();
    expect(readHaDefaultPanel({ parent: {} } as never)).toBeNull();
    expect(readHaDefaultPanel(undefined)).toBeNull();
  });
  it('ohne Elternfenster (kein Home Assistant) → null', () => {
    const self: { parent?: unknown } = {};
    self.parent = self;
    expect(readHaDefaultPanel(self as never)).toBeNull();
  });
});
