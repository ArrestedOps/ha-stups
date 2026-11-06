import { describe, expect, it } from 'vitest';
import { withLanguage } from '../src/i18n/index.js';
import { cleanCategory, categoryKey, categoryOfEntity, categoryOfTemplate, categoryOfWatcher, mergeCategory, MAX_CATEGORY } from '../src/watcher-categories.js';
import { watcherTemplates } from '../src/watcher-templates.js';

describe('Kategorie aus der Vorlage', () => {
  it('jede Vorlage mit Wächter bekommt eine Kategorie, Vorlagen ohne Gerät nicht', () => {
    for (const tpl of watcherTemplates()) {
      if (tpl.kind === 'watcher') expect(categoryOfTemplate(tpl.id), tpl.id).toBeTruthy();
      else expect(categoryOfTemplate(tpl.id), tpl.id).toBeNull();
    }
  });

  it('deutsche und englische Namen', () => {
    expect(categoryOfTemplate('battery')).toBe('Batterien');
    expect(categoryOfTemplate('washer')).toBe('Haushaltsgeräte');
    expect(categoryOfTemplate('dryer')).toBe('Haushaltsgeräte');
    expect(categoryOfTemplate('dishwasher')).toBe('Haushaltsgeräte');
    expect(categoryOfTemplate('vacuum')).toBe('Haushaltsgeräte');
    expect(categoryOfTemplate('bins')).toBe('Müll & Abfall');
    expect(categoryOfTemplate('rain')).toBe('Wetter');
    expect(withLanguage('en', () => categoryOfTemplate('battery'))).toBe('Batteries');
    expect(withLanguage('en', () => categoryOfTemplate('bins'))).toBe('Waste & recycling');
  });
});

describe('Kategorie aus der Entität', () => {
  const c = (entityId: string, extra: Record<string, unknown> = {}) => categoryOfEntity({ entityId, ...extra });

  it('Domäne und Geräteklasse bestimmen die Kategorie', () => {
    expect(c('sensor.x_battery', { deviceClass: 'battery' })).toBe('Batterien');
    expect(c('sensor.handy_akku', { unit: '%' })).toBe('Batterien');
    expect(c('calendar.abfall')).toBe('Müll & Abfall');
    expect(c('calendar.familie')).toBe('Termine & Kalender');
    expect(c('weather.home')).toBe('Wetter');
    expect(c('person.rene')).toBe('Anwesenheit');
    expect(c('device_tracker.handy')).toBe('Anwesenheit');
    expect(c('vacuum.robi')).toBe('Haushaltsgeräte');
    expect(c('sensor.waschmaschine_leistung', { deviceClass: 'power', unit: 'W' })).toBe('Haushaltsgeräte');
    expect(c('sensor.keller_temperatur', { deviceClass: 'temperature' })).toBe('Klima');
    expect(c('sensor.bad_feuchte', { deviceClass: 'humidity' })).toBe('Klima');
    expect(c('sensor.zaehler', { deviceClass: 'energy' })).toBe('Energie');
    expect(c('binary_sensor.tuer', { deviceClass: 'door' })).toBe('Sicherheit');
    expect(c('binary_sensor.rauchmelder', { deviceClass: 'smoke' })).toBe('Sicherheit');
    expect(c('lock.haustuer')).toBe('Sicherheit');
  });

  it('ohne Treffer: „Sonstiges", nie leer', () => {
    expect(c('sensor.irgendwas')).toBe('Sonstiges');
    expect(withLanguage('en', () => c('sensor.irgendwas'))).toBe('Other');
  });

  it('der Name hilft, wenn die Geräteklasse fehlt', () => {
    expect(c('sensor.steckdose_1', { name: 'Trockner Steckdose Leistung' })).toBe('Haushaltsgeräte');
    expect(c('sensor.x', { name: 'Müllabfuhr' })).toBe('Müll & Abfall');
  });
});

describe('Kategorie eines vorhandenen Wächters', () => {
  it('Kalender-Wächter nach Entität, Vorhersage ist Wetter, Wächtername zählt mit', () => {
    expect(categoryOfWatcher({ name: 'Tonnen rausstellen', trigger: { entityId: 'calendar.abfall', kind: 'calendar_event' } })).toBe('Müll & Abfall');
    expect(categoryOfWatcher({ name: 'Wäsche rein, es regnet', trigger: { entityId: 'weather.home', kind: 'forecast' } })).toBe('Wetter');
    expect(categoryOfWatcher({ name: 'Waschmaschine fertig', trigger: { entityId: 'sensor.steckdose', kind: 'below' } })).toBe('Haushaltsgeräte');
    expect(categoryOfWatcher({ name: 'Batterie schwach: Tür', trigger: { entityId: 'sensor.tuer_batterie', kind: 'below' } }, { deviceClass: 'battery' })).toBe('Batterien');
  });
});

describe('Normalisieren und Zusammenlegen', () => {
  it('trimmt, faltet Leerräume, leer wird null, zu lang ist ein Fehler', () => {
    expect(cleanCategory('  Haus   Technik ')).toBe('Haus Technik');
    expect(cleanCategory('   ')).toBeNull();
    expect(cleanCategory(null)).toBeNull();
    expect(cleanCategory(undefined)).toBeNull();
    expect(cleanCategory('x'.repeat(MAX_CATEGORY))).toHaveLength(MAX_CATEGORY);
    expect(() => cleanCategory('x'.repeat(MAX_CATEGORY + 1))).toThrow(/zu lang/);
    expect(() => cleanCategory(5)).toThrow(/Text/);
  });

  it('gleiche Namen ohne Beachtung der Groß-/Kleinschreibung haben denselben Schlüssel', () => {
    expect(categoryKey('Garten')).toBe(categoryKey(' garten '));
    expect(categoryKey('Garten')).not.toBe(categoryKey('Keller'));
  });

  it('die deutsche und die englische Standardkategorie sind dieselbe', () => {
    expect(categoryKey('Batterien')).toBe(categoryKey('batteries'));
    expect(categoryKey('Müll & Abfall')).toBe(categoryKey('Waste & recycling'));
  });

  it('mergeCategory übernimmt die Schreibweise der ersten vorhandenen', () => {
    expect(mergeCategory('garten', ['Garten', 'Keller'])).toBe('Garten');
    expect(mergeCategory('Neu', ['Garten'])).toBe('Neu');
    expect(mergeCategory(null, ['Garten'])).toBeNull();
    expect(mergeCategory('Batteries', ['Batterien'])).toBe('Batterien');
  });
});
