import { describe, expect, it } from 'vitest';
import {
  assigneeIds,
  buildCandidates,
  childChoices,
  COMPANION_APP_LINKS,
  defaultSelection,
  matchDevices,
  nextOpenStep,
  progressOf,
  stepsFor,
  toggleSelection,
  visibleCandidates,
} from '../src/lib/onboarding';

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
  const haPersons = [{ name: 'Ben', userId: 'ha-ben' }, { name: 'Tom', userId: null }];
  const services = ['mobile_app_rene_iphone', 'mobile_app_ben_pixel', 'mobile_app_ben_tablet'];

  it('bestehende Personen, dann die aus Home Assistant; der Administrator ist keine Person und steht nur auf Wunsch dabei', () => {
    const c = buildCandidates({ me, people: [anna], haPersons, services });
    expect(c.map((x) => [x.key, x.name, x.self])).toEqual([
      ['self', 'Rene', true],
      ['p:p-anna', 'Anna', false],
      ['ha:ha-ben', 'Ben', false],
      ['ha:Tom', 'Tom', false],
    ]);
    expect(visibleCandidates(c, false).map((x) => x.key)).toEqual(['p:p-anna', 'ha:ha-ben', 'ha:Tom']);
    expect(visibleCandidates(c, true).map((x) => x.key)).toEqual(['self', 'p:p-anna', 'ha:ha-ben', 'ha:Tom']);
    expect(defaultSelection(c, false)).toEqual(['p:p-anna', 'ha:ha-ben', 'ha:Tom']);
    expect(defaultSelection(c, true)).toEqual(['self', 'p:p-anna', 'ha:ha-ben', 'ha:Tom']);
  });

  it('Du steht nicht noch einmal als Person aus Home Assistant da (gleiche Benutzer-Id oder gleicher Name)', () => {
    const c = buildCandidates({ me, people: [], haPersons: [{ name: 'Rene', userId: 'ha-me' }, { name: 'rene', userId: null }, { name: 'Ben', userId: 'ha-ben' }], services: [] });
    expect(c.map((x) => x.key)).toEqual(['self', 'ha:ha-ben']);
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
    expect(by['self']).toMatchObject({ phone: 'found', devices: ['mobile_app_rene_iphone'] });
    expect(by['p:p-anna']).toMatchObject({ phone: 'found', devices: ['mobile_app_annas_iphone'], deviceNew: false });
    expect(by['ha:ha-ben']).toMatchObject({ phone: 'missing', devices: [], choices: ['mobile_app_ben_pixel', 'mobile_app_ben_tablet'] });
    expect(by['ha:Tom']).toMatchObject({ phone: 'missing', devices: [], choices: [] });
    expect(by['self']!.deviceNew).toBe(true);
  });

  it('Home Assistant sagt, welche Geräte zu einer Person gehören (device_trackers): alle, die es als Push-Dienst gibt, in dieser Reihenfolge', () => {
    const c = buildCandidates({
      me,
      people: [],
      haPersons: [{ name: 'Conny', userId: 'ha-c', deviceTrackers: ['device_tracker.connys_iphone_2', 'device_tracker.connys_iphone', 'device_tracker.connys_auto'] }],
      services: ['mobile_app_connys_iphone', 'mobile_app_connys_iphone_2', 'mobile_app_ipad_von_rene'],
    });
    const conny = c.find((x) => x.key === 'ha:ha-c')!;
    expect(conny).toMatchObject({ phone: 'found', devices: ['mobile_app_connys_iphone_2', 'mobile_app_connys_iphone'], deviceNew: true });
  });

  it('die Zuordnung von Home Assistant gilt auch, wenn der Name des Geräts nichts mit dem der Person zu tun hat; ohne Zuordnung bleibt der Name', () => {
    const c = buildCandidates({
      me,
      people: [],
      haPersons: [{ name: 'Tom', userId: 'ha-t', deviceTrackers: ['device_tracker.pixel_8'] }, { name: 'Ben', userId: 'ha-b', deviceTrackers: [] }],
      services: ['mobile_app_pixel_8', 'mobile_app_ben_pixel'],
    });
    expect(c.find((x) => x.key === 'ha:ha-t')).toMatchObject({ phone: 'found', devices: ['mobile_app_pixel_8'] });
    expect(c.find((x) => x.key === 'ha:ha-b')).toMatchObject({ phone: 'found', devices: ['mobile_app_ben_pixel'] });
  });

  it('Du bekommst die Geräte deiner Person in Home Assistant, auch wenn du keine Person in Stups bist', () => {
    const c = buildCandidates({ me, people: [], haPersons: [{ name: 'Rene', userId: 'ha-me', deviceTrackers: ['device_tracker.iphone_von_rene'] }], services: ['mobile_app_iphone_von_rene', 'mobile_app_ipad_von_rene'] });
    expect(c[0]).toMatchObject({ key: 'self', phone: 'found', devices: ['mobile_app_iphone_von_rene'] });
  });

  it('antippen wählt an oder ab, die Reihenfolge der Liste bleibt', () => {
    const c = buildCandidates({ me, people: [anna], haPersons, services });
    const all = defaultSelection(c, false);
    expect(toggleSelection(all, 'ha:Tom', c)).toEqual(['p:p-anna', 'ha:ha-ben']);
    expect(toggleSelection(['p:p-anna'], 'ha:Tom', c)).toEqual(['p:p-anna', 'ha:Tom']);
    expect(toggleSelection(['ha:Tom'], 'p:p-anna', c)).toEqual(['p:p-anna', 'ha:Tom']);
  });

  it('„Wer ist ein Kind?": die gewählten Personen, nie der Administrator', () => {
    const c = buildCandidates({ me, people: [anna], haPersons, services });
    expect(childChoices(c, ['self', 'p:p-anna', 'ha:Tom']).map((x) => x.key)).toEqual(['p:p-anna', 'ha:Tom']);
    expect(childChoices(c, [])).toEqual([]);
  });

  it('Wer im Assistenten infrage kommt: die gewählten Personen ohne Kinder; gibt es nur Kinder, dann diese', () => {
    expect(assigneeIds(['a', 'b', 'c'], ['c'])).toEqual(['a', 'b']);
    expect(assigneeIds(['a', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
    expect(assigneeIds(['a'], [])).toEqual(['a']);
    expect(assigneeIds([], [])).toEqual([]);
  });
});

describe('Onboarding: Links zur Companion App', () => {
  it('die echten Adressen im App Store und bei Google Play', () => {
    expect(COMPANION_APP_LINKS.ios).toBe('https://apps.apple.com/app/home-assistant/id1099568401');
    expect(COMPANION_APP_LINKS.android).toBe('https://play.google.com/store/apps/details?id=io.homeassistant.companion.android');
  });
});
