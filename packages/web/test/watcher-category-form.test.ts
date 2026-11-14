import { describe, expect, it } from 'vitest';
import type { HaEntity, WatcherItem, WatcherTemplate } from '../src/lib/watcher-types';
import { applyEntity, applyTemplate, emptyForm, fromWatcher, toInput, withCategory, type WatcherForm } from '../src/lib/watchers';

const tpl = (category: string | null | undefined): WatcherTemplate => ({
  id: 'battery',
  kind: 'watcher',
  title: 'Batterie schwach',
  hint: '',
  domain: 'sensor',
  search: '',
  draft: { name: 'Batterie schwach', trigger: { kind: 'below', value: 20, forMin: 10 }, card: { title: 'Batterie wechseln', due: { kind: 'none' } }, assign: { mode: 'rotation_present' }, done: null },
  recurring: null,
  canSelfComplete: true,
  whyNoSelfComplete: null,
  ...(category === undefined ? {} : { category }),
});
const entity = (category: string | undefined): HaEntity => ({ entityId: 'sensor.x', name: 'X', state: '1', unit: '%', domain: 'sensor', ...(category ? { category } : {}) });

describe('Kategorie im Formular', () => {
  it('ein leeres Formular hat keine Kategorie', () => {
    expect(emptyForm()).toMatchObject({ category: '', categorySource: '' });
  });

  it('die Vorlage belegt die Kategorie vor', () => {
    const f = applyTemplate(emptyForm('b', 'c'), tpl('Batterien'));
    expect(f).toMatchObject({ category: 'Batterien', categorySource: 'template' });
  });

  it('eine Vorlage ohne Kategorie lässt das Feld, wie es ist', () => {
    expect(applyTemplate(emptyForm('b', 'c'), tpl(null)).category).toBe('');
    expect(applyTemplate(emptyForm('b', 'c'), tpl(undefined)).category).toBe('');
  });

  it('die Entität schlägt eine Kategorie vor, solange nichts Besseres da ist', () => {
    const f = applyEntity(emptyForm('b', 'c'), entity('Klima'));
    expect(f).toMatchObject({ category: 'Klima', categorySource: 'entity' });
    // eine zweite Entität ersetzt den Entitäts-Vorschlag
    expect(applyEntity(f, entity('Energie')).category).toBe('Energie');
  });

  it('die Vorlage hat Vorrang vor der Entität: eine später gewählte Entität überschreibt sie nicht', () => {
    const f = applyEntity(applyTemplate(emptyForm('b', 'c'), tpl('Batterien')), entity('Klima'));
    expect(f).toMatchObject({ category: 'Batterien', categorySource: 'template' });
  });

  it('eine von Hand gewählte Kategorie bleibt: weder Vorlage noch Entität überschreiben sie', () => {
    const f = withCategory(emptyForm('b', 'c'), 'Meine');
    expect(f).toMatchObject({ category: 'Meine', categorySource: 'user' });
    expect(applyEntity(f, entity('Klima')).category).toBe('Meine');
    expect(applyTemplate(f, tpl('Batterien')).category).toBe('Meine');
  });

  it('Entität ohne Vorschlag ändert nichts', () => {
    expect(applyEntity(emptyForm('b', 'c'), entity(undefined)).category).toBe('');
  });

  const input = (f: WatcherForm) => toInput({ ...f, name: 'N', entityId: 'sensor.x', value: '5', title: 'T', boardId: 'b', columnId: 'c' });
  it('zum Server: getrimmt, leer wird null', () => {
    expect(input({ ...emptyForm('b', 'c'), category: '  Batterien ' }).category).toBe('Batterien');
    expect(input({ ...emptyForm('b', 'c'), category: '   ' }).category).toBeNull();
  });

  it('Bearbeiten: die gespeicherte Kategorie kommt zurück und wird nie von Vorschlägen überschrieben', () => {
    const item = { ...input({ ...emptyForm('b', 'c'), category: 'Garten' }), id: 'w', status: 'ok' } as unknown as WatcherItem;
    const f = fromWatcher(item);
    expect(f).toMatchObject({ category: 'Garten', categorySource: 'user' });
    expect(applyEntity(f, entity('Klima')).category).toBe('Garten');
    // ein Wächter ohne Kategorie bleibt beim Bearbeiten ohne, auch wenn eine andere Entität gewählt wird
    const none = fromWatcher({ ...item, category: null });
    expect(none).toMatchObject({ category: '', categorySource: 'user' });
    expect(applyEntity(none, entity('Klima')).category).toBe('');
  });
});

describe('Vorlage mit „erledigt sich“ als Zustand (Fenster wieder zu)', () => {
  it('übernimmt den Zustand ins Formular, mit der Entität des Treffers', () => {
    const tplState = {
      id: 'window_open',
      kind: 'watcher' as const,
      title: 'Fenster lange offen',
      hint: '',
      domain: 'binary_sensor',
      search: '',
      draft: {
        name: 'Fenster lange offen',
        trigger: { kind: 'state' as const, to: 'on', forMin: 30 },
        card: { title: 'Fenster schließen', due: { kind: 'none' as const } },
        assign: { mode: 'rotation_present' as const },
        done: { kind: 'state' as const, to: 'off' },
      },
      recurring: null,
      canSelfComplete: true,
      whyNoSelfComplete: null,
    };
    const f = applyTemplate(emptyForm('b', 'c'), tplState, { entityId: 'binary_sensor.fenster', name: 'Fenster Bad' });
    expect(f).toMatchObject({ kind: 'state', to: 'on', forMin: '30', doneOn: true, doneKind: 'state', doneTo: 'off', doneEntityId: 'binary_sensor.fenster' });
    expect(toInput(f).done).toEqual({ entityId: 'binary_sensor.fenster', kind: 'state', to: 'off', value: null });
  });
});
