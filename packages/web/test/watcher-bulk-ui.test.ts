import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import SelectionBar from '../src/components/SelectionBar.svelte';
import WatcherRow from '../src/components/WatcherRow.svelte';
import WatcherTableRow from '../src/components/WatcherTableRow.svelte';
import type { HomeItem } from '../src/lib/api';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { ui } from '../src/lib/store.svelte';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const item = (over: Partial<HomeItem> = {}): HomeItem => ({
  watcherId: 'w1',
  name: 'Batterie schwach: Tür',
  subject: '',
  status: 'ok',
  entity: 'Tür Batterie',
  value: '26 %',
  phase: 'quiet',
  since: null,
  progress: null,
  nextCard: 'Batterie wechseln',
  entityMissing: false,
  openCard: null,
  nextEvent: null,
  active: true,
  category: 'Batterien',
  trigger: { entityId: 'sensor.tuer_batterie', kind: 'below', to: null, value: 20, forMin: 10, count: 1 },
  entityUnit: '%',
  lastFiredAt: null,
  lastAssigneeIds: [],
  assign: { mode: 'rotation', personIds: [] },
  ...over,
});
const noop = () => undefined;
const props = (over: Record<string, unknown> = {}) => ({ item: item(), nowMs: NOW, canToggle: true, onopen: noop, ontoggle: noop, ...over });
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

beforeEach(() => {
  setLanguage('de');
  ui.people = [];
});

describe('Wächter-Liste: Auswählen', () => {
  it('ohne Auswahlmodus gibt es keine Kästchen', () => {
    expect(count(render(WatcherRow, { props: props() }).body, /data-testid="select-box"/g)).toBe(0);
    expect(count(render(WatcherTableRow, { props: props() }).body, /data-testid="select-box"/g)).toBe(0);
  });

  it('Handy: Kästchen mit Namen des Wächters, gewählt ist angehakt, der Schalter ist gesperrt', () => {
    const on = render(WatcherRow, { props: props({ selecting: true, selected: true, onselect: noop }) }).body;
    expect(count(on, /data-testid="select-box"/g)).toBe(1);
    expect(on).toContain('aria-label="Batterie schwach: Tür auswählen"');
    expect(on).toMatch(/type="checkbox"[^>]*checked/);
    expect(on).toMatch(/role="switch"[^>]*disabled/);
    const off = render(WatcherRow, { props: props({ selecting: true, selected: false, onselect: noop }) }).body;
    expect(off).not.toMatch(/type="checkbox"[^>]*checked/);
  });

  it('Desktop: Kästchen in der Tabellenzeile, die Zeile merkt sich „ausgewählt“', () => {
    const on = render(WatcherTableRow, { props: props({ selecting: true, selected: true, onselect: noop }) }).body;
    expect(count(on, /data-testid="select-box"/g)).toBe(1);
    expect(on).toContain('data-selected');
    expect(on).toContain('aria-label="Batterie schwach: Tür auswählen"');
    const off = render(WatcherTableRow, { props: props({ selecting: true, selected: false, onselect: noop }) }).body;
    expect(off).not.toContain('data-selected');
  });
});

describe('Auswahl-Leiste', () => {
  const actions = [
    { id: 'edit', label: 'Bearbeiten', run: noop },
    { id: 'delete', label: 'Löschen', run: noop, tone: 'danger' as const },
  ];
  const bar = (n: number) => render(SelectionBar, { props: { count: n, actions, ondone: noop } }).body;

  it('zeigt „2 ausgewählt“, die Aktionen und „Fertig“', () => {
    const out = bar(2);
    expect(out).toMatch(/data-testid="selection-count"[^>]*>2 ausgewählt</);
    expect(out).toContain('data-testid="selection-edit"');
    expect(out).toContain('data-testid="selection-delete"');
    expect(out).toContain('data-testid="selection-done"');
    expect(out).not.toMatch(/data-testid="selection-edit"[^>]*disabled/);
  });

  it('ohne Auswahl sind die Aktionen aus, „Fertig“ bleibt', () => {
    const out = bar(0);
    expect(out).toMatch(/disabled[^>]*data-testid="selection-edit"/);
    expect(out).not.toMatch(/disabled[^>]*data-testid="selection-done"/);
  });

  it('englisch', () => {
    setLanguage('en');
    expect(bar(3)).toContain('3 selected');
  });
});
