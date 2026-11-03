import { describe, expect, it } from 'vitest';
import type { WatcherItem } from '../src/lib/watcher-types';
import { conditionText, emptyForm, formProblem, fromWatcher, previewSentence, toInput, watcherLine, type WatcherForm } from '../src/lib/watchers';

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
  ...extra,
});

describe('Vorschau-Satz', () => {
  it('Standardfall: Wartezeit, Schwellwert, anwesende Person, Fälligkeit', () => {
    expect(previewSentence(filled({ forMin: '3' }), nameOf)).toBe(
      'Wenn Waschmaschine Leistung 3 Minuten unter 5 W liegt, bekommt eine anwesende Person abwechselnd die Karte „Waschmaschine ausräumen“ (fällig in 30 Min.).',
    );
  });

  it('Zahlenwerte warten vorgabegemäß 3 Minuten, „über" und Komma funktionieren', () => {
    expect(conditionText(filled({ kind: 'above', value: '80,5', forMin: '' }))).toBe('Waschmaschine Leistung 3 Minuten über 80,5 W liegt');
  });

  it('Zustandswechsel mit und ohne Wartezeit', () => {
    const f = filled({ kind: 'state', to: 'off', entityName: 'Tür' , entityUnit: '' });
    expect(conditionText({ ...f, forMin: '' })).toBe('Tür zu „off“ wechselt');
    expect(conditionText({ ...f, forMin: '5' })).toBe('Tür 5 Minuten lang auf „off“ steht');
  });

  it('Zähler und Saugroboter: wer zuerst nach Hause kommt', () => {
    const f = filled({ kind: 'state', to: 'docked', entityName: 'S7', entityUnit: '', count: '3', title: 'Staubbehälter leeren', dueKind: 'none', assignMode: 'first_home' });
    expect(previewSentence(f, nameOf)).toBe('Wenn S7 zu „docked“ wechselt (beim 3. Mal), bekommt die Person, die als Erstes nach Hause kommt, die Karte „Staubbehälter leeren“.');
  });

  it('feste Personen, Rotation, alle Anwesenden, niemand; Fälligkeit „morgen 08:00"', () => {
    const s = (extra: Partial<WatcherForm>) => previewSentence(filled({ dueKind: 'at', dueDay: 'tomorrow', dueTime: '08:00', ...extra }), nameOf);
    expect(s({ assignMode: 'fixed', personIds: ['a', 'b'] })).toContain('bekommt Anna, Ben die Karte');
    expect(s({ assignMode: 'rotation', personIds: ['a', 'b'] })).toContain('bekommt abwechselnd Anna, Ben die Karte');
    expect(s({ assignMode: 'all_present' })).toContain('bekommen alle Anwesenden die Karte');
    expect(s({ assignMode: 'none' })).toContain('entsteht die Karte „Waschmaschine ausräumen“ ohne Zuständige');
    expect(s({})).toMatch(/\(fällig morgen 08:00\)\.$/);
  });

  it('unfertige Eingaben zeigen Auslassungspunkte statt zu scheitern', () => {
    expect(previewSentence({ ...emptyForm(), kind: 'below' }, nameOf)).toBe('Wenn … 3 Minuten unter … liegt, bekommt eine anwesende Person abwechselnd die Karte „…“.');
  });
});

describe('Formular prüfen und umwandeln', () => {
  it('meldet das Erste, was fehlt', () => {
    expect(formProblem(emptyForm('b', 'c'))).toMatch(/Namen/);
    expect(formProblem(filled({ entityId: '' }))).toMatch(/Entität/);
    expect(formProblem(filled({ kind: 'state', to: '' }))).toMatch(/Zustand/);
    expect(formProblem(filled({ value: 'abc' }))).toMatch(/Schwellwert/);
    expect(formProblem(filled({ title: ' ' }))).toMatch(/Titel/);
    expect(formProblem(filled({ boardId: '' }))).toMatch(/Board/);
    expect(formProblem(filled({ assignMode: 'fixed', personIds: [] }))).toMatch(/Person/);
    expect(formProblem(filled({ fallback: 'fixed', fallbackPersonId: '' }))).toMatch(/Rückfall/);
    expect(formProblem(filled({ doneOn: true }))).toMatch(/Entität/);
    expect(formProblem(filled())).toBeNull();
  });

  it('wandelt in die Eingabe für den Server: Vorgaben, Komma, Zähler', () => {
    const i = toInput(filled({ value: '4,5', count: '3', cooldownMin: '', forMin: '', description: ' ', priority: 'high' }));
    expect(i.trigger).toEqual({ entityId: 'sensor.waschmaschine_leistung', kind: 'below', to: null, value: 4.5, forMin: 3, count: 3 });
    expect(i.cooldownMin).toBe(10);
    expect(i.card).toMatchObject({ title: 'Waschmaschine ausräumen', description: null, priority: 'high', due: { kind: 'in', minutes: 30 } });
    expect(i.nudgeAfterMin).toBeNull();
    expect(i.done).toBeNull();
  });

  it('Zustandswechsel hat keine Vorgabe-Wartezeit; „erledigt sich selbst" wird mitgenommen', () => {
    const i = toInput(filled({ kind: 'state', to: 'off', doneOn: true, doneEntityId: 'binary_sensor.tuer', doneKind: 'state', doneTo: 'on' }));
    expect(i.trigger).toMatchObject({ kind: 'state', to: 'off', value: null, forMin: 0 });
    expect(i.done).toEqual({ entityId: 'binary_sensor.tuer', kind: 'state', to: 'on', value: null });
  });

  it('Hin und zurück: Wächter → Formular → Eingabe bleibt gleich', () => {
    const input = toInput(filled({ forMin: '3', count: '3', cooldownMin: '15', nudgeAfterMin: '90', categoryIds: ['k1'] }));
    const w: WatcherItem = { ...input, id: 'w1', status: 'ok', lastFiredAt: null, lastAssignees: [], armed: true, counter: 0, subscribed: true, lastRun: null, entityState: null, entityName: null, entityUnit: null, openCard: null };
    expect(toInput(fromWatcher(w))).toEqual(input);
  });
});

describe('Zeile in der Liste', () => {
  const w = (extra: Partial<WatcherItem> = {}): WatcherItem => ({
    ...toInput(filled()),
    id: 'w',
    status: 'ok',
    lastFiredAt: null,
    lastAssignees: [],
    armed: true,
    counter: 0,
    subscribed: true,
    lastRun: null,
    entityState: null,
    entityName: null,
    entityUnit: null,
    openCard: null,
    ...extra,
  });

  it('noch nicht ausgelöst, zuletzt ausgelöst mit Person, Zählerstand, fehlende Entität, pausiert', () => {
    expect(watcherLine(w(), nameOf)).toBe('Noch nicht ausgelöst');
    expect(watcherLine(w({ lastFiredAt: '2026-11-04T13:05:00Z', lastAssignees: ['b'] }), nameOf, 'Europe/Berlin')).toBe('Zuletzt 14:05 Uhr → Ben');
    const counted = w({ trigger: { ...toInput(filled()).trigger, count: 3 }, counter: 2, lastFiredAt: '2026-11-04T13:05:00Z' });
    expect(watcherLine(counted, nameOf, 'Europe/Berlin')).toBe('2 von 3 · Zuletzt 14:05 Uhr');
    expect(watcherLine(w({ status: 'entity_missing' }), nameOf)).toBe('Entität fehlt in Home Assistant');
    expect(watcherLine(w({ status: 'target_missing' }), nameOf)).toMatch(/Pausiert/);
  });
});
