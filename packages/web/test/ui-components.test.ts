import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Banner from '../src/components/ui/Banner.svelte';
import Chip from '../src/components/ui/Chip.svelte';
import CtaButton from '../src/components/ui/CtaButton.svelte';
import ListRow from '../src/components/ui/ListRow.svelte';
import SectionHeader from '../src/components/ui/SectionHeader.svelte';
import Segmented from '../src/components/ui/Segmented.svelte';
import SheetFooter from '../src/components/ui/SheetFooter.svelte';
import StatsBar from '../src/components/ui/StatsBar.svelte';
import Tile, { TILE_COLORS, TILE_PX } from '../src/components/ui/Tile.svelte';
import Toggle from '../src/components/ui/Toggle.svelte';

// Die Bausteine werden auf dem Server gerendert (kein DOM nötig); geprüft wird, was Nutzer, Screenreader und die Tests sehen.
const snip = (html: string) => createRawSnippet(() => ({ render: () => html }));
const html = (c: any, props: Record<string, unknown>) => render(c, { props }).body;
const count = (s: string, needle: string | RegExp) => (s.match(typeof needle === 'string' ? new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : new RegExp(needle, 'g')) ?? []).length;

describe('Tile', () => {
  it('trägt Farbe und Größe: klein 34, normal 42, groß 52', () => {
    expect(TILE_PX).toEqual({ sm: 34, md: 42, lg: 52 });
    for (const [size, px] of Object.entries(TILE_PX)) {
      const out = html(Tile, { color: 'blue', size, children: snip('<i>x</i>') });
      expect(out).toContain('tile tile-blue');
      expect(out).toContain(`width: ${px}px`);
      expect(out).toContain('aria-hidden="true"');
    }
  });

  it('jede der acht Farben hat eine Klasse in app.css', async () => {
    const css = (await import('node:fs')).readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
    expect(TILE_COLORS).toHaveLength(8);
    for (const c of TILE_COLORS) expect(css, c).toContain(`.tile-${c} {`);
  });
});

describe('Chip', () => {
  it('normal, aktiv (Verlauf) und Umriss; Größe 40 oder 34', () => {
    expect(html(Chip, { children: snip('Alle') })).toContain('h-10');
    expect(html(Chip, { small: true, children: snip('Alle') })).toContain('h-[34px]');
    expect(html(Chip, { active: true, children: snip('Alle') })).toContain('bg-accent-grad');
    expect(html(Chip, { outline: true, children: snip('Alle') })).toContain('border-accent');
    expect(html(Chip, { children: snip('Alle') })).not.toContain('bg-accent-grad');
  });
  it('Beschriftung für Screenreader und Schaltzustand', () => {
    const out = html(Chip, { label: 'Filter', pressed: true, children: snip('<svg></svg>') });
    expect(out).toContain('aria-label="Filter"');
    expect(out).toContain('aria-pressed="true"');
  });
});

describe('Toggle', () => {
  it('ist ein Schalter mit Beschriftung und Zustand, Tippfläche 44 px hoch', () => {
    const on = html(Toggle, { checked: true, label: 'Push' });
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('aria-label="Push"');
    expect(on).toContain('h-11');
    expect(on).toContain('bg-accent-grad');
    const off = html(Toggle, { checked: false, label: 'Push' });
    expect(off).toContain('aria-checked="false"');
    expect(off).not.toContain('bg-accent-grad');
  });
});

describe('Segmented', () => {
  const items = [{ id: 'a', label: 'Offen' }, { id: 'b', label: 'Erledigt' }];
  it('Auswahl: radiogroup mit radio und aria-checked, aktives Segment mit Verlauf', () => {
    const out = html(Segmented, { items, value: 'b', label: 'Ansicht', onchange: () => {} });
    expect(out).toContain('role="radiogroup"');
    expect(count(out, 'role="radio"')).toBe(2);
    expect(out).toMatch(/aria-checked="true"[^>]*>\s*Erledigt|Erledigt/);
    expect(count(out, 'aria-checked="true"')).toBe(1);
    expect(count(out, 'bg-accent-grad')).toBe(1);
  });
  it('Reiter (Spalten): tablist mit tab und aria-selected', () => {
    const out = html(Segmented, { items, value: 'a', label: 'Spalten', kind: 'tabs', onchange: () => {} });
    expect(out).toContain('role="tablist"');
    expect(count(out, 'role="tab"')).toBe(2);
    expect(count(out, 'aria-selected="true"')).toBe(1);
  });
  it('Höhe 52, klein 44; viele Einträge wischen seitlich', () => {
    expect(html(Segmented, { items, value: 'a', label: 'x', onchange: () => {} })).toContain('h-[52px]');
    expect(html(Segmented, { items, value: 'a', label: 'x', small: true, onchange: () => {} })).toContain('h-11');
    expect(html(Segmented, { items, value: 'a', label: 'x', scroll: true, onchange: () => {} })).toContain('overflow-x-auto');
  });
});

describe('SectionHeader', () => {
  it('Titel als Überschrift, Zähler daneben', () => {
    const out = html(SectionHeader, { title: 'Heute', count: 3 });
    expect(out).toContain('<h2');
    expect(out).toContain('Heute');
    expect(out).toContain('>3<');
    expect(out).not.toContain('aria-expanded');
  });
  it('einklappbar: ein Knopf mit aria-expanded', () => {
    expect(html(SectionHeader, { title: 'Später', open: true })).toContain('aria-expanded="true"');
    expect(html(SectionHeader, { title: 'Später', open: false })).toContain('aria-expanded="false"');
  });
  it('Farbe der Überschrift: Gefahr oder Haus, sonst keine', () => {
    expect(html(SectionHeader, { title: 'Überfällig', tone: 'danger' })).toContain('text-danger');
    expect(html(SectionHeader, { title: 'Vom Haus', tone: 'house' })).toContain('text-house');
    const plain = html(SectionHeader, { title: 'Heute' });
    expect(plain).not.toContain('text-danger');
    expect(plain).not.toContain('text-house');
  });
});

describe('ListRow', () => {
  it('68 px hoch, Titel einzeilig abgeschnitten, Meta-Zeile, genau ein Element rechts', () => {
    const out = html(ListRow, { title: 'Müll raus', meta: snip('<span>heute</span>'), right: snip('<b data-r>›</b>') });
    expect(out).toContain('h-row');
    expect(out).toContain('truncate');
    expect(out).toContain('heute');
    expect(count(out, 'data-r')).toBe(1);
  });
  it('Antippbereich: Knopf bei onclick, Link bei href, sonst eine Fläche', () => {
    expect(html(ListRow, { title: 'A', onclick: () => {} })).toMatch(/<button[^>]*type="button"[^>]*>/);
    const link = html(ListRow, { title: 'A', href: '#/x' });
    expect(link).toContain('<a href="#/x"');
    const plain = html(ListRow, { title: 'A' });
    expect(plain).not.toContain('<button');
    expect(plain).not.toContain('<a ');
  });
  it('Erledigt-Kreis: Checkbox mit Zustand und Beschriftung, Tippfläche 32 × 44', () => {
    const open = html(ListRow, { title: 'A', variant: 'task', check: { done: false, label: 'Erledigen', onchange: () => {} } });
    expect(open).toContain('role="checkbox"');
    expect(open).toContain('aria-checked="false"');
    expect(open).toContain('aria-label="Erledigen"');
    expect(open).toContain('h-11 w-8');
    const done = html(ListRow, { title: 'A', strike: true, check: { done: true, label: 'Wieder öffnen', onchange: () => {} } });
    expect(done).toContain('aria-checked="true"');
    expect(done).toContain('line-through');
    expect(done).toContain('bg-accent-grad');
  });
  it('Erledigt-Kreis: überfällig mit rotem Ring, wartend mit Uhr, gesperrt auf Wunsch', () => {
    const over = html(ListRow, { title: 'A', check: { done: false, label: 'x', onchange: () => {}, state: 'overdue' } });
    expect(over).toContain('border-danger');
    const wait = html(ListRow, { title: 'A', check: { done: false, label: 'x', onchange: () => {}, state: 'waiting' } });
    expect(wait).toContain('border-accent');
    expect(wait).toContain('<svg');
    const off = html(ListRow, { title: 'A', check: { done: false, label: 'x', onchange: () => {}, disabled: true } });
    expect(off).toMatch(/<button[^>]*disabled/);
    expect(html(ListRow, { title: 'A', check: { done: false, label: 'x', onchange: () => {} } })).not.toMatch(/<button[^>]*disabled/);
  });
  it('Beschriftung des Antippbereichs für Screenreader', () => {
    expect(html(ListRow, { title: 'A', label: 'Wächter A öffnen', onclick: () => {} })).toContain('aria-label="Wächter A öffnen"');
    expect(html(ListRow, { title: 'A', onclick: () => {} })).not.toContain('aria-label');
  });
  it('gefährlich: Titel in Gefahr-Farbe', () => {
    expect(html(ListRow, { title: 'Löschen', variant: 'danger' })).toContain('text-danger');
    expect(html(ListRow, { title: 'Löschen' })).not.toContain('text-danger');
  });
  it('Kachel steht links vor dem Titel', () => {
    const out = html(ListRow, { title: 'Bad', tile: snip('<span data-tile></span>') });
    expect(out.indexOf('data-tile')).toBeLessThan(out.indexOf('Bad'));
  });
});

describe('Banner', () => {
  it('der Titel wird abgeschnitten oder bricht auf Wunsch auf zwei Zeilen um', () => {
    expect(html(Banner, { title: 'Ein langer Hinweis' })).toContain('truncate');
    const wrapped = html(Banner, { title: 'Ein langer Hinweis', wrap: true });
    expect(wrapped).toContain('line-clamp-2');
    expect(wrapped).not.toContain('truncate text-[15px]');
  });
  it('lila und warm über die Variablen aus app.css, Höhe wie die Zeile', () => {
    const p = html(Banner, { title: 'Conny stupst dich! 👋', sub: 'Müll raus', variant: 'purple' });
    expect(p).toContain('var(--banner-purple)');
    expect(p).toContain('h-row');
    expect(p).toContain('Müll raus');
    expect(html(Banner, { title: 'x', variant: 'warm' })).toContain('var(--banner-warm)');
  });
  it('mit onclick ein Knopf', () => {
    expect(html(Banner, { title: 'x', onclick: () => {} })).toContain('<button');
    expect(html(Banner, { title: 'x' })).not.toContain('<button');
  });
});

describe('StatsBar', () => {
  it('drei Zellen mit Bezeichnung und Zahl, als Gruppe beschriftet', () => {
    const out = html(StatsBar, { label: 'Stand', items: [{ id: 'a', label: 'Heute fällig', value: 4 }, { id: 'b', label: 'Überfällig', value: 1 }, { id: 'c', label: 'Erledigt', value: 7 }] });
    expect(out).toContain('role="group"');
    expect(out).toContain('aria-label="Stand"');
    for (const s of ['Heute fällig', 'Überfällig', 'Erledigt']) expect(out).toContain(s);
    expect(out).toMatch(/>4</);
    expect(out).toMatch(/>7</);
  });
  it('Zahlen auf Wunsch farbig (Akzent, Gefahr, Grün)', () => {
    const out = html(StatsBar, { label: 'Stand', items: [{ id: 'a', label: 'A', value: 1, tone: 'accent' }, { id: 'b', label: 'B', value: 2, tone: 'danger' }, { id: 'c', label: 'C', value: 3, tone: 'ok' }] });
    expect(out).toContain('text-accent-text');
    expect(out).toContain('text-danger');
    expect(out).toContain('--c-green-fg');
  });
});

describe('CtaButton und SheetFooter', () => {
  it('großer Knopf 56 px mit Verlauf; ghost ohne', () => {
    const cta = html(CtaButton, { children: snip('Speichern') });
    expect(cta).toContain('h-14');
    expect(cta).toContain('bg-accent-grad');
    expect(html(CtaButton, { ghost: true, children: snip('x') })).not.toContain('bg-accent-grad');
    expect(html(CtaButton, { type: 'submit', disabled: true, children: snip('x') })).toMatch(/type="submit"[^>]*disabled|disabled[^>]*type="submit"/);
  });
  it('der Fuß blendet den Inhalt dahinter über den Hintergrund aus', () => {
    const out = html(SheetFooter, { children: snip('<button>OK</button>') });
    expect(out).toContain('var(--bg)');
    expect(out).toContain('OK');
  });
});
