import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import WatcherCategoryField from '../src/components/WatcherCategoryField.svelte';
import WatcherRow from '../src/components/WatcherRow.svelte';
import WatcherTableRow from '../src/components/WatcherTableRow.svelte';
import type { HomeItem } from '../src/lib/api';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { ui } from '../src/lib/store.svelte';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const item = (over: Partial<HomeItem> = {}): HomeItem => ({
  watcherId: 'w1',
  name: 'Batterie schwach: Tür',
  subject: null,
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
  lastFiredAt: '2026-11-06T09:00:00Z',
  lastAssigneeIds: [],
  assign: { mode: 'fixed', personIds: ['p1'] },
  ...over,
});
const noop = () => undefined;
const props = (over: Record<string, unknown> = {}) => ({ item: item(), nowMs: NOW, canToggle: true, onopen: noop, ontoggle: noop, ...over });
const mobile = (over: Record<string, unknown> = {}) => render(WatcherRow, { props: props(over) }).body;
const table = (over: Record<string, unknown> = {}) => render(WatcherTableRow, { props: props(over) }).body;

beforeEach(() => {
  setLanguage('de');
  ui.people = [{ id: 'p1', name: 'anna', displayName: 'Anna', color: null }] as never;
});

describe('Wächter-Zeile auf dem Handy', () => {
  it('Name, darunter der Entitätsname klein grau, der Stand oben rechts und der Schalter', () => {
    const out = mobile();
    expect(out).toContain('Batterie schwach: Tür');
    expect(out).toMatch(/data-testid="watcher-subject">Tür Batterie</);
    expect(out).toMatch(/data-testid="watcher-value">26 %</);
    expect(out).toMatch(/role="switch"[^>]*aria-checked="true"/);
    expect(out).toContain('aria-label="Batterie schwach: Tür aktiv"');
  });

  it('ohne Recht ist der Schalter sichtbar, aber deaktiviert', () => {
    expect(mobile({ canToggle: false })).toMatch(/role="switch"[^>]*\bdisabled=""/);
    expect(mobile({ canToggle: true })).not.toMatch(/role="switch"[^>]*\bdisabled=""/);
  });

  it('beim Umschalten ist er gesperrt (kein Doppeltipp)', () => {
    expect(mobile({ busy: true })).toMatch(/role="switch"[^>]*\bdisabled=""/);
  });

  it('ausgeschaltet: gedämpft, „Aus", Schalter aus; die Zeile bleibt antippbar', () => {
    const out = mobile({ item: item({ active: false }) });
    expect(out).toMatch(/data-testid="watcher-status">Aus</);
    expect(out).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(out).toContain('opacity-70');
    expect(out).toContain('aria-label="Wächter Batterie schwach: Tür öffnen"');
  });

  it('fehlende Entität steht sichtbar in der Gefahrfarbe', () => {
    const out = mobile({ item: item({ entityMissing: true }) });
    expect(out).toMatch(/class="[^"]*text-danger[^"]*"[^>]*data-testid="watcher-status">Entität fehlt</);
  });

  it('lange Namen laufen nicht über: Titel und Entität werden abgeschnitten', () => {
    const out = mobile({ item: item({ name: 'N'.repeat(120), entity: 'E'.repeat(120) }) });
    expect(out).toMatch(/class="[^"]*\btruncate\b[^"]*text-\[15px\][^"]*">N{120}</);
    expect(out).toMatch(/class="min-w-0 truncate" data-testid="watcher-subject">E{120}</);
  });

  it('der Schalter ist mindestens 44 px hoch', () => {
    expect(mobile()).toMatch(/role="switch"[^>]*class="[^"]*\bh-11\b/);
  });

  it('Läuft gerade und Kommt bald behalten ihre Zeile (danach / Zähler), dazu der Schalter', () => {
    const run = mobile({ current: true, item: item({ phase: 'running', since: '2026-11-06T11:30:00Z' }) });
    expect(run).toContain('danach: Batterie wechseln');
    expect(run).toContain('seit 30 Min.');
    expect(run).toContain('role="switch"');
    const soon = mobile({ current: true, item: item({ phase: 'soon', progress: { n: 2, of: 3 } }) });
    expect(soon).toContain('2 von 3');
    expect(soon).toContain('role="switch"');
  });
});

describe('Wächter-Zeile in der Tabelle (Desktop)', () => {
  it('alle Spalten sind da, jede mit ihrem Inhalt', () => {
    const out = table();
    expect(out).toMatch(/data-testid="watcher-subject">Tür Batterie</);
    expect(out).toMatch(/data-testid="watcher-condition">Wenn Tür Batterie 10 Minuten unter 20 % liegt</);
    expect(out).toMatch(/data-testid="watcher-value">26 %</);
    expect(out).toMatch(/data-testid="watcher-status">[\s\S]*Ruhig/);
    expect(out).toMatch(/data-testid="watcher-last">vor 3 Std\.</);
    expect(out).toMatch(/data-testid="watcher-next">[\s\S]*Batterie wechseln/);
    expect(out).toMatch(/data-testid="watcher-who"/);
    expect(out).toContain('Anna');
  });

  it('noch nie ausgelöst, ohne Stand: „Nie" und ein Strich', () => {
    const out = table({ item: item({ lastFiredAt: null, value: null }) });
    expect(out).toMatch(/data-testid="watcher-last">Nie</);
    expect(out).toMatch(/data-testid="watcher-value">–</);
  });

  it('offene Karte steht als nächste Karte, wenn eine wartet', () => {
    const out = table({ item: item({ phase: 'waiting', openCard: { id: 'c', title: 'Gerade offen', boardId: 'b', assigneeIds: [], createdAt: '2026-11-06T11:00:00Z' } }) });
    expect(out).toMatch(/data-testid="watcher-next">[\s\S]*Gerade offen/);
  });

  it('Spalten richten sich nach der Breite der Liste: schmal weniger, mit denselben Klassen wie der Kopf', () => {
    const out = table();
    expect(out).toContain('grid-cols-[minmax(0,1fr)_4.5rem_7rem_3.25rem]');
    expect(out).toMatch(/class="hidden @min-\[700px\]:block[^"]*"[^>]*data-testid="watcher-condition"/);
    expect(out).toMatch(/class="hidden @min-\[900px\]:block[^"]*"[^>]*data-testid="watcher-last"/);
    expect(out).toMatch(/class="hidden @min-\[1100px\]:flex[^"]*"[^>]*data-testid="watcher-next"/);
  });

  it('Schalter: ohne Recht deaktiviert, ausgeschaltet gedämpft mit „Aus", die Zeile öffnet über den Namen', () => {
    expect(table({ canToggle: false })).toMatch(/role="switch"[^>]*\bdisabled=""/);
    const off = table({ item: item({ active: false }) });
    expect(off).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(off).toMatch(/data-testid="watcher-status">[\s\S]*Aus/);
    expect(off).toContain('opacity-70');
    expect(off).toContain('aria-label="Wächter Batterie schwach: Tür öffnen"');
  });

  it('fehlende Entität: Status rot beschriftet', () => {
    expect(table({ item: item({ entityMissing: true }) })).toMatch(/text-danger[^>]*>●<\/span><span class="truncate">Entität fehlt/);
  });
});

describe('Kategorie-Auswahl', () => {
  const field = (over: Record<string, unknown> = {}) => render(WatcherCategoryField, { props: { value: '', options: [], onchange: noop, ...over } }).body;

  it('Ohne Kategorie, die vorhandenen alphabetisch ohne Doppelte, am Ende „Neue Kategorie …"', () => {
    const out = field({ options: ['Keller', 'garten', 'Garten', 'Batterien'] });
    const opts = [...out.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
    expect(opts).toEqual(['Ohne Kategorie', 'Batterien', 'garten', 'Keller', 'Neue Kategorie …']);
  });

  it('die vorgeschlagene Kategorie steht dabei und ist gewählt, auch wenn sie neu ist', () => {
    const out = field({ value: 'Haushaltsgeräte', options: ['Batterien'] });
    expect([...out.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1])).toContain('Haushaltsgeräte');
    expect(out).toMatch(/<option[^>]*selected[^>]*>Haushaltsgeräte</);
  });

  it('nur lesend: das Feld ist deaktiviert', () => {
    expect(field({ value: 'X', disabled: true })).toMatch(/<select[^>]*\bdisabled=""/);
  });

  it('englisch', () => {
    setLanguage('en');
    const out = field();
    expect(out).toContain('No category');
    expect(out).toContain('New category …');
  });
});
