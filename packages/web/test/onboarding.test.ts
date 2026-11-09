import { describe, expect, it } from 'vitest';
import {
  assigneeIds,
  buildCandidates,
  COMPANION_APP_LINKS,
  defaultSelection,
  matchDevices,
  nextOpenStep,
  progressOf,
  rankHits,
  stepsFor,
  toggleSelection,
} from '../src/lib/onboarding';
import type { WatcherSuggestion } from '../src/lib/watcher-types';

describe('Onboarding: Schritte je Rolle', () => {
  it('Administrator mit allem: Willkommen, Personen, Wächter, Test, Fertig', () => {
    expect(stepsFor({ isAdmin: true, isChild: false }, { people: true, watcher: true })).toEqual(['welcome', 'people', 'watcher', 'test', 'done']);
  });

  it('ohne Personen-Schritt (Container mit eigenen Konten) und ohne Wächter (kein Home Assistant, kein Recht)', () => {
    expect(stepsFor({ isAdmin: true, isChild: false }, { people: false, watcher: true })).toEqual(['welcome', 'watcher', 'test', 'done']);
    expect(stepsFor({ isAdmin: true, isChild: false }, { people: true, watcher: false })).toEqual(['welcome', 'people', 'test', 'done']);
  });

  it('Mitglied: Handy verbinden, Farbe; Kind: nur Handy verbinden', () => {
    expect(stepsFor({ isAdmin: false, isChild: false }, { people: true, watcher: true })).toEqual(['phone', 'color']);
    expect(stepsFor({ isAdmin: false, isChild: true }, { people: true, watcher: true })).toEqual(['phone']);
  });
});

describe('Onboarding: Fortschritt', () => {
  const steps = stepsFor({ isAdmin: true, isChild: false }, { people: true, watcher: true });

  it('springt zum gemerkten Schritt, sonst zum ersten', () => {
    expect(nextOpenStep(steps, 'watcher')).toBe('watcher');
    expect(nextOpenStep(steps, undefined)).toBe('welcome');
    expect(nextOpenStep(steps, null)).toBe('welcome');
  });

  it('ein gemerkter Schritt, den es für diese Person nicht gibt, fällt auf den ersten zurück', () => {
    expect(nextOpenStep(['phone', 'color'], 'watcher')).toBe('phone');
    expect(nextOpenStep(steps, 'fertig')).toBe('welcome');
  });

  it('Zähler für die Leiste: Position (ab 1) und Zahl der Schritte', () => {
    expect(progressOf(steps, 'welcome')).toEqual({ index: 1, total: 5 });
    expect(progressOf(steps, 'test')).toEqual({ index: 4, total: 5 });
    expect(progressOf(['phone'], 'phone')).toEqual({ index: 1, total: 1 });
  });
});

describe('Onboarding: Handys den Personen zuordnen', () => {
  const services = ['mobile_app_annas_iphone', 'mobile_app_ben_pixel', 'mobile_app_tablet_flur', 'mobile_app_annas_ipad'];

  it('erkennt Geräte am Namen der Person (auch „Annas"), ohne Groß-/Kleinschreibung und Umlaute', () => {
    expect(matchDevices('Ben', services)).toEqual(['mobile_app_ben_pixel']);
    expect(matchDevices('Anna', services)).toEqual(['mobile_app_annas_iphone', 'mobile_app_annas_ipad']);
    expect(matchDevices('Jörg', ['mobile_app_joerg_handy'])).toEqual(['mobile_app_joerg_handy']);
    expect(matchDevices('Eva', services)).toEqual([]);
  });

  it('zu kurze Namen raten nicht', () => {
    expect(matchDevices('Al', ['mobile_app_alexa_handy'])).toEqual([]);
  });
});

describe('Onboarding: Personen im Schritt „Wer wohnt hier?"', () => {
  const me = { id: 'u-me', haUserId: 'ha-me', displayName: 'Rene', name: 'rene', isPerson: false, isChild: false, color: null, notifyServices: [], ntfy: false } as never;
  const anna = { id: 'p-anna', haUserId: 'ha-anna', displayName: 'Anna', name: 'anna', isPerson: true, isChild: false, color: '#f90', notifyServices: ['mobile_app_annas_iphone'], ntfy: false } as never;
  const haPersons = [{ name: 'Ben', userId: 'ha-ben' }, { name: 'Gast', userId: null }];
  const services = ['mobile_app_rene_iphone', 'mobile_app_ben_pixel', 'mobile_app_ben_tablet'];

  it('Du steht oben; bestehende Personen, dann die aus Home Assistant; alle vorgewählt', () => {
    const c = buildCandidates({ me, people: [anna], haPersons, services });
    expect(c.map((x) => [x.key, x.name, x.self])).toEqual([
      ['self', 'Rene', true],
      ['p:p-anna', 'Anna', false],
      ['ha:ha-ben', 'Ben', false],
      ['ha:Gast', 'Gast', false],
    ]);
    expect(defaultSelection(c)).toEqual(['self', 'p:p-anna', 'ha:ha-ben', 'ha:Gast']);
  });

  it('ist Du schon eine Person, steht sie nur einmal da und behält ihre Id', () => {
    const self = { ...(me as object), isPerson: true } as never;
    const c = buildCandidates({ me: self, people: [self, anna], haPersons: [], services: [] });
    expect(c.map((x) => x.key)).toEqual(['self', 'p:p-anna']);
    expect(c[0]!.personId).toBe('u-me');
  });

  it('Handy-Status: eingetragenes Gerät, genau ein passendes Gerät wird gewählt, mehrere oder keins nicht', () => {
    const c = buildCandidates({ me, people: [anna], haPersons, services });
    const by = Object.fromEntries(c.map((x) => [x.key, x]));
    expect(by['self']).toMatchObject({ phone: 'found', device: 'mobile_app_rene_iphone' });
    expect(by['p:p-anna']).toMatchObject({ phone: 'found', device: 'mobile_app_annas_iphone', deviceNew: false });
    expect(by['ha:ha-ben']).toMatchObject({ phone: 'missing', device: null, choices: ['mobile_app_ben_pixel', 'mobile_app_ben_tablet'] });
    expect(by['ha:Gast']).toMatchObject({ phone: 'missing', device: null, choices: [] });
    expect(by['self']!.deviceNew).toBe(true);
  });

  it('Du kann nicht abgewählt werden; die anderen schon', () => {
    const c = buildCandidates({ me, people: [anna], haPersons, services });
    const all = defaultSelection(c);
    expect(toggleSelection(all, 'self', c)).toEqual(all);
    expect(toggleSelection(all, 'ha:Gast', c)).toEqual(['self', 'p:p-anna', 'ha:ha-ben']);
    expect(toggleSelection(['self'], 'ha:Gast', c)).toEqual(['self', 'ha:Gast']);
  });

  it('Zuständige des Wächters: die gewählten Personen ohne Kinder; gibt es nur Kinder, dann diese', () => {
    const ids = { self: 'u-me', 'p:p-anna': 'p-anna', 'ha:ha-ben': 'p-ben' };
    expect(assigneeIds(['self', 'p:p-anna', 'ha:ha-ben'], ids, new Set(['ha:ha-ben']))).toEqual(['u-me', 'p-anna']);
    expect(assigneeIds(['self', 'p:p-anna'], ids, new Set(['self', 'p:p-anna']))).toEqual(['u-me', 'p-anna']);
    expect(assigneeIds(['self'], ids, new Set())).toEqual(['u-me']);
    // wer noch nicht angelegt wurde (keine Id), fehlt
    expect(assigneeIds(['self', 'ha:Gast'], ids, new Set())).toEqual(['u-me']);
  });
});

describe('Onboarding: der beste Treffer', () => {
  const hit = (templateId: string, n: number): WatcherSuggestion => ({ templateId, entityId: `sensor.${templateId}_${n}`, name: `${templateId} ${n}`, reason: '', variant: 'default' });

  it('Reihenfolge: Waschmaschine, Trockner, Spülmaschine, Müll, Batterie, Rest', () => {
    const items = [hit('battery', 1), hit('vacuum', 1), hit('bins', 1), hit('dryer', 1), hit('dishwasher', 1), hit('washer', 1)];
    const { best, others } = rankHits(items);
    expect(best?.templateId).toBe('washer');
    expect(others.map((x) => x.templateId)).toEqual(['dryer', 'dishwasher']);
  });

  it('höchstens zwei weitere; gleiche Rangzahl bleibt in der Reihenfolge des Servers', () => {
    const { best, others } = rankHits([hit('battery', 1), hit('battery', 2), hit('battery', 3), hit('battery', 4)]);
    expect([best?.entityId, ...others.map((x) => x.entityId)]).toEqual(['sensor.battery_1', 'sensor.battery_2', 'sensor.battery_3']);
  });

  it('ohne Treffer: nichts', () => {
    expect(rankHits([])).toEqual({ best: null, others: [] });
  });
});

describe('Onboarding: Links zur Companion App', () => {
  it('die echten Adressen im App Store und bei Google Play', () => {
    expect(COMPANION_APP_LINKS.ios).toBe('https://apps.apple.com/app/home-assistant/id1099568401');
    expect(COMPANION_APP_LINKS.android).toBe('https://play.google.com/store/apps/details?id=io.homeassistant.companion.android');
  });
});
