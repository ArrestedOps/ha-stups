import { beforeEach, describe, expect, it } from 'vitest';
import { ADDON_DEFAULTS, addonFallbackOptions, addonImportOf, applyStartupOptions } from '../src/addon-options.js';
import { parseOptions } from '../src/config.js';
import { openDb } from '../src/db.js';
import { createStore, type Store } from '../src/store.js';

let store: Store;
const log = { messages: [] as string[], warnings: [] as string[], info(m: string) { this.messages.push(m); }, warn(m: string) { this.warnings.push(m); } };

beforeEach(() => {
  store = createStore(openDb(':memory:'), { timeZone: () => 'Europe/Berlin' });
  log.messages = [];
  log.warnings = [];
});

const input = (patch: Partial<ReturnType<typeof addonImportOf>> = {}) => ({ users: [], accessMode: 'selected' as const, ...ADDON_DEFAULTS, ...patch });
const anna = { name: 'Anna', notify: ['mobile_app_a'] };
const ben = { name: 'Ben', notify: ['mobile_app_b'] };

describe('Add-on-Optionen einmalig übernehmen', () => {
  it('verwaltete Installation: Personen und Geräte kommen in die Datenbank, der Zugriff folgt, die App ist danach frei', () => {
    store.applyManagedPeople([anna], 'selected');
    expect(store.isManaged()).toBe(true);
    const r = store.importAddonOptions(input({ users: [anna, ben], accessMode: 'everyone' }), ADDON_DEFAULTS);
    expect(r).toMatchObject({ people: 2, accessMode: 'everyone', settings: [] });
    expect(store.isManaged()).toBe(false);
    expect(store.people().map((p) => [p.name, p.notifyServices])).toEqual([['Anna', ['mobile_app_a']], ['Ben', ['mobile_app_b']]]);
    expect(store.getAccessMode()).toBe('everyone');
  });

  it('entfernt niemanden: wer in der Datenbank Person ist, aber nicht in users steht, bleibt Person', () => {
    store.syncPeople([{ name: 'Conny', notify: [] }]);
    store.importAddonOptions(input({ users: [anna] }), ADDON_DEFAULTS);
    expect(store.people().map((p) => p.name).sort()).toEqual(['Anna', 'Conny']);
  });

  it('leere, doppelte und anders geschriebene Namen: keine doppelten Personen, kein Absturz', () => {
    store.syncPeople([{ name: 'Anna', notify: [] }]);
    expect(() => store.importAddonOptions(input({ users: [{ name: '', notify: [] }, { name: '  ', notify: [] }, { name: 'anna', notify: ['mobile_app_a'] }, ben, ben] }), ADDON_DEFAULTS)).not.toThrow();
    expect(store.people().map((p) => p.name).sort()).toEqual(['Anna', 'Ben']);
  });

  it('ohne users bleibt es beim bisherigen Verhalten: frische Datenbank „nur freigegebene“, mit Person „alle“', () => {
    expect(store.importAddonOptions(input(), ADDON_DEFAULTS)).toMatchObject({ people: 0, accessMode: null });
    expect(store.getAccessMode()).toBe('selected');
    expect(store.isManaged()).toBe(false);
    const other = createStore(openDb(':memory:'), { timeZone: () => 'Europe/Berlin' });
    other.syncPeople([{ name: 'Conny', notify: [] }]);
    other.importAddonOptions(input(), ADDON_DEFAULTS);
    expect(other.getAccessMode()).toBe('everyone');
  });

  it('Standardwerte werden nicht in die Einstellungen geschrieben', () => {
    const r = store.importAddonOptions(input(), ADDON_DEFAULTS);
    expect(r).toMatchObject({ settings: [], skipped: [] });
    expect(store.getSettings()).toMatchObject({ dashboardPath: null, dailySummaryTime: null, overdueNagTime: null });
  });

  it('abweichende Werte kommen in die Einstellungen, eine schon gesetzte Einstellung der App bleibt', () => {
    store.setSettings({ dailySummaryTime: '06:00' });
    const r = store.importAddonOptions(input({ dashboardPath: '/lovelace/home', dailySummaryTime: '07:30', overdueNagTime: '19:45' }), ADDON_DEFAULTS);
    expect(r!.settings.sort()).toEqual(['dashboardPath', 'overdueNagTime']);
    expect(store.getSettings()).toMatchObject({ dashboardPath: '/lovelace/home', dailySummaryTime: '06:00', overdueNagTime: '19:45' });
  });

  it('ungültige Werte werden übersprungen und genannt, die übrigen kommen an, der Start gelingt', () => {
    const r = store.importAddonOptions(input({ dailySummaryTime: '25:00', dashboardPath: 'ohne-schraegstrich', overdueNagTime: '20:00' }), ADDON_DEFAULTS);
    expect(r).toMatchObject({ settings: ['overdueNagTime'], skipped: expect.arrayContaining(['dailySummaryTime', 'dashboardPath']) });
    expect(store.getSettings()).toMatchObject({ dashboardPath: null, dailySummaryTime: null, overdueNagTime: '20:00' });
  });

  it('läuft genau einmal: der zweite Aufruf mit anderen Optionen ändert nichts', () => {
    store.importAddonOptions(input({ users: [anna] }), ADDON_DEFAULTS);
    expect(store.importAddonOptions(input({ users: [ben], dashboardPath: '/x' }), ADDON_DEFAULTS)).toBeNull();
    expect(store.people().map((p) => p.name)).toEqual(['Anna']);
    expect(store.getSettings().dashboardPath).toBeNull();
  });
});

describe('Optionen im Add-on-Betrieb', () => {
  const raw = parseOptions({ users: [anna], access_mode: 'everyone', dashboard_path: '/x', daily_summary_time: '05:00', overdue_nag_time: '05:30', log_level: 'debug' });

  it('nach der Übernahme gelten nur noch die Standardwerte, das Log-Level bleibt', () => {
    expect(addonFallbackOptions(raw)).toMatchObject({ users: [], accessMode: 'selected', dashboardPath: '/', dailySummaryTime: '08:00', overdueNagTime: '18:00', logLevel: 'debug' });
  });

  it('Add-on: gefülltes users wird übernommen und sperrt die App nicht', () => {
    applyStartupOptions(store, { mode: 'addon', options: raw }, log);
    expect(store.isManaged()).toBe(false);
    expect(store.people().map((p) => p.name)).toEqual(['Anna']);
    expect(log.messages.join('\n')).toContain('übernommen');
  });

  it('Add-on: ein zweiter Start ändert nichts, auch wenn die Optionen anders lauten', () => {
    applyStartupOptions(store, { mode: 'addon', options: raw }, log);
    applyStartupOptions(store, { mode: 'addon', options: parseOptions({ users: [ben] }) }, log);
    expect(store.people().map((p) => p.name)).toEqual(['Anna']);
  });

  it('Add-on: ein ungültiger Wert ergibt eine Warnung und keinen Abbruch', () => {
    applyStartupOptions(store, { mode: 'addon', options: { ...raw, dailySummaryTime: '25:00' } }, log);
    expect(log.warnings.join('\n')).toContain('dailySummaryTime');
  });

  it('Add-on: ein Datenbankfehler im Import bricht den Start nicht ab, er wird gemeldet (der nächste Start versucht es erneut)', () => {
    const broken = { importAddonOptions: () => { throw new Error('disk full'); }, clearManaged: () => undefined } as unknown as Store;
    expect(() => applyStartupOptions(broken, { mode: 'addon', options: raw }, log)).not.toThrow();
    expect(log.warnings.join('\n')).toContain('disk full');
  });

  it('Add-on: eine übrig gebliebene Sperre (Datenbank mit Marker und managedByOptions, etwa nach einem Umzug aus Docker) wird gelöst', () => {
    store.applyManagedPeople([anna], 'selected');
    store.putRawSetting('addonOptionsImported', '2026-11-10T00:00:00.000Z');
    expect(store.isManaged()).toBe(true);
    applyStartupOptions(store, { mode: 'addon', options: parseOptions({}) }, log);
    expect(store.isManaged()).toBe(false);
  });

  it('Add-on: ungültige Uhrzeiten aus der Konfiguration (runtime.invalidOptions) werden als Warnung genannt', () => {
    applyStartupOptions(store, { mode: 'addon', options: parseOptions({}), invalidOptions: ['overdue_nag_time'] }, log);
    expect(log.warnings.join('\n')).toContain('overdue_nag_time');
  });

  it('Docker: kein Import, gefülltes users sperrt die App wie bisher', () => {
    for (const mode of ['standalone', 'standalone-ha'] as const) {
      const s = createStore(openDb(':memory:'), { timeZone: () => 'Europe/Berlin' });
      applyStartupOptions(s, { mode, options: raw }, log);
      expect(s.isManaged(), mode).toBe(true);
      expect(s.rawSetting('addonOptionsImported'), mode).toBeNull();
    }
  });
});
