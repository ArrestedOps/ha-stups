import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import WatchersList from '../src/components/WatchersList.svelte';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { ui } from '../src/lib/store.svelte';
import type { WatcherItem } from '../src/lib/watcher-types';

const html = () => render(WatchersList, { props: {} }).body;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

const w = (id: string, subject: string, over: Partial<WatcherItem> = {}): WatcherItem =>
  ({
    id,
    name: 'Batterie schwach',
    active: true,
    status: 'ok',
    trigger: { entityId: `sensor.${id}`, kind: 'below', to: null, value: 20, forMin: 10, count: 1 },
    card: { boardId: 'b', columnId: 'c', title: 'Batterie wechseln', due: { kind: 'none' } },
    assign: { mode: 'none', personIds: [], fallback: 'next', waitFallback: 'none', fallbackPersonId: null },
    done: null,
    subscribed: true,
    lastRun: null,
    counter: 0,
    entityState: '15',
    entityName: subject,
    entityUnit: '%',
    subject,
    deviceLabel: subject,
    nameHasDevice: false,
    defaultName: true,
    suggestedName: `Batterie schwach: ${subject}`,
    suggestedTitle: null,
    openCard: null,
    ...over,
  }) as unknown as WatcherItem;

beforeEach(() => {
  setLanguage('de');
  ui.isAdmin = true;
});

describe('Wächter-Liste: Gerät unter dem Namen', () => {
  it('zehn gleiche Namen sind an der Zeile mit dem Gerät unterscheidbar, alphabetisch nach Gerät', () => {
    ui.watchers = { available: true, items: [w('3', 'iPhone Rene Battery Level'), w('1', 'Bad Fenster Batterie'), w('2', 'Flur Tür Batterie')] };
    const out = html();
    expect(count(out, /data-testid="watcher-subject"/g)).toBe(3);
    const order = [...out.matchAll(/data-testid="watcher-subject">([^<]*)</g)].map((m) => m[1]);
    expect(order).toEqual(['Bad Fenster Batterie', 'Flur Tür Batterie', 'iPhone Rene Battery Level']);
  });

  it('ein Name, der das Gerät schon nennt, bekommt keine Zusatzzeile', () => {
    ui.watchers = { available: true, items: [w('1', 'Bad Fenster Batterie', { name: 'Batterie schwach: Bad Fenster', nameHasDevice: true, defaultName: false, suggestedName: null })] };
    expect(html()).not.toContain('data-testid="watcher-subject"');
  });

  it('die Zeile bricht um, bleibt aber bei einer Zeile (abgeschnitten) in der Karte', () => {
    ui.watchers = { available: true, items: [w('1', 'X'.repeat(120))] };
    expect(html()).toMatch(/class="[^"]*\btruncate\b[^"]*text-tok[^"]*"[^>]*data-testid="watcher-subject"/);
  });
});

describe('Wächter-Liste: Sammelknopf', () => {
  it('erscheint für Administratoren mit Wächtern, die noch den Vorlagennamen tragen', () => {
    ui.watchers = { available: true, items: [w('1', 'Bad'), w('2', 'Flur')] };
    expect(html()).toContain('data-testid="rename-with-device"');
  });

  it('fehlt, wenn nichts zu ergänzen ist (eigene Namen, Gerät schon im Namen)', () => {
    ui.watchers = { available: true, items: [w('1', 'Bad', { defaultName: false, name: 'Mamas Handy' }), w('2', 'Flur', { suggestedName: null, nameHasDevice: true })] };
    expect(html()).not.toContain('data-testid="rename-with-device"');
  });

  it('fehlt für Mitglieder', () => {
    ui.isAdmin = false;
    ui.watchers = { available: true, items: [w('1', 'Bad')] };
    expect(html()).not.toContain('data-testid="rename-with-device"');
  });
});
