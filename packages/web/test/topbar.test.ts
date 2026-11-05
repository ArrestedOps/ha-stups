import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import TopBar from '../src/components/TopBar.svelte';
import { inbox } from '../src/lib/inbox.svelte';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { ui } from '../src/lib/store.svelte';

// Kopf aller Reiter, auf dem Server gerendert: Reihenfolge der Knöpfe, Home nur im Add-on, Punkt an der Glocke nur für Ungelesenes
const html = () => render(TopBar, { props: { title: 'Aufgaben', sub: 'Heute' } }).body;
const at = (s: string, needle: string) => s.indexOf(needle);

beforeEach(() => {
  setLanguage('de');
  ui.caps = null;
  ui.me = { id: 'u1', displayName: 'Anna', name: 'anna', color: '#ff0000' } as never;
  inbox.items = [];
  inbox.seenAt = null;
});

describe('Kopfzeile', () => {
  it('im Add-on: Logo, stups., dann Home, Glocke, Zahnrad, Profil (in dieser Reihenfolge)', () => {
    const out = html();
    const order = ['alt=""', 'stups<span', 'Zurück zu Home Assistant', 'data-testid="bell"', 'Einstellungen öffnen', 'Profil öffnen'].map((n) => at(out, n));
    expect(order.every((i) => i >= 0), JSON.stringify(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(out).toContain('data-testid="home-button"');
  });

  it('ohne Home Assistant (eigener Container): kein Home-Knopf, der Rest bleibt', () => {
    ui.caps = { auth: 'session' } as never;
    const out = html();
    expect(out).not.toContain('home-button');
    expect(out).not.toContain('Zurück zu Home Assistant');
    expect(out).toContain('data-testid="bell"');
    expect(out).toContain('Einstellungen öffnen');
  });

  it('der Home-Knopf ist 44 × 44 und hat einen Namen', () => {
    const btn = html().match(/<button[^>]*home-button[^>]*>/)![0];
    expect(btn).toContain('h-11 w-11');
    expect(btn).toContain('aria-label="Zurück zu Home Assistant"');
  });

  it('Punkt an der Glocke nur bei Ungelesenem', () => {
    expect(html()).not.toContain('bell-dot');
    inbox.items = [{ id: 'c:1', kind: 'comment', at: '2026-11-04T09:00:00.000Z' } as never];
    inbox.seenAt = '2026-11-04T09:00:00.000Z';
    expect(html()).not.toContain('bell-dot'); // alles gelesen
    inbox.seenAt = '2026-11-04T08:00:00.000Z';
    const out = html();
    expect(out).toContain('bell-dot');
    expect(out).toContain('Mitteilungen, es gibt Ungelesenes');
    inbox.seenAt = null;
    expect(html()).toContain('bell-dot');
  });
});
