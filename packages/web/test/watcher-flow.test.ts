import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { doneText, dueChipOf, dueFields, dueText, durationChips, fineChips, modeOptions, modeSummary, needsPeople, summaryParts, summaryText, usesCircle, whenParts } from '../src/lib/watcher-flow';
import { emptyForm, formProblem, formProblems, stepProblem, toInput, type WatcherForm } from '../src/lib/watchers';

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
  forMin: '3',
  title: 'Waschmaschine ausräumen',
  dueKind: 'in',
  dueMinutes: '30',
  ...extra,
});

afterEach(() => setLanguage('de'));

describe('Standard: reihum', () => {
  it('ein neuer Wächter ohne Änderung der Auswahl wird mit „rotation“ gespeichert', () => {
    const f = filled();
    expect(f.assignMode).toBe('rotation');
    expect(formProblem(f)).toBeNull();
    expect(toInput(f).assign).toMatchObject({ mode: 'rotation', personIds: [] });
  });

  it('alle sieben Zuweisungsarten sind wählbar, jede genau einmal, `rotation` ist darunter', () => {
    const modes = modeOptions().map((o) => o.mode);
    expect([...modes].sort()).toEqual(['all_present', 'first_home', 'fixed', 'none', 'rotation', 'rotation_present', 'suggest']);
    expect(modeOptions().every((o) => o.title && o.meta)).toBe(true);
    for (const m of modes) expect(modeSummary(m)).not.toBe('');
  });

  it('nur „immer dieselbe Person“ verlangt Personen, nur „Niemand“ hat keinen Kreis', () => {
    expect(needsPeople('fixed')).toBe(true);
    expect(needsPeople('rotation')).toBe(false);
    expect(usesCircle('none')).toBe(false);
    expect(usesCircle('first_home')).toBe(true);
  });
});

describe('Schritte des Assistenten', () => {
  it('jedes Problem gehört zu einem Schritt, die Meldungen bleiben dieselben wie im Formular', () => {
    const f = emptyForm('', '');
    expect(formProblems(f).map((p) => p.step)).toEqual([4, 1, 1, 2, 2]);
    expect(formProblem(f)).toMatch(/Namen/);
    expect(stepProblem(f, 1)).toMatch(/Entität/);
    expect(stepProblem(f, 2)).toMatch(/Titel/);
    expect(stepProblem(f, 3)).toBeNull();
  });

  it('Schritt 1: Schwelle als Zahl, Zustand bei „Zustand“, Kalender und Vorhersage haben eigene Felder', () => {
    expect(stepProblem(filled({ value: '' }), 1)).toMatch(/Schwellwert/);
    expect(stepProblem(filled({ kind: 'state', to: '' }), 1)).toMatch(/Zustand/);
    expect(stepProblem(filled({ kind: 'state', to: 'on' }), 1)).toBeNull();
    expect(stepProblem(filled({ kind: 'calendar_event', leadHours: '-1' }), 1)).toMatch(/Stunden/);
    expect(stepProblem(filled({ kind: 'forecast', forecastHours: '0' }), 1)).toMatch(/Regen/);
  });

  it('Schritt 3 und 4: feste Person, Rückfall, Erledigen-Bedingung', () => {
    expect(stepProblem(filled({ assignMode: 'fixed', personIds: [] }), 3)).toMatch(/Person/);
    expect(stepProblem(filled({ assignMode: 'rotation_present', fallback: 'fixed' }), 3)).toMatch(/Rückfall/);
    expect(stepProblem(filled({ assignMode: 'first_home', waitFallback: 'fixed' }), 3)).toMatch(/Rückfall/);
    // ein übrig gebliebener Rückfall einer früheren Wahl gilt bei „reihum“ nicht und verhindert das Speichern nicht
    expect(stepProblem(filled({ assignMode: 'rotation', fallback: 'fixed' }), 3)).toBeNull();
    expect(toInput(filled({ assignMode: 'rotation', fallback: 'fixed', waitFallback: 'fixed' })).assign).toMatchObject({ mode: 'rotation', fallback: 'next', waitFallback: 'none', fallbackPersonId: null });
    expect(toInput(filled({ assignMode: 'rotation_present', fallback: 'fixed', fallbackPersonId: 'a' })).assign).toMatchObject({ fallback: 'fixed', fallbackPersonId: 'a' });
    expect(stepProblem(filled({ doneOn: true }), 4)).toMatch(/Entität/);
    expect(stepProblem(filled({ doneOn: true, doneEntityId: 'binary_sensor.tuer', doneTo: '' }), 4)).toMatch(/Zustand/);
    expect(stepProblem(filled({ name: ' ' }), 4)).toMatch(/Namen/);
  });
});

describe('Wenn', () => {
  it('Dauer-Chips: sofort, 1, 3, 5, 10 und ein eigener Wert dazwischen einsortiert', () => {
    expect(durationChips('3', 'below')).toEqual([0, 1, 3, 5, 10]);
    expect(durationChips('7', 'below')).toEqual([0, 1, 3, 5, 7, 10]);
    expect(durationChips('', 'below')).toEqual([0, 1, 3, 5, 10]); // Vorgabe 3
    expect(durationChips('', 'state')).toEqual([0, 1, 3, 5, 10]);
    expect(durationChips('15', 'above')).toEqual([0, 1, 3, 5, 10, 15]);
  });

  it('Satz im Ablauf: Entität, Dauer und Schwelle fett', () => {
    const p = whenParts(filled());
    expect(p.map((x) => x.text).join('')).toBe('Waschmaschine Leistung liegt 3 Min. unter 5 W');
    expect(p.filter((x) => x.bold).map((x) => x.text)).toEqual(['Waschmaschine Leistung', '3 Min.', '5 W']);
  });

  it('ohne Wartezeit, über, Zustand, Kalender, Vorhersage', () => {
    const j = (f: WatcherForm) => whenParts(f).map((x) => x.text).join('');
    expect(j(filled({ forMin: '0' }))).toBe('Waschmaschine Leistung liegt unter 5 W');
    expect(j(filled({ kind: 'above', value: '80,5' }))).toBe('Waschmaschine Leistung liegt 3 Min. über 80,5 W');
    expect(j(filled({ kind: 'state', to: 'docked', entityUnit: '', forMin: '0' }))).toBe('Waschmaschine Leistung wechselt zu docked');
    expect(j(filled({ kind: 'state', to: 'docked', entityUnit: '', forMin: '5' }))).toBe('Waschmaschine Leistung steht 5 Min. auf docked');
    expect(j(filled({ kind: 'calendar_event', entityName: 'Müllkalender', leadHours: '12' }))).toBe('Im Kalender Müllkalender steht 12 Stunden vor einem Termin etwas an');
    expect(j(filled({ kind: 'forecast', entityName: 'Wetter', forecastHours: '1' }))).toBe('Wetter sagt in den nächsten 1 Stunde Regen voraus');
  });

  it('Englisch', () => {
    setLanguage('en');
    expect(whenParts(filled()).map((x) => x.text).join('')).toBe('Waschmaschine Leistung is below 5 W for 3 min');
  });
});

describe('Dann: Fälligkeit als Chips', () => {
  it('jeder Chip setzt Felder, die wieder derselbe Chip ergeben', () => {
    for (const chip of ['now', 'in30', 'in60', 'evening', 'none'] as const) {
      expect(dueChipOf(dueFields(chip))).toBe(chip);
    }
  });

  it('andere Werte sind „eigene“ Fälligkeit', () => {
    expect(dueChipOf({ dueKind: 'in', dueMinutes: '45', dueDay: 'tomorrow', dueTime: '08:00' })).toBe('custom');
    expect(dueChipOf({ dueKind: 'at', dueMinutes: '30', dueDay: 'tomorrow', dueTime: '08:00' })).toBe('custom');
    expect(dueChipOf({ dueKind: 'at', dueMinutes: '30', dueDay: 'today', dueTime: '19:00' })).toBe('custom');
  });

  it('Text der Fälligkeit', () => {
    expect(dueText(dueFields('in30'))).toBe('in 30 Min.');
    expect(dueText(dueFields('now'))).toBe('sofort');
    expect(dueText(dueFields('none'))).toBe('ohne Termin');
    expect(dueText(dueFields('evening'))).toBe('heute 18:00');
  });
});

describe('Zusammenfassung', () => {
  it('der Satz des Entwurfs: Auslöser, wer, Aufgabe mit Fälligkeit; fett sind Entität, Schwelle, wer und Aufgabe', () => {
    const f = filled({ assignMode: 'rotation_present', doneOn: true, doneEntityId: 'binary_sensor.tuer', doneEntityName: 'Tür der Waschmaschine', doneKind: 'state', doneTo: 'on' });
    expect(summaryText(f, nameOf)).toBe(
      'Wenn Waschmaschine Leistung länger als 3 Min. unter 5 W liegt, bekommt wer zu Hause ist, reihum die Aufgabe „Waschmaschine ausräumen“ (fällig in 30 Min.). Sie erledigt sich, wenn Tür der Waschmaschine zu „on“ wechselt.',
    );
    expect(summaryParts(f, nameOf).filter((p) => p.bold).map((p) => p.text)).toEqual(['Waschmaschine Leistung', '5 W', 'wer zu Hause ist, reihum', '„Waschmaschine ausräumen“']);
  });

  it('ohne Fälligkeit und ohne Erledigen kein Zusatz', () => {
    expect(summaryText(filled({ dueKind: 'none' }), nameOf)).toBe('Wenn Waschmaschine Leistung länger als 3 Min. unter 5 W liegt, bekommt reihum jemand die Aufgabe „Waschmaschine ausräumen“.');
  });

  it('Erledigen mit Schwellwert', () => {
    expect(doneText(filled({ doneOn: true, doneEntityName: 'Akku', doneEntityId: 'sensor.akku', doneKind: 'above', doneValue: '95' }))).toBe('wenn Akku über 95 liegt');
    expect(doneText(filled())).toBe('');
  });
});

describe('Feinschliff-Chips', () => {
  it('Vorgaben des Entwurfs: Sperrzeit 10, keine zweite Aufgabe, kein Stupsen, erst beim 1. Mal', () => {
    expect(fineChips(filled()).map((c) => c.label)).toEqual(['Name: Waschmaschine fertig', 'Kategorie: keine', 'Sperrzeit 10 Min.', 'Keine zweite Aufgabe', 'Nicht stupsen', 'Erst beim 1. Mal']);
  });

  it('der Chip „Kategorie" nennt die gewählte Kategorie', () => {
    const chips = fineChips(filled({ category: 'Batterien' }));
    expect(chips.find((c) => c.key === 'category')!.label).toBe('Kategorie: Batterien');
    expect(chips.map((c) => c.key).slice(0, 2)).toEqual(['name', 'category']);
  });

  it('gesetzte Werte', () => {
    const chips = fineChips(filled({ cooldownMin: '15', dedupe: false, nudgeAfter: '60', count: '3' }));
    expect(chips.map((c) => c.label)).toEqual(['Name: Waschmaschine fertig', 'Kategorie: keine', 'Sperrzeit 15 Min.', 'Zweite Aufgabe erlaubt', 'Stupsen nach 60 Min.', 'Erst beim 3. Mal']);
    expect(chips.map((c) => c.key)).toEqual(['name', 'category', 'cooldown', 'dedupe', 'nudge', 'count']);
  });

  it('Kalender und Vorhersage haben keinen Zähler', () => {
    expect(fineChips(filled({ kind: 'calendar_event' })).some((c) => c.key === 'count')).toBe(false);
    expect(fineChips(filled({ kind: 'forecast' })).some((c) => c.key === 'count')).toBe(false);
  });
});

import { durationHint, durationLabel, sliderRange } from '../src/lib/watcher-flow';

describe('Schwellen-Regler', () => {
  it('5 W: von 0 bis 50 wie im Entwurf', () => {
    expect(sliderRange(5)).toEqual({ min: 0, max: 50, step: 1 });
  });

  it('runde Obergrenze, mindestens 10, Schritte von rund 50 Stufen', () => {
    expect(sliderRange(0)).toEqual({ min: 0, max: 10, step: 0.2 });
    expect(sliderRange(null)).toEqual({ min: 0, max: 10, step: 0.2 });
    expect(sliderRange(21)).toEqual({ min: 0, max: 200, step: 2 });
    expect(sliderRange(80)).toEqual({ min: 0, max: 500, step: 10 });
    expect(sliderRange(2000)).toEqual({ min: 0, max: 10000, step: 200 });
  });

  it('negative Werte (Temperatur) bekommen einen Bereich ins Minus', () => {
    expect(sliderRange(-3)).toEqual({ min: -20, max: 20, step: 0.5 });
  });

  it('der Wert liegt immer im Bereich', () => {
    for (const v of [0.4, 1, 5, 7, 20, 99, 100, 250, 1234, -1, -5, -80]) {
      const r = sliderRange(v);
      expect(v).toBeGreaterThanOrEqual(r.min);
      expect(v).toBeLessThanOrEqual(r.max);
    }
  });
});

describe('Satz unter der Dauer', () => {
  it('nennt Dauer, Fenster und wie oft der Wächter ausgelöst hätte', () => {
    expect(durationLabel(3)).toBe('3 Min.');
    expect(durationHint(3, 3, 1)).toBe('Mit 3 Min. hätte Stups in den letzten 3 Stunden genau einmal ausgelöst – kurze Pausen zählen nicht.');
    expect(durationHint(0, 3, 0)).toBe('Ohne Wartezeit hätte Stups in den letzten 3 Stunden nicht ausgelöst.');
    expect(durationHint(5, 1, 2)).toBe('Mit 5 Min. hätte Stups in den letzten 1 Stunde 2 Mal ausgelöst – kurze Pausen zählen nicht.');
  });
});

import { fromWatcher } from '../src/lib/watchers';
import type { WatcherItem } from '../src/lib/watcher-types';

describe('Symbol der Aufgabe bleibt beim Bearbeiten erhalten', () => {
  const item = (icon?: string): WatcherItem =>
    ({
      id: 'w1',
      name: 'Trockner fertig',
      active: true,
      trigger: { entityId: 'sensor.trockner', kind: 'below', to: null, value: 5, forMin: 3, count: 1 },
      card: { boardId: 'b1', columnId: 'c1', title: 'Wäsche holen', description: null, categoryIds: [], priority: 'medium', due: { kind: 'none' }, ...(icon ? { icon, iconColor: 'teal' } : {}) },
      assign: { mode: 'rotation', personIds: [], fallback: 'next', waitFallback: 'none', fallbackPersonId: null },
      done: null,
      cooldownMin: 10,
      dedupe: true,
      nudge: null,
    }) as unknown as WatcherItem;

  it('Symbol und Farbe aus einer Vorlage gehen beim Speichern wieder an den Server', () => {
    const f = fromWatcher(item('washing-machine'));
    expect(f).toMatchObject({ icon: 'washing-machine', iconColor: 'teal', priority: 'medium' });
    expect(toInput(f).card).toMatchObject({ icon: 'washing-machine', iconColor: 'teal', priority: 'medium' });
  });

  it('ohne Symbol bleibt das Feld weg (das Symbol der Entität gilt)', () => {
    expect(toInput(fromWatcher(item())).card).not.toHaveProperty('icon');
  });
});

import { nameSymbol } from '../src/lib/watcher-flow';

describe('Symbol zum Namen der Entität', () => {
  it('deutsche Namen aus Home Assistant werden auch in der englischen Oberfläche erkannt', () => {
    expect(nameSymbol('Waschmaschine Leistung')).toBe('washing-machine');
    setLanguage('en');
    expect(nameSymbol('Waschmaschine Leistung')).toBe('washing-machine');
    expect(nameSymbol('Washing machine power')).toBe('washing-machine');
    expect(nameSymbol('xyzzy')).toBeNull();
  });
});
