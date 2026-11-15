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

describe('Gemeinsam einrichten: mehrere Geräte im Assistenten', () => {
  const hits = [1, 2, 3].map((n) => ({ entityId: `sensor.bat_${n}`, name: `Gerät ${n}`, reason: `Gerät ${n}: Batterie bei ${n} %`, unit: '%' }));
  function many(step: 1 | 2 | 3 | 4) {
    const ed = editor(step);
    ed.devices = hits;
    ed.form.entityId = 'sensor.bat_1';
    ed.form.entityName = 'Gerät 1';
    return ed;
  }

  it('Schritt 1 zeigt statt der Entität die Geräteleiste und den Überblick mit einer Zeile je Gerät', () => {
    const out = html(many(1));
    expect(count(out, /data-testid="device-row"/g)).toBe(3);
    expect(out).toContain('3 Geräte');
    expect(out).toContain('data-testid="device-strip"');
    expect(out).toContain('Alle 3');
    expect(out).toContain('sensor.bat_2');
    expect(out).not.toContain('data-testid="when-entity"');
  });

  it('ein gewähltes Gerät zeigt seinen eigenen Verlauf statt des Überblicks; „Alle“ bringt ihn zurück', () => {
    const ed = many(1);
    ed.focus = 'sensor.bat_2';
    const one = html(ed);
    expect(count(one, /data-testid="device-row"/g)).toBe(0);
    expect(one).toContain('data-testid="graph-card"');
    expect(one).toContain('Gerät 2');
    ed.focus = 'all';
    expect(count(html(ed), /data-testid="device-row"/g)).toBe(3);
  });

  it('Schritt 2 zeigt den Titel der Aufgabe je Gerät, wie ihn Stups setzt', () => {
    const ed = many(2);
    ed.form.title = 'Batterie wechseln';
    const out = html(ed);
    expect(out).toContain('data-testid="device-strip"');
    expect(out).toContain('Batterie wechseln: Gerät 1');
    expect(out).toContain('Batterie wechseln: Gerät 3');
  });

  it('Schritt 3 sagt ehrlich, dass die Zuständigen für alle gelten und je Gerät nichts festgelegt wird', () => {
    const out = html(many(3));
    expect(out).toContain('data-testid="devices-who-note"');
    expect(out).toContain('Wer dran ist, entscheidet sich erst, wenn eine Aufgabe entsteht');
    expect(out).not.toContain('data-testid="device-strip"');
  });

  it('Schritt 4 zeigt die Geräteleiste und den Probelauf je Gerät', () => {
    const ed = many(4);
    ed.deviceProbe = { 'sensor.bat_1': { fired: [{ at: '2026-01-01T00:00:00Z' }, { at: '2026-01-02T00:00:00Z' }], quick: 0, sentence: '', points: [], noHistory: false, truncated: false, from: '', to: '' }, 'sensor.bat_2': { fired: [], quick: 0, sentence: '', points: [], noHistory: true, truncated: false, from: '', to: '' } };
    const out = html(ed);
    expect(out).toContain('data-testid="device-strip"');
    expect(out).toContain('2 × ausgelöst');
    expect(out).toContain('keine Historie');
  });

  it('gewählte und neu dazugenommene Geräte: abgewähltes Gerät kommt mit addDevice zurück, ein neues steht danach in der Liste', () => {
    const ed = many(1);
    ed.toggleDevice('sensor.bat_2');
    expect(ed.selectedDevices).toHaveLength(2);
    ed.addDevice(hits[1]!);
    expect(ed.selectedDevices).toHaveLength(3);
    ed.addDevice({ entityId: 'sensor.bat_9', name: 'Gerät 9' });
    expect(ed.devices.map((d) => d.entityId)).toContain('sensor.bat_9');
    expect(ed.selectedDevices).toHaveLength(4);
  });

  it('wird das gezeigte Gerät abgewählt, springt die Leiste auf „Alle“', () => {
    const ed = many(1);
    ed.focus = 'sensor.bat_2';
    ed.toggleDevice('sensor.bat_2');
    expect(ed.focus).toBe('all');
  });

  it('abgewählte Geräte sind nicht mehr angehakt, der Knopf zählt nur die gewählten', () => {
    const ed = many(4);
    ed.toggleDevice('sensor.bat_2');
    expect(ed.selectedDevices.map((d) => d.entityId)).toEqual(['sensor.bat_1', 'sensor.bat_3']);
    expect(html(ed)).toContain('2 Wächter anlegen');
    expect(html(many(4))).toContain('3 Wächter anlegen');
  });

  it('mindestens ein Gerät bleibt gewählt', () => {
    const ed = many(1);
    ed.toggleDevice('sensor.bat_1');
    ed.toggleDevice('sensor.bat_2');
    ed.toggleDevice('sensor.bat_3');
    expect(ed.selectedDevices.map((d) => d.entityId)).toEqual(['sensor.bat_3']);
  });

  it('wird das erste Gerät abgewählt, rückt das nächste an die Stelle der Entität (auch beim Erledigen)', () => {
    const ed = many(1);
    ed.form.doneOn = true;
    ed.form.doneEntityId = 'sensor.bat_1';
    ed.toggleDevice('sensor.bat_1');
    expect(ed.form.entityId).toBe('sensor.bat_2');
    expect(ed.form.entityName).toBe('Gerät 2');
    expect(ed.form.doneEntityId).toBe('sensor.bat_2');
  });

  it('mit einem Gerät bleibt alles wie bisher', () => {
    const ed = editor(4);
    expect(html(ed)).toContain('Wächter anlegen');
    expect(html(ed)).not.toContain('2 Wächter anlegen');
    const one = editor(1);
    expect(html(one)).not.toContain('data-testid="device-row"');
  });
});
