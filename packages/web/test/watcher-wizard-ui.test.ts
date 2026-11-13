import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import WatcherWizard from '../src/components/WatcherWizard.svelte';
import { WatcherEditor } from '../src/lib/watcher-editor.svelte';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { closeSheet, openSheet, ui } from '../src/lib/store.svelte';

const html = (ed: WatcherEditor) => render(WatcherWizard, { props: { ed } }).body;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

function editor(step: 1 | 2 | 3 | 4): WatcherEditor {
  const ed = new WatcherEditor(null);
  ed.loading = false;
  ed.step = step;
  ed.reached = 4;
  return ed;
}

beforeEach(() => {
  setLanguage('de');
  closeSheet();
});

describe('Zurück im Assistenten: in jedem Schritt sichtbar', () => {
  for (const step of [1, 2, 3, 4] as const) {
    it(`Schritt ${step}: genau ein Zurück-Knopf (nur Text, wie im Entwurf) in der Kopfzeile, benannt „Zurück“`, () => {
      const out = html(editor(step));
      expect(count(out, /aria-label="Zurück"/g)).toBe(1);
      expect(out).toMatch(/<button[^>]*aria-label="Zurück"[^>]*>\s*Zurück/);
    });

    it(`Schritt ${step}: kein „Schließen“ rechts (Escape schließt, Zurück am ersten Schritt)`, () => {
      expect(html(editor(step))).not.toContain('>Schließen<');
    });
  }

  it('Schritt 4 hat daneben Testen und „Wächter anlegen“', () => {
    const out = html(editor(4));
    expect(out).toContain('Testen');
    expect(out).toContain('Wächter anlegen');
  });
});

describe('Zurück-Knopf: was er tut, die Eingaben bleiben', () => {
  it('geht Schritt für Schritt zurück und behält das Formular', () => {
    const ed = editor(4);
    ed.form.name = 'Mein Wächter';
    ed.form.title = 'Meine Aufgabe';
    ed.goBack();
    expect(ed.step).toBe(3);
    ed.goBack();
    expect(ed.step).toBe(2);
    ed.goBack();
    expect(ed.step).toBe(1);
    expect(ed.form).toMatchObject({ name: 'Mein Wächter', title: 'Meine Aufgabe' });
  });

  it('schließt zuerst die offene Suche und bleibt im Schritt', () => {
    const ed = editor(1);
    ed.startPicking('trigger');
    ed.goBack();
    expect(ed.picking).toBeNull();
    expect(ed.step).toBe(1);
  });

  it('am ersten Schritt führt es aus „Gefunden“ dorthin zurück', () => {
    openSheet({ type: 'watcher', id: null, from: 'found' });
    editor(1).goBack();
    expect(ui.sheet).toEqual({ type: 'found' });
  });

  it('am ersten Schritt ohne Herkunft schließt es das Fenster (Reiter Wächter)', () => {
    ui.tab = 'watchers';
    openSheet({ type: 'watcher', id: null });
    editor(1).goBack();
    expect(ui.sheet).toBeNull();
  });
});
