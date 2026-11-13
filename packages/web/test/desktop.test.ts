import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import CardMeta from '../src/components/CardMeta.svelte';
import DesktopHeader from '../src/components/DesktopHeader.svelte';
import Sidebar from '../src/components/Sidebar.svelte';
import TopBar from '../src/components/TopBar.svelte';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { closeDetail, openCard, openSheet, selectTab, setDesktop, ui } from '../src/lib/store.svelte';

// Die Desktop-Ansicht (ab 1024 px): Seitenleiste, Kopfzeile, Regel für Aufgaben und Sheets. Auf dem Server gerendert, wie die übrigen Bausteine.
const me = { id: 'u1', displayName: 'Anna', name: 'anna', color: '#ff0000', isPerson: true } as never;
const boards = [
  { id: 'b1', name: 'Haushalt', icon: null, color: null, openCards: 4 },
  { id: 'b2', name: 'Umbau', icon: null, color: 'blue', openCards: 2 },
] as never;

beforeEach(() => {
  setLanguage('de');
  ui.caps = null;
  ui.me = me;
  ui.isChild = false;
  ui.isAdmin = true;
  ui.boards = boards;
  ui.boardId = 'b1';
  ui.view = null;
  ui.tab = 'tasks';
  ui.sheet = null;
  ui.detailId = null;
  ui.query = '';
  ui.filter.search = '';
  ui.tasksCalendar = false;
  ui.desktop = true;
});

describe('Seitenleiste', () => {
  it('Navigation „Ansicht“ wie die Leiste unten: drei Reiter, der aktive mit aria-current', () => {
    ui.tab = 'boards';
    const out = render(Sidebar).body;
    expect(out).toContain('aria-label="Ansicht"');
    for (const label of ['Aufgaben', 'Boards', 'Wächter']) expect(out).toContain(label);
    const active = [...out.matchAll(/<button[^>]*aria-current="page"[^>]*>/g)];
    expect(active).toHaveLength(1);
    expect(out.slice(out.indexOf(active[0]![0]), out.indexOf(active[0]![0]) + 900)).toContain('Boards');
  });

  it('ein Kind sieht keine Wächter, aber „Neues Board“ (dort legt es nur Boards „Nur ich“ an)', () => {
    ui.isChild = true;
    const out = render(Sidebar).body;
    expect(out).not.toContain('Wächter');
    expect(out).toContain('Neues Board');
    expect(out).toContain('Kind');
  });

  it('Boards mit Farbpunkt, Name und Zahl; das geöffnete Board ist hervorgehoben', () => {
    ui.tab = 'boards';
    const out = render(Sidebar).body;
    expect(out).toContain('Haushalt');
    expect(out).toContain('Umbau');
    expect(out).toContain('aria-label="4 offen"');
    expect(out).toContain('var(--c-blue-fg)'); // Farbe des Boards über ein Token
    expect(out.match(/aria-current="true"/g)).toHaveLength(1);
    ui.tab = 'tasks';
    expect(render(Sidebar).body).not.toContain('aria-current="true"'); // außerhalb von Boards ist keins „geöffnet“
  });

  it('unten die Person mit Rolle und dem Zahnrad „Einstellungen öffnen“', () => {
    const out = render(Sidebar).body;
    expect(out).toContain('Anna');
    expect(out).toContain('Administrator');
    expect(out).toContain('aria-label="Einstellungen öffnen"');
    ui.isAdmin = false;
    expect(render(Sidebar).body).toContain('Mitglied');
  });
});

describe('Kopfzeile des Desktops', () => {
  const html = () => render(DesktopHeader).body;

  it('Titel und Untertitel je Reiter', () => {
    expect(html()).toContain('Deine Aufgaben, Termine und To-dos an einem Ort.');
    ui.tab = 'watchers';
    expect(html()).toContain('Automatische Aufgaben aus Home Assistant.');
    ui.tab = 'boards';
    expect(html()).toContain('Haushalt'); // der Name des Boards ist der Titel
    expect(html()).toContain('data-testid="board-name"');
  });

  it('Suche (Strg K); Neue Aufgabe nur mit Board und für Erwachsene (Home Assistant und Glocke stehen in der Seitenleiste)', () => {
    const out = html();
    expect(out).toContain('type="search"');
    expect(out).toContain('Strg K');
    expect(out).not.toContain('data-testid="bell"');
    expect(out).not.toContain('data-testid="new-task"'); // noch kein Board geladen
    ui.view = { columns: [{ id: 'c1', name: 'Offen', isDone: false, isPlanned: false }], cards: [], categories: [] } as never;
    expect(html()).toContain('data-testid="new-task"');
    ui.isChild = true;
    expect(html()).not.toContain('data-testid="new-task"');
  });

  it('ohne Home Assistant (eigener Container) kein Home-Knopf', () => {
    ui.caps = { auth: 'session' } as never;
    expect(render(Sidebar).body).not.toContain('home-button');
  });

  it('das Feld zeigt die Suche des Reiters: Boards filter.search, sonst query', () => {
    ui.query = 'bad';
    ui.filter.search = 'fenster';
    expect(html()).toContain('value="bad"');
    ui.tab = 'boards';
    expect(html()).toContain('value="fenster"');
  });

  it('die Kopfzeile des Handys bleibt auf dem Desktop leer, darunter unverändert', () => {
    const top = () => render(TopBar, { props: { title: 'Aufgaben', sub: 'Heute' } }).body;
    expect(top()).not.toContain('<h1');
    ui.desktop = false;
    expect(top()).toContain('<h1');
    expect(top()).toContain('Heute');
  });
});

describe('Wo eine Aufgabe aufgeht', () => {
  it('Desktop, Aufgaben: in der Detailspalte, nicht im Sheet', () => {
    openCard('c1');
    expect(ui.detailId).toBe('c1');
    expect(ui.sheet).toBeNull();
    openSheet({ type: 'card', id: 'c2' }); // jeder Weg läuft über dieselbe Regel
    expect(ui.detailId).toBe('c2');
    closeDetail();
    expect(ui.detailId).toBeNull();
  });

  it('Boards, Kalender und Handy: als Sheet', () => {
    ui.tab = 'boards';
    openCard('c1');
    expect(ui.sheet).toEqual({ type: 'card', id: 'c1' });
    expect(ui.detailId).toBeNull();
    ui.sheet = null;
    ui.tab = 'tasks';
    ui.tasksCalendar = true;
    openCard('c1');
    expect(ui.sheet).toEqual({ type: 'card', id: 'c1' });
    ui.sheet = null;
    ui.tasksCalendar = false;
    ui.desktop = false;
    openCard('c1');
    expect(ui.sheet).toEqual({ type: 'card', id: 'c1' });
    expect(ui.detailId).toBeNull();
  });

  it('ein Reiterwechsel schließt die Detailspalte und leert die Suche', () => {
    ui.detailId = 'c1';
    ui.query = 'x';
    selectTab('boards');
    expect(ui.detailId).toBeNull();
    expect(ui.query).toBe('');
  });

  it('das Fenster wird schmaler oder breiter: die Aufgabe wechselt zwischen Detailspalte und Sheet', () => {
    ui.detailId = 'c1';
    setDesktop(false);
    expect(ui.detailId).toBeNull();
    expect(ui.sheet).toEqual({ type: 'card', id: 'c1' });
    setDesktop(true);
    expect(ui.sheet).toBeNull();
    expect(ui.detailId).toBe('c1');
  });
});

describe('Aufgabe im Kanban', () => {
  const card = { id: 'c', title: 'T', columnId: 'c', dueAt: '2026-11-06T10:00:00.000Z', priority: 'high', checklist: { done: 1, total: 2 }, commentCount: 0, linkCount: 0, attachmentCount: 0, assigneeIds: [], categoryIds: [], recurrence: null, watcherId: null, costCents: null, completedAt: null } as never;

  it('mit wrap brechen die Teile um (kein Abschneiden), ohne „•“ dazwischen', () => {
    const wrapped = render(CardMeta, { props: { card, wrap: true } }).body;
    expect(wrapped).toContain('flex-wrap');
    expect(wrapped).not.toContain('overflow-hidden');
    expect(wrapped).not.toContain('•');
    const normal = render(CardMeta, { props: { card } }).body;
    expect(normal).toContain('overflow-hidden whitespace-nowrap'); // Handy: unverändert
    expect(normal).toContain('•');
  });
});

describe('Eine Regel für alle Sheets (Sheet.svelte)', () => {
  const sheet = readFileSync(new URL('../src/components/Sheet.svelte', import.meta.url), 'utf8');

  it('Handy unten verankert, ab 640 px mittig und höchstens 640 px, ab 1024 px ein zentrierter Dialog', () => {
    expect(sheet).toContain('items-end justify-center lg:items-center');
    expect(sheet).toContain('rounded-t-sheet');
    expect(sheet).toContain('md:max-w-[640px]');
    expect(sheet).toContain('lg:w-[600px]');
    expect(sheet).toContain('lg:rounded-sheet');
    expect(sheet).toContain('lg:hidden'); // der Griff gehört nur dem Handy
  });

  it('keine Schublade mehr', () => {
    expect(sheet).not.toContain('lg:inset-y-0');
    expect(sheet).not.toContain('lg:right-0');
  });
});
