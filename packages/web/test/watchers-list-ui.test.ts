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

  it('das Gerät steht immer unter dem Namen, auch wenn der Name es schon nennt', () => {
    ui.watchers = { available: true, items: [w('1', 'Bad Fenster Batterie', { name: 'Batterie schwach: Bad Fenster' })] };
    expect(count(html(), /data-testid="watcher-subject"/g)).toBe(1);
  });

  it('die Zeile bricht um, bleibt aber bei einer Zeile (abgeschnitten) in der Karte', () => {
    ui.watchers = { available: true, items: [w('1', 'X'.repeat(120))] };
    expect(html()).toMatch(/class="[^"]*\btruncate\b[^"]*text-tok[^"]*"[^>]*data-testid="watcher-subject"/);
  });
});

describe('Wächter-Liste: kein Sammelknopf „Namen mit Gerät ergänzen“ mehr', () => {
  it('auch für Administratoren steht er nicht da', () => {
    ui.watchers = { available: true, items: [w('1', 'Bad'), w('2', 'Flur')] };
    expect(html()).not.toContain('rename-with-device');
    expect(html()).not.toContain('Namen mit Gerät');
  });
});
