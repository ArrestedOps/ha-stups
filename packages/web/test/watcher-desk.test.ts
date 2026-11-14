import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeItem } from '../src/lib/api';
import { api } from '../src/lib/api';
import { closeSheet, openNewWatcher, selectTab, ui } from '../src/lib/store.svelte';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { autoName, categorySuggested, deskProblem, deskConditionItems, deskModeOf, formDirty, listSummary, presentOnly, suggestionChips, withDeskMode, withPresentOnly } from '../src/lib/watcher-desk';
import { WatcherEditor } from '../src/lib/watcher-editor.svelte';
import type { SavedWatcher, WatcherSuggestion, WatcherTemplate } from '../src/lib/watcher-types';
import { applyTemplate, emptyForm } from '../src/lib/watchers';

const tpl: WatcherTemplate = {
  id: 'battery',
  kind: 'watcher',
  title: 'Batterie schwach',
  hint: '',
  domain: 'sensor',
  search: 'battery',
  draft: { name: 'Batterie schwach', trigger: { kind: 'below', value: 20, forMin: 10 }, card: { title: 'Batterie wechseln', due: { kind: 'none' } }, assign: { mode: 'rotation_present' }, done: null },
  recurring: null,
  canSelfComplete: true,
  whyNoSelfComplete: null,
  category: 'Batterien',
};
const hit = (n: number, templateId = 'battery'): WatcherSuggestion => ({
  templateId,
  entityId: `sensor.geraet_${n}`,
  name: `Gerät ${n} Battery Level`,
  label: `Gerät ${n}`,
  unit: '%',
  reason: `Gerät ${n}: Batterie bei ${n} %`,
  variant: 'default',
});

beforeEach(() => {
  closeSheet();
  ui.desktop = false;
  ui.newWatcher = null;
  ui.confirm = null;
});
afterEach(() => vi.restoreAllMocks());

describe('Wer bekommt die Aufgabe: vier Arten als Segment', () => {
  it('ordnet die sieben Arten den vier Segmenten zu; „Erst vorschlagen“ und „Niemand“ stehen außerhalb', () => {
    expect(deskModeOf('fixed')).toBe('fixed');
    expect(deskModeOf('first_home')).toBe('first_home');
    expect(deskModeOf('rotation')).toBe('rotation');
    expect(deskModeOf('rotation_present')).toBe('rotation');
    expect(deskModeOf('all_present')).toBe('all_present');
    expect(deskModeOf('suggest')).toBeNull();
    expect(deskModeOf('none')).toBeNull();
  });

  it('„Fair im Wechsel“ behält „nur Anwesende“, wenn es schon gilt, sonst reihum', () => {
    expect(withDeskMode({ ...emptyForm(), assignMode: 'rotation_present' }, 'rotation').assignMode).toBe('rotation_present');
    expect(withDeskMode({ ...emptyForm(), assignMode: 'fixed' }, 'rotation').assignMode).toBe('rotation');
  });

  it('„Eine feste Person“ wählt mich vor, wenn noch niemand gewählt ist; eine vorhandene Wahl bleibt', () => {
    expect(withDeskMode(emptyForm(), 'fixed', 'p1')).toMatchObject({ assignMode: 'fixed', personIds: ['p1'] });
    expect(withDeskMode({ ...emptyForm(), personIds: ['p2'] }, 'fixed', 'p1').personIds).toEqual(['p2']);
    expect(withDeskMode(emptyForm(), 'fixed', null).personIds).toEqual([]);
    expect(withDeskMode(emptyForm(), 'first_home', 'p1')).toMatchObject({ assignMode: 'first_home', personIds: [] });
  });

  it('der Schalter „nur wer zu Hause ist“ wechselt zwischen reihum und anwesend reihum', () => {
    const f = { ...emptyForm(), assignMode: 'rotation' as const };
    expect(presentOnly(f)).toBe(false);
    expect(withPresentOnly(f, true).assignMode).toBe('rotation_present');
    expect(presentOnly(withPresentOnly(f, true))).toBe(true);
    expect(withPresentOnly(withPresentOnly(f, true), false).assignMode).toBe('rotation');
  });
});

describe('Entwurf: wurde etwas eingegeben?', () => {
  it('ohne Ausgangsstand gilt das Formular als unberührt', () => {
    expect(formDirty(emptyForm('b', 'c'), null)).toBe(false);
  });
  it('gleiche Werte sind nicht geändert, jede Eingabe schon', () => {
    const start = emptyForm('b', 'c');
    expect(formDirty({ ...start }, start)).toBe(false);
    expect(formDirty({ ...start, title: 'x' }, start)).toBe(true);
    expect(formDirty({ ...start, personIds: ['p'] }, start)).toBe(true);
  });
});

describe('Name, wenn der Mensch keinen eingibt', () => {
  it('mit Vorlage: der Vorlagenname ohne Gerät; sonst der Name der Entität; ohne alles leer', () => {
    const f = applyTemplate(emptyForm('b', 'c'), tpl, { entityId: 'sensor.x', name: 'iPhone Rene Battery Level', unit: '%' });
    expect(autoName(f)).toBe('Batterie schwach');
    expect(autoName({ ...emptyForm(), entityName: 'Tür Waschküche' })).toBe('Tür Waschküche');
    expect(autoName(emptyForm())).toBe('');
  });
});

describe('Was fehlt zuerst (Reihenfolge auf dem Bildschirm)', () => {
  it('der Name steht zuletzt, weil er sich selbst füllt: zuerst fehlt die Entität', () => {
    expect(deskProblem(emptyForm('b', 'c'))).toMatch(/Entität/);
  });
  it('fehlt nur der Name, meldet es den Namen', () => {
    const f = { ...emptyForm('b', 'c'), entityId: 'sensor.x', entityName: 'X', value: '5', title: 'T', assignMode: 'none' as const };
    expect(deskProblem(f)).toBe('Gib dem Wächter einen Namen.');
    expect(deskProblem({ ...f, name: 'N' })).toBeNull();
  });
});

describe('Kategorie: vorgeschlagen oder selbst gewählt', () => {
  it('Vorlage und Entität schlagen vor, was der Mensch wählt, ist nicht „vorgeschlagen“', () => {
    expect(categorySuggested({ ...emptyForm(), category: 'Batterien', categorySource: 'template' })).toBe(true);
    expect(categorySuggested({ ...emptyForm(), category: 'Klima', categorySource: 'entity' })).toBe(true);
    expect(categorySuggested({ ...emptyForm(), category: 'Meine', categorySource: 'user' })).toBe(false);
    expect(categorySuggested({ ...emptyForm(), category: '', categorySource: 'template' })).toBe(false);
  });
});

describe('Vorschlags-Chips', () => {
  it('die ersten drei als Chips, der Rest als „+N“', () => {
    const items = Array.from({ length: 8 }, (_, i) => hit(i));
    const r = suggestionChips(items);
    expect(r.chips.map((c) => c.label)).toEqual(['Gerät 0', 'Gerät 1', 'Gerät 2']);
    expect(r.more).toBe(5);
  });
  it('wenige Treffer: keine „+N“; keine Treffer: nichts', () => {
    expect(suggestionChips([hit(1), hit(2)])).toMatchObject({ more: 0 });
    expect(suggestionChips([])).toEqual({ chips: [], more: 0 });
  });
  it('ohne Kurznamen steht der Name der Entität', () => {
    expect(suggestionChips([{ ...hit(1), label: undefined }]).chips[0]!.label).toBe('Gerät 1 Battery Level');
  });
});

describe('Bedingung als Segment', () => {
  it('steigt über, fällt unter, ist (deutsch und englisch)', () => {
    expect(deskConditionItems()).toEqual([
      { id: 'above', label: 'steigt über' },
      { id: 'below', label: 'fällt unter' },
      { id: 'state', label: 'ist' },
    ]);
    setLanguage('en');
    expect(deskConditionItems().map((c) => c.label)).toEqual(['rises above', 'falls below', 'is']);
  });
});

describe('Kopfzeile über der Liste', () => {
  let n = 0;
  const item = (phase: HomeItem['phase'], active = true) => ({ phase, active, name: 'W', watcherId: `w${n++}`, subject: null, since: null, category: null }) as unknown as HomeItem;
  it('zählt alle, die aktuellen (wartet, läuft, bald) und die ausgeschalteten', () => {
    expect(listSummary([item('quiet'), item('running'), item('waiting'), item('soon'), item('quiet', false), item('running', false)])).toEqual({ total: 6, current: 3, off: 2 });
    expect(listSummary([])).toEqual({ total: 0, current: 0, off: 0 });
  });
});

describe('openNewWatcher: Desktop klappt den Bereich auf, das Handy öffnet den Assistenten', () => {
  const request = { template: 'battery', hit: { entityId: 'sensor.x', name: 'X' } };

  it('Handy: das Fenster, wie bisher (auch mit Herkunft)', () => {
    openNewWatcher({ ...request, from: 'found' });
    expect(ui.sheet).toEqual({ type: 'watcher', id: null, template: 'battery', from: 'found', hit: request.hit });
    expect(ui.newWatcher).toBeNull();
  });

  it('Desktop: kein Fenster, der Reiter Wächter und eine Anfrage an die Ansicht', () => {
    ui.desktop = true;
    ui.tab = 'tasks';
    openNewWatcher({ ...request, from: 'found' });
    expect(ui.sheet).toBeNull();
    expect(ui.tab).toBe('watchers');
    expect(ui.newWatcher).toMatchObject(request);
  });

  it('Desktop ohne Angaben: ein leerer Entwurf', () => {
    ui.desktop = true;
    openNewWatcher();
    expect(ui.newWatcher).not.toBeNull();
    expect(ui.newWatcher!.template).toBeUndefined();
  });

  it('Reiter wechseln verwirft eine offene Anfrage nicht (die Ansicht liest sie beim Öffnen)', () => {
    ui.desktop = true;
    openNewWatcher(request);
    selectTab('watchers');
    expect(ui.newWatcher).not.toBeNull();
  });
});

describe('Editor im Formular am Desktop', () => {
  const saved = (metNow: unknown = null): SavedWatcher => ({ id: 'w1', card: { title: 'Batterie wechseln' }, metNow }) as unknown as SavedWatcher;
  const ready = (ed: WatcherEditor) => {
    ed.form = { ...emptyForm('b', 'c'), name: 'N', entityId: 'sensor.x', entityName: 'X', value: '20', title: 'T', assignMode: 'none' as const };
  };

  it('applySuggestion füllt wie „Einrichten“ im Assistenten: Entität, Bedingung, Name und Titel der Vorlage, Kategorie', () => {
    const ed = new WatcherEditor(null);
    ed.templates = [tpl];
    ed.applySuggestion(hit(7));
    expect(ed.form).toMatchObject({
      entityId: 'sensor.geraet_7',
      kind: 'below',
      value: '20',
      forMin: '10',
      name: 'Batterie schwach',
      title: 'Batterie wechseln',
      category: 'Batterien',
      categorySource: 'template',
      assignMode: 'rotation_present',
    });
    expect(ed.picking).toBeNull();
  });

  it('applySuggestion ohne bekannte Vorlage wählt wenigstens die Entität', () => {
    const ed = new WatcherEditor(null);
    ed.applySuggestion(hit(3, 'unbekannt'));
    expect(ed.form).toMatchObject({ entityId: 'sensor.geraet_3', entityName: 'Gerät 3 Battery Level' });
  });

  it('applySuggestion überschreibt eine von Hand gewählte Kategorie nicht', () => {
    const ed = new WatcherEditor(null);
    ed.templates = [tpl];
    ed.form = { ...ed.form, category: 'Meine', categorySource: 'user' };
    ed.applySuggestion(hit(1));
    expect(ed.form.category).toBe('Meine');
  });

  it('Speichern läuft über dieselbe Funktion: der Haken `onsaved` ersetzt nur das Schließen, die Rückfrage kommt weiterhin', async () => {
    const done = vi.fn();
    const ed = new WatcherEditor(null, { onsaved: done });
    ready(ed);
    const met = { entityName: 'Tür', stateText: 'aus', reason: 'already_met' as const };
    vi.spyOn(api, 'createWatcher').mockResolvedValue(saved(met));
    const fire = vi.spyOn(api, 'fireWatcherNow').mockResolvedValue(saved());
    ui.sheet = { type: 'found' };
    await ed.save();
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }));
    expect(ui.sheet).toEqual({ type: 'found' }); // back() wurde nicht aufgerufen
    expect(ui.confirm?.label).toBe('Ja, Aufgabe erstellen');
    await ui.confirm!.run();
    expect(fire).toHaveBeenCalledWith('w1');
  });

  it('ohne Haken verhält sich der Editor wie bisher (schließt das Fenster)', async () => {
    const ed = new WatcherEditor(null);
    ready(ed);
    vi.spyOn(api, 'createWatcher').mockResolvedValue(saved());
    ui.tab = 'watchers';
    ui.sheet = { type: 'watcher', id: null };
    await ed.save();
    expect(ui.sheet).toBeNull();
  });

  it('ein Fehler beim Speichern ruft den Haken nicht auf', async () => {
    const done = vi.fn();
    const ed = new WatcherEditor(null, { onsaved: done });
    ready(ed);
    vi.spyOn(api, 'createWatcher').mockRejectedValue(new Error('kaputt'));
    await ed.save();
    expect(done).not.toHaveBeenCalled();
    expect(ed.busy).toBe(false);
  });
});
