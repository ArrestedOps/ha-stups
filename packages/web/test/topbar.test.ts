import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import TopBar from '../src/components/TopBar.svelte';
import { inbox } from '../src/lib/inbox.svelte';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { PATHS } from '../src/lib/symbols/paths';
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
  it('im Add-on: Logo, dann Home, Glocke, Zahnrad (runde Knöpfe, kein Profilbild mehr) (in dieser Reihenfolge)', () => {
    const out = html();
    const order = ['alt=""', 'Zurück zu Home Assistant', 'data-testid="bell"', 'Einstellungen öffnen'].map((n) => at(out, n));
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
    expect(btn).toContain('top-circle');
    expect(btn).toContain('aria-label="Zurück zu Home Assistant"');
  });

  it('der Home-Knopf zeigt das Home-Assistant-Logo (nicht das Haus)', () => {
    const out = html();
    const start = out.indexOf('data-testid="home-button"');
    const btn = out.slice(start, out.indexOf('</button>', start));
    expect(btn).toContain(PATHS['home-assistant']!.slice(0, 24)); // Pfad des Logos
    expect(btn).not.toContain('M3 11l9-8 9 8'); // der frühere Haus-Pfad
  });

  it('Zahl an der Glocke nur bei Ungelesenem: klein, ab 10 „9+", Screenreader-Beschriftung mit Anzahl', () => {
    expect(html()).not.toContain('bell-dot');
    inbox.items = [{ id: 'c:1', kind: 'comment', at: '2026-11-04T09:00:00.000Z' } as never];
    inbox.seenAt = '2026-11-04T09:00:00.000Z';
    expect(html()).not.toContain('bell-dot'); // alles gelesen
    inbox.seenAt = '2026-11-04T08:00:00.000Z';
    const out = html();
    expect(out).toContain('bell-dot');
    expect(out).toMatch(/class="bell-count[^"]*"[^>]*data-testid="bell-dot"[^>]*>1</);
    expect(out).toContain('Mitteilungen, 1 ungelesen');
    inbox.seenAt = null;
    expect(html()).toContain('bell-dot');
    inbox.items = Array.from({ length: 12 }, (_, i) => ({ id: `c:${i}`, kind: 'comment', at: '2026-11-04T09:00:00.000Z' }) as never);
    const many = html();
    expect(many).toMatch(/data-testid="bell-dot"[^>]*>9\+</);
    expect(many).toContain('Mitteilungen, 12 ungelesen');
  });
});
