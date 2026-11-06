import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import WatcherDesk from '../src/components/WatcherDesk.svelte';
import WatcherDeskWhen from '../src/components/WatcherDeskWhen.svelte';
import WatcherDeskWho from '../src/components/WatcherDeskWho.svelte';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { closeSheet, ui } from '../src/lib/store.svelte';
import { WatcherEditor } from '../src/lib/watcher-editor.svelte';
import type { WatcherSuggestion, WatcherTemplate } from '../src/lib/watcher-types';

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
const hit = (n: number): WatcherSuggestion => ({ templateId: 'battery', entityId: `sensor.g${n}`, name: `Gerät ${n} Battery Level`, label: `Gerät ${n}`, unit: '%', reason: `Gerät ${n}: Batterie bei ${n} %`, variant: 'default' });

function editor(): WatcherEditor {
  const ed = new WatcherEditor(null);
  ed.loading = false;
  ed.templates = [tpl];
  return ed;
}
const html = (ed: WatcherEditor) => render(WatcherDesk, { props: { ed, onclose: () => undefined } }).body;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

beforeEach(() => {
  setLanguage('de');
  closeSheet();
  ui.boards = [{ id: 'b1', name: 'Haushalt' }] as never;
  ui.people = [{ id: 'p1', displayName: 'Rene', isPerson: true, color: null }] as never;
});

describe('Formular „Neuer Wächter“ am Desktop: die Blöcke', () => {
  it('Wenn, Dann und „Wer bekommt die Karte?“ mit Nummern, dazu Vorschau, Mehr Einstellungen und die Knöpfe unten', () => {
    const out = html(editor());
    for (const x of ['data-testid="desk-when"', 'data-testid="desk-then"', 'data-testid="desk-who"', 'data-testid="desk-preview"']) expect(out).toContain(x);
    expect(out).toMatch(/Wenn\s*<\/h3>/);
    expect(out).toMatch(/Dann\s*<\/h3>/);
    expect(out).toContain('Wer bekommt die Karte?');
    expect(out).toContain('Vorschau');
    expect(out).toContain('So erscheint die Karte');
    for (const b of ['Probelauf', 'Abbrechen', 'Wächter anlegen']) expect(out).toContain(b);
    // Reihenfolge im Dokument = Tab-Reihenfolge: Wenn → Dann → Wer → Mehr → unten
    expect(out.indexOf('desk-when')).toBeLessThan(out.indexOf('desk-then'));
    expect(out.indexOf('desk-then')).toBeLessThan(out.indexOf('desk-who'));
    expect(out.indexOf('desk-who')).toBeLessThan(out.indexOf('desk-more-settings'));
    expect(out.indexOf('desk-more-settings')).toBeLessThan(out.indexOf('desk-footer'));
  });

  it('Mehr Einstellungen ist eingeklappt (aria-expanded=false), der Inhalt steht noch nicht da', () => {
    const out = html(editor());
    expect(out).toMatch(/aria-expanded="false"[^>]*aria-controls="[^"]+-more"/);
    expect(out).not.toContain('data-testid="desk-more-body"');
  });

  it('die Pillen im Block Dann: Board, Spalte, Fällig, Priorität, Kategorie (jede mit Beschriftung und eigenem Auswahlfeld)', () => {
    const out = html(editor());
    for (const c of ['Board', 'Spalte', 'Fällig', 'Priorität', 'Kategorie']) expect(out).toContain(`>${c}</span>`);
    expect(count(out, /<select/g)).toBeGreaterThanOrEqual(5);
    expect(out).toContain('aria-label="Board"');
  });

  it('die Bedingungszeile: steigt über, fällt unter, ist; Wert und Wartezeit mit den bekannten Beschriftungen', () => {
    const out = html(editor());
    for (const x of ['steigt über', 'fällt unter', '>ist<', 'länger als', 'aria-label="Schwellwert"', 'aria-label="Wartezeit in Minuten"']) expect(out).toContain(x);
  });

  it('die vier Arten für „Wer“ als Segment, dazu die weiteren in einer Auswahl', () => {
    const out = html(editor());
    for (const x of ['Eine feste Person', 'Wer zuerst heimkommt', 'Fair im Wechsel', 'Alle Anwesenden', 'Erst vorschlagen']) expect(out).toContain(x);
  });

  it('Das Handy-Wort „Weiter“ gibt es hier nicht: kein Schrittweg', () => {
    const out = html(editor());
    expect(out).not.toContain('Weiter: Dann');
    expect(out).not.toContain('wizard-back');
  });
});

describe('Kategorie im Formular', () => {
  it('ohne Vorschlag keine Kennzeichnung', () => {
    expect(html(editor())).not.toContain('data-testid="category-suggested"');
  });
  it('aus Vorlage oder Treffer vorbelegt und als „vorgeschlagen“ gekennzeichnet; Name und Titel nennen das Gerät', () => {
    const ed = editor();
    ed.applySuggestion(hit(7));
    const out = html(ed);
    expect(out).toContain('data-testid="category-suggested"');
    expect(out).toContain('vorgeschlagen');
    expect(out).toContain('Batterien');
    expect(out).toContain('Batterie wechseln: Gerät 7'); // Titel im Feld und in der Vorschau
    expect(out).toContain('Batterie schwach: Gerät 7'); // Name unten
  });
  it('eine selbst gewählte Kategorie ist nicht „vorgeschlagen“', () => {
    const ed = editor();
    ed.applySuggestion(hit(7));
    ed.form = { ...ed.form, category: 'Meine', categorySource: 'user' };
    expect(html(ed)).not.toContain('data-testid="category-suggested"');
  });
});

describe('Vorschau', () => {
  it('der Satz wächst mit dem Formular', () => {
    const ed = editor();
    ed.applySuggestion(hit(7));
    const out = html(ed);
    expect(out).toContain('data-testid="watcher-sentence"');
    expect(out).toContain('Gerät 7 Battery Level');
    expect(out).toContain('Batterie wechseln: Gerät 7');
  });
  it('ohne Entität steht ein Hinweis statt des Verlaufs', () => {
    expect(html(editor())).toContain('Wähle eine Entität, dann erscheint ihr Verlauf.');
  });
  it('mit Entität steht der Verlauf (die Karte „graph-card“)', () => {
    const ed = editor();
    ed.applySuggestion(hit(7));
    expect(html(ed)).toContain('data-testid="entity-graph"');
  });
});

describe('Vorschläge als Chips', () => {
  const when = (n: number, ed = editor()) => render(WatcherDeskWhen, { props: { ed, suggestions: Array.from({ length: n }, (_, i) => hit(i + 1)), onhide: () => undefined } }).body;

  it('die ersten drei als Chips und „+N“ als Knopf mit aria-expanded', () => {
    const out = when(8);
    expect(count(out, /aria-pressed=/g)).toBe(3);
    expect(out).toContain('Gerät 1');
    expect(out).toContain('Gerät 3');
    expect(out).not.toContain('>Gerät 4<');
    expect(out).toMatch(/aria-expanded="false"[^>]*data-testid="desk-more"|data-testid="desk-more"[^>]*aria-expanded="false"/);
    expect(out).toContain('+5');
    expect(out).toContain('aria-label="Alle 8 Vorschläge anzeigen"');
  });
  it('bis drei Vorschläge kein „+N“, ohne Vorschläge keine Zeile', () => {
    expect(when(3)).not.toContain('desk-more');
    expect(when(0)).not.toContain('desk-chips');
  });
  it('der gewählte Vorschlag ist gedrückt', () => {
    const ed = editor();
    ed.applySuggestion(hit(2));
    expect(when(4, ed)).toMatch(/aria-pressed="true"[^>]*>[^]*?Gerät 2/);
  });
  it('das Suchfeld ist ein Kombinationsfeld mit Beschriftung; eine gewählte Entität zeigt Name und rechts die Kennung', () => {
    const ed = editor();
    ed.applySuggestion(hit(2));
    const out = when(1, ed);
    expect(out).toContain('role="combobox"');
    expect(out).toContain('aria-label="Entität suchen"');
    expect(out).toContain('sensor.g2');
  });
});

describe('Wer: Zuweisung', () => {
  const who = (ed: WatcherEditor) => render(WatcherDeskWho, { props: { ed } }).body;
  it('bei „Eine feste Person“ die Auswahl der Personen', () => {
    const ed = editor();
    ed.form.assignMode = 'fixed';
    const out = who(ed);
    expect(out).toContain('aria-label="Personen"');
    expect(out).toContain('Rene');
  });
  it('bei „Fair im Wechsel“ der Schalter „nur wer zu Hause ist“', () => {
    const ed = editor();
    ed.form.assignMode = 'rotation';
    expect(who(ed)).toContain('aria-label="Nur, wer zu Hause ist"');
  });
  it('bei „Niemand“ keine Personen', () => {
    const ed = editor();
    ed.form.assignMode = 'none';
    expect(who(ed)).not.toContain('aria-label="Personen"');
  });
});

describe('Englisch', () => {
  it('das ganze Formular in englischen Worten', () => {
    setLanguage('en');
    const ed = editor();
    ed.applySuggestion(hit(7));
    const out = html(ed);
    for (const x of ['When</h3>', 'Then</h3>', 'Who gets the card?', 'More settings', 'Trial run', 'Cancel', 'suggested', 'rises above', 'falls below', 'Preview', 'How the card will look', 'New watcher']) expect(out).toContain(x);
    expect(out).not.toContain('Wächter anlegen');
  });
});
