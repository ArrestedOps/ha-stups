import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import type { TemplateDraft, WatcherItem, WatcherTemplate } from '../src/lib/watcher-types';
import { applyEntity, applyTemplate, emptyForm, formProblem, fromWatcher, sentenceParts, toInput, type WatcherForm } from '../src/lib/watchers';

const names: Record<string, string> = { a: 'Anna', b: 'Ben' };
const nameOf = (id: string) => names[id] ?? '?';

const filled = (extra: Partial<WatcherForm> = {}): WatcherForm => ({
  ...emptyForm('b1', 'c1'),
  name: 'Waschmaschine fertig',
  entityId: 'sensor.waschmaschine_leistung',
  entityName: 'Waschmaschine Leistung',
  entityUnit: 'W',
  kind: 'below',
  value: '5',
  title: 'Waschmaschine ausräumen',
  dueKind: 'in',
  dueMinutes: '30',
  assignMode: 'rotation_present',
  ...extra,
});

const draft = (over: Partial<TemplateDraft> = {}): TemplateDraft => ({
  name: 'Trockner fertig',
  trigger: { kind: 'below', value: 5, forMin: 3 },
  card: { title: 'Wäsche aus dem Trockner holen', due: { kind: 'in', minutes: 30 } },
  assign: { mode: 'rotation_present' },
  done: null,
  ...over,
});
const tpl = (id: string, d: TemplateDraft | null, over: Partial<WatcherTemplate> = {}): WatcherTemplate => ({
  id,
  kind: 'watcher',
  title: id,
  hint: '',
  domain: 'sensor',
  search: '',
  draft: d,
  recurring: null,
  canSelfComplete: false,
  whyNoSelfComplete: 'weil',
  ...over,
});

afterEach(() => setLanguage('de'));

describe('Vorlagen vom Server anwenden', () => {
  it('eine Vorlage mit Treffer aus „Gefunden" ergibt ein speicherbares Formular', () => {
    const f = applyTemplate(emptyForm('b1', 'c1'), tpl('dryer', draft()), { entityId: 'sensor.trockner', name: 'Steckdose Trockner Leistung' });
    expect(formProblem(f)).toBeNull();
    expect(f).toMatchObject({ entityId: 'sensor.trockner', entityName: 'Steckdose Trockner Leistung', kind: 'below', value: '5', forMin: '3', assignMode: 'rotation_present', dueKind: 'in', dueMinutes: '30' });
  });

  it('ohne Treffer fehlt nur noch die Entität', () => {
    const f = applyTemplate(emptyForm('b1', 'c1'), tpl('dryer', draft()));
    expect(formProblem(f)).toMatch(/Entität/);
  });

  it('Saugroboter: Zähler 3, wer zuerst nach Hause kommt', () => {
    const f = applyTemplate(
      emptyForm('b', 'c'),
      tpl('vacuum', draft({ trigger: { kind: 'state', to: 'docked', forMin: 0, count: 3 }, assign: { mode: 'first_home' }, card: { title: 'Staubbehälter leeren', due: { kind: 'none' } } })),
    );
    expect(f).toMatchObject({ kind: 'state', to: 'docked', count: '3', assignMode: 'first_home', dueKind: 'none' });
  });

  it('Batterie: die Karte erledigt sich von selbst, wenn der Sensor wieder über 50 steigt', () => {
    const f = applyTemplate(emptyForm('b', 'c'), tpl('battery', draft({ trigger: { kind: 'below', value: 20, forMin: 10 }, done: { kind: 'above', value: 50 } })), { entityId: 'sensor.bad', name: 'Bad' });
    expect(f).toMatchObject({ doneOn: true, doneEntityId: 'sensor.bad', doneKind: 'above', doneValue: '50' });
    expect(formProblem(f)).toBeNull();
  });

  it('Treffer mit Gerätename: Wächtername und Kartentitel nennen das Gerät', () => {
    const f = applyTemplate(emptyForm('b', 'c'), tpl('battery', draft({ name: 'Batterie schwach', card: { title: 'Batterie wechseln', due: { kind: 'none' } } })), {
      entityId: 'sensor.iphone_rene_battery_level',
      name: 'iPhone Rene Battery Level',
      label: 'iPhone Rene',
    });
    expect(f).toMatchObject({ name: 'Batterie schwach: iPhone Rene', title: 'Batterie wechseln: iPhone Rene' });
  });

  it('Treffer, dessen Gerät schon im Namen steht, bleibt unverändert (Waschmaschine)', () => {
    const f = applyTemplate(emptyForm('b', 'c'), tpl('washer', draft({ name: 'Waschmaschine fertig', card: { title: 'Waschmaschine ausräumen', due: { kind: 'none' } } })), {
      entityId: 'sensor.wm',
      name: 'Waschmaschine Leistung',
      label: 'Waschmaschine',
    });
    expect(f).toMatchObject({ name: 'Waschmaschine fertig', title: 'Waschmaschine ausräumen' });
  });

  it('von Hand gewählte Entität (Suche) ergänzt den Namen der Vorlage, solange er unverändert ist', () => {
    const base = applyTemplate(emptyForm('b', 'c'), tpl('battery', draft({ name: 'Batterie schwach', card: { title: 'Batterie wechseln', due: { kind: 'none' } } })));
    expect(base).toMatchObject({ name: 'Batterie schwach', title: 'Batterie wechseln' });
    const a = applyEntity(base, { entityId: 'sensor.a', name: 'iPhone Rene Battery Level', label: 'iPhone Rene', unit: '%', state: '30', domain: 'sensor' });
    expect(a).toMatchObject({ entityId: 'sensor.a', entityName: 'iPhone Rene Battery Level', entityUnit: '%', name: 'Batterie schwach: iPhone Rene', title: 'Batterie wechseln: iPhone Rene' });
    // eine andere Entität ersetzt das Gerät statt es anzuhängen
    const b = applyEntity(a, { entityId: 'sensor.b', name: 'iPad Küche Batterie', label: 'iPad Küche', unit: '%', state: '40', domain: 'sensor' });
    expect(b).toMatchObject({ name: 'Batterie schwach: iPad Küche', title: 'Batterie wechseln: iPad Küche' });
  });

  it('ein von Hand geänderter Name oder Titel bleibt bei der Wahl der Entität in Ruhe', () => {
    const base = { ...applyTemplate(emptyForm('b', 'c'), tpl('battery', draft({ name: 'Batterie schwach', card: { title: 'Batterie wechseln', due: { kind: 'none' } } }))), name: 'Mein Name' };
    const f = applyEntity(base, { entityId: 'sensor.a', name: 'iPhone Battery', label: 'iPhone', unit: '%', state: '30', domain: 'sensor' });
    expect(f).toMatchObject({ name: 'Mein Name', title: 'Batterie wechseln: iPhone' });
  });

  it('ohne Vorlage füllt die gewählte Entität einen leeren Namen mit ihrem Namen', () => {
    const f = applyEntity(emptyForm('b', 'c'), { entityId: 'sensor.a', name: 'Flur Licht', label: 'Flur Licht', unit: null, state: 'on', domain: 'sensor' });
    expect(f).toMatchObject({ name: 'Flur Licht', entityId: 'sensor.a' });
  });

  it('eine Entität mit Zahl wechselt von „Zustand" auf „darunter"', () => {
    expect(applyEntity({ ...emptyForm('b', 'c'), kind: 'state' }, { entityId: 'sensor.a', name: 'A', label: 'A', unit: 'W', state: '1', domain: 'sensor' }).kind).toBe('below');
  });

  it('Kalender und Vorhersage: Vorlauf in Stunden, Regen in Stunden; Speichern gibt die Minuten an den Server', () => {
    const cal = applyTemplate(emptyForm('b', 'c'), tpl('bins', draft({ trigger: { kind: 'calendar_event', leadMin: 720 } })), { entityId: 'calendar.abfall', name: 'Abfall' });
    expect(cal).toMatchObject({ kind: 'calendar_event', leadHours: '12' });
    expect(formProblem(cal)).toBeNull();
    expect(toInput(cal).trigger).toEqual({ entityId: 'calendar.abfall', kind: 'calendar_event', to: null, value: null, forMin: 0, count: 1, leadMin: 720 });
    const rain = applyTemplate(emptyForm('b', 'c'), tpl('rain', draft({ trigger: { kind: 'forecast', condition: 'rain', hours: 3 } })), { entityId: 'weather.zuhause', name: 'Zuhause' });
    expect(toInput(rain).trigger).toEqual({ entityId: 'weather.zuhause', kind: 'forecast', to: null, value: null, forMin: 0, count: 1, forecast: { condition: 'rain', hours: 3 } });
  });

  it('Bearbeiten: ein Kalender-Wächter kommt unverändert zurück ins Formular', () => {
    const cal = applyTemplate(emptyForm('b', 'c'), tpl('bins', draft({ trigger: { kind: 'calendar_event', leadMin: 600 } })), { entityId: 'calendar.abfall', name: 'Abfall' });
    const item = { ...toInput(cal), id: 'w', status: 'ok', lastFiredAt: null, lastAssignees: [], armed: true, counter: 0, subscribed: true, lastRun: null, entityState: null, entityName: null, subject: '', deviceLabel: '', nameHasDevice: false, defaultName: false, suggestedName: null, suggestedTitle: null, entityUnit: null, openCard: null } as WatcherItem;
    expect(fromWatcher(item)).toMatchObject({ kind: 'calendar_event', leadHours: '10' });
  });

  it('Kalender und Vorhersage brauchen ihre Zahlen, bevor sie gespeichert werden', () => {
    expect(formProblem(filled({ kind: 'calendar_event', leadHours: 'x' }))).toMatch(/Stunden/);
    expect(formProblem(filled({ kind: 'forecast', forecastHours: '0' }))).toMatch(/Regen/);
  });
});

describe('Der Satz im Formular', () => {
  const parts = (f: WatcherForm) => sentenceParts(f, nameOf);
  const plain = (f: WatcherForm) => parts(f).map((p) => p.text).join('');

  it('das Beispiel aus dem Entwurf, mit antippbaren Feldern', () => {
    const f = filled({ entityName: 'Trockner Leistung', forMin: '3', title: 'Trockner fertig' });
    expect(plain(f)).toBe('Wenn Trockner Leistung länger als 3 Min. unter 5 W liegt, bekommt wer zu Hause ist, reihum die Karte Trockner fertig.');
    expect(parts(f).filter((p) => p.field).map((p) => p.field)).toEqual(['entity', 'duration', 'threshold', 'who', 'title']);
  });

  it('ohne Wartezeit entfällt das Feld „länger als", Zustandswechsel lesen sich als Wechsel', () => {
    expect(plain(filled({ forMin: '0', kind: 'state', to: 'docked', entityName: 'S7' }))).toBe('Wenn S7 zu docked wechselt, bekommt wer zu Hause ist, reihum die Karte Waschmaschine ausräumen.');
    expect(plain(filled({ forMin: '5', kind: 'state', to: 'off', entityName: 'Tür' }))).toContain('länger als 5 Min. auf off steht');
  });

  it('wer: Erst vorschlagen, feste Personen, niemand', () => {
    expect(plain(filled({ assignMode: 'suggest' }))).toContain('bekommt wer sich meldet die Karte');
    expect(plain(filled({ assignMode: 'fixed', personIds: ['a', 'b'] }))).toContain('bekommt Anna, Ben die Karte');
    expect(plain(filled({ assignMode: 'none' }))).toContain('bekommt niemand die Karte');
  });

  it('Kalender und Regen', () => {
    expect(plain(filled({ kind: 'calendar_event', leadHours: '12', entityName: 'Abfall' }))).toBe('Wenn im Kalender Abfall 12 Stunden vor einem Termin ansteht, bekommt wer zu Hause ist, reihum die Karte Waschmaschine ausräumen.');
    expect(plain(filled({ kind: 'forecast', forecastHours: '3', entityName: 'Zuhause' }))).toContain('in den nächsten 3 Stunden Regen vorhersagt');
  });

  it('unfertige Eingaben zeigen Platzhalter statt zu scheitern', () => {
    const p = plain({ ...emptyForm(), kind: 'below' });
    expect(p).toContain('Entität wählen');
    expect(p).toContain('Titel wählen');
  });

  it('auf Englisch mit anderer Wortstellung, gleiche Felder', () => {
    setLanguage('en');
    const f = filled({ entityName: 'Dryer power', forMin: '3', title: 'Dryer done' });
    expect(plain(f)).toBe('When Dryer power stays below 5 W for more than 3 min, whoever is home, in turn gets the card Dryer done.');
    expect(parts(f).filter((p) => p.field).map((p) => p.field)).toEqual(['entity', 'threshold', 'duration', 'who', 'title']);
  });
});
