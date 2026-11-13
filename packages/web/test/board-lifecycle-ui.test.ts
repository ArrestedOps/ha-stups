import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import BoardArchiveDialog from '../src/components/BoardArchiveDialog.svelte';
import BoardDeleteDialog from '../src/components/BoardDeleteDialog.svelte';
import BoardDuplicateDialog from '../src/components/BoardDuplicateDialog.svelte';
import BoardSwitcher from '../src/components/BoardSwitcher.svelte';
import BoardTemplateDialog from '../src/components/BoardTemplateDialog.svelte';
import type { Board, BoardDeletePreview, BoardSummary, HomeItem, User } from '../src/lib/api';
import { boardColorOfTile, boardMeta, cardsHead, copyName, lockText, moveItem, moveTargets } from '../src/lib/boardAdmin';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { ui } from '../src/lib/store.svelte';
import { pausedText } from '../src/lib/watchers';
import { problemText } from '../src/lib/watcherList';

const person = (id: string, name: string): User => ({ id, displayName: name, name, isPerson: true, color: null, isChild: false }) as User;
const rene = person('rene', 'Rene');
const anna = person('anna', 'Anna');
const board = (id: string, name: string, over: Partial<BoardSummary> = {}): BoardSummary => ({
  id,
  name,
  icon: null,
  color: null,
  position: id,
  archiveAfterDays: 7,
  visibility: 'all',
  ownerId: null,
  countsForFairness: true,
  memberIds: [],
  archivedAt: null,
  openCards: 3,
  ...over,
});
const preview = (over: Partial<BoardDeletePreview> = {}): BoardDeletePreview => ({
  cards: { total: 12, open: 3 },
  recurring: [{ id: 'c1', title: 'Bett beziehen', recurrence: { type: 'fixed', freq: 'weekly', every: 2, weekdays: [6] } as never }],
  watchers: [
    { id: 'w1', name: 'Waschmaschine fertig', active: true },
    { id: 'w2', name: 'Batterie wechseln', active: true },
  ],
  reminders: 2,
  lock: null,
  mayManage: true,
  ownerName: null,
  ...over,
});

beforeEach(() => {
  setLanguage('de');
  ui.people = [rene, anna];
  ui.me = rene;
  ui.isChild = false;
  ui.desktop = false;
  ui.boards = [board('b1', 'Haushalt'), board('b2', 'Bad-Umbau', { visibility: 'selected', ownerId: 'rene', memberIds: ['anna'] }), board('b3', 'Meine Ideen', { visibility: 'private', ownerId: 'rene', openCards: 2 })];
  ui.boardId = 'b1';
  ui.archivedBoards = [];
  ui.sheet = { type: 'boards' };
});

describe('Hilfen zu Boards', () => {
  it('moveItem schiebt um eine Stelle und lässt die Ränder in Ruhe', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    const list = ['a', 'b'];
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, 5, 1)).toBe(list);
  });

  it('boardMeta: offene Aufgaben, dahinter klein wer es sieht (Alle: nichts)', () => {
    expect(boardMeta(ui.boards[0]!, ui.people)).toEqual({ open: '3 offen', who: null });
    expect(boardMeta(ui.boards[1]!, ui.people).who).toBe('👥 Rene, Anna');
    expect(boardMeta(ui.boards[2]!, ui.people).who).toBe('🔒 nur ich');
  });

  it('Ziel-Boards zum Umziehen: nicht das Board selbst, keine privaten', () => {
    expect(moveTargets(ui.boards, 'b1').map((b) => b.id)).toEqual(['b2']);
    expect(moveTargets(ui.boards, 'b2').map((b) => b.id)).toEqual(['b1']);
  });

  it('Sperrtexte: letztes Board, fremdes Board mit Besitzer, ohne Besitzer, Archivieren', () => {
    expect(lockText(preview())).toBeNull();
    expect(lockText(preview({ lock: 'last' }))).toBe('Das letzte Board kann nicht gelöscht werden.');
    expect(lockText(preview({ lock: 'last' }), 'archive')).toBe('Das letzte Board kann nicht archiviert werden.');
    expect(lockText(preview({ mayManage: false, ownerName: 'Rene' }))).toBe('Nur Rene oder ein Administrator darf löschen.');
    expect(lockText(preview({ mayManage: false, ownerName: null }))).toBe('Nur ein Administrator darf löschen.');
    expect(lockText(preview({ mayManage: false, ownerName: 'Rene' }), 'archive')).toBe('Nur Rene oder ein Administrator darf archivieren.');
  });

  it('Kopiename, Kopf der Aufgaben, Farbe aus der Kachelfarbe', () => {
    expect(copyName('Haushalt')).toBe('Haushalt (Kopie)');
    expect(cardsHead({ total: 12, open: 3 })).toBe('12 · 3 offen');
    expect(boardColorOfTile('violet')).toBe('indigo');
    expect(boardColorOfTile('orange')).toBe('orange');
    expect(boardColorOfTile('unbekannt')).toBe('gray');
  });
});

describe('Board-Auswahl', () => {
  const html = () => render(BoardSwitcher, { props: {} }).body;

  it('die Liste der Boards mit offenen Aufgaben und Sichtbarkeit, darunter Neues Board erstellen und Board-Einstellungen', () => {
    const out = html();
    for (const name of ['Haushalt', 'Bad-Umbau', 'Meine Ideen']) expect(out).toContain(name);
    expect(out).toContain('3 offen');
    expect(out).toContain('👥 Rene, Anna');
    expect(out).toContain('🔒 nur ich');
    expect(out).toContain('Neues Board erstellen');
    expect(out).toContain('Board-Einstellungen');
    expect(out).toContain('aria-label="Reihenfolge ändern"');
  });

  it('kein Eintrag „Einstellungen", kein „Bearbeiten", kein Anlege-Formular mehr', () => {
    const out = html();
    expect(out).not.toMatch(/>Einstellungen</);
    expect(out).not.toContain('Bearbeiten');
    expect(out).not.toContain('Name des neuen Boards');
  });

  it('„Archivierte Boards" erscheint nur, wenn es welche gibt', () => {
    expect(html()).not.toContain('Archivierte Boards');
    ui.archivedBoards = [board('b9', 'Alt', { archivedAt: '2026-11-01T00:00:00Z' })];
    const out = html();
    expect(out).toContain('Archivierte Boards');
    expect(out).toContain('1 Board');
    expect(out).toContain('wiederherstellen');
  });

  it('ein Kind sieht Auswahl und Neues Board, aber weder Einstellungen noch Reihenfolge noch Archiv', () => {
    ui.isChild = true;
    ui.archivedBoards = [];
    const out = html();
    expect(out).toContain('Neues Board erstellen');
    expect(out).not.toContain('Board-Einstellungen');
    expect(out).not.toContain('Reihenfolge');
  });

  it('bei nur einem Board gibt es nichts zu ordnen', () => {
    ui.boards = [board('b1', 'Haushalt')];
    expect(html()).not.toContain('Reihenfolge');
  });
});

describe('Dialog Board löschen', () => {
  const html = (p: BoardDeletePreview = preview(), b: Board = ui.boards[0]!) => render(BoardDeleteDialog, { props: { board: b, preview: p, ondone: () => undefined, onclose: () => undefined } }).body;

  it('nennt Aufgaben mit Zahl und offenen, wiederkehrende mit Regel, Wächter mit Namen und die Erinnerungen', () => {
    const out = html();
    expect(out).toContain('„Haushalt“ löschen?');
    expect(out).toContain('12 · 3 offen');
    expect(out).toContain('Landen 30 Tage im Papierkorb');
    expect(out).toContain('Bett beziehen');
    expect(out).toMatch(/alle 2 Wochen/);
    expect(out).toContain('Waschmaschine fertig');
    expect(out).toContain('Batterie wechseln');
    expect(out).toContain('2 persönliche Erinnerungen');
  });

  it('je Wächter eine Wahl: Pausieren (Standard), Umziehen, Löschen', () => {
    const out = html();
    expect((out.match(/role="radiogroup"/g) ?? []).length).toBe(2);
    expect((out.match(/aria-checked="true"[^>]*>(?:<!--[^>]*-->)*Pausieren</g) ?? []).length).toBe(2);
    expect(out).toContain('Umziehen');
    expect(out).toContain('>Löschen<');
  });

  it('ohne mögliches Ziel (nur private Boards übrig) gibt es kein Umziehen', () => {
    ui.boards = [board('b1', 'Haushalt'), board('b3', 'Meine Ideen', { visibility: 'private', ownerId: 'rene' })];
    const out = html();
    expect(out).not.toContain('Umziehen');
  });

  it('Abschnitte ohne Inhalt fehlen', () => {
    const out = html(preview({ recurring: [], watchers: [], reminders: 0 }));
    expect(out).not.toContain('Wiederkehrende Aufgaben');
    expect(out).not.toContain('delete-watchers');
    expect(out).not.toContain('persönliche Erinnerung');
  });

  it('gesperrt: Text und gesperrter Knopf', () => {
    const out = html(preview({ lock: 'last' }));
    expect(out).toContain('Das letzte Board kann nicht gelöscht werden.');
    expect(out).toMatch(/<button[^>]*disabled[^>]*data-testid="delete-confirm"|<button[^>]*data-testid="delete-confirm"[^>]*disabled/);
  });
});

describe('Dialog Board archivieren', () => {
  it('sagt, was passiert, und weist die Wächter als pausiert aus (nichts zu wählen)', () => {
    const out = render(BoardArchiveDialog, { props: { board: ui.boards[1]!, preview: preview(), ondone: () => undefined, onclose: () => undefined } }).body;
    expect(out).toContain('„Bad-Umbau“ archivieren?');
    expect(out).toContain('Das Board verschwindet aus der Auswahl');
    expect(out).toContain('Waschmaschine fertig');
    expect(out).toContain('wird pausiert: Board archiviert');
    expect(out).not.toContain('Weiterlaufen');
    expect(out).not.toContain('role="radiogroup"');
  });
});

describe('Duplizieren und Vorlage', () => {
  it('Duplizieren: Name „X (Kopie)", Schalter Spalten (an), Aufgaben (aus), Sichtbarkeit (an), Wächter nie (gesperrt aus)', () => {
    const out = render(BoardDuplicateDialog, { props: { board: ui.boards[0]!, onclose: () => undefined } }).body;
    expect(out).toContain('value="Haushalt (Kopie)"');
    const switches = [...out.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map((m) => m[0]);
    expect(switches).toHaveLength(4);
    const state = (label: string) => switches.find((s) => s.includes(`aria-label="${label}"`))!;
    expect(state('Spalten und Kategorien')).toContain('aria-checked="true"');
    expect(state('Offene Aufgaben')).toContain('aria-checked="false"');
    expect(state('Wer sieht es')).toContain('aria-checked="true"');
    expect(state('Wächter')).toContain('aria-checked="false"');
    expect(state('Wächter')).toContain('disabled');
    expect(out).toContain('werden nie mitkopiert');
  });

  it('Vorlage: Name des Boards als Vorschlag, Hinweis „keine Aufgaben"', () => {
    const out = render(BoardTemplateDialog, { props: { board: ui.boards[0]!, onclose: () => undefined } }).body;
    expect(out).toContain('value="Haushalt"');
    expect(out).toContain('Vorlagenname');
    expect(out).toContain('keine Aufgaben');
  });
});

describe('Wächter: Pausiert-Text nach Grund', () => {
  it('Board archiviert, Board fehlt, sonst der allgemeine Satz', () => {
    expect(pausedText({ pausedBy: 'archived' })).toBe('Pausiert: Board archiviert');
    expect(pausedText({ pausedBy: 'deleted' })).toBe('Pausiert: Board fehlt');
    expect(pausedText({ pausedBy: null })).toBe('Pausiert: Board oder Spalte gibt es nicht mehr');
    expect(pausedText({})).toBe('Pausiert: Board oder Spalte gibt es nicht mehr');
    const item = (pausedBy: HomeItem['pausedBy']) => ({ status: 'target_missing', entityMissing: false, pausedBy }) as Pick<HomeItem, 'status' | 'entityMissing' | 'pausedBy'>;
    expect(problemText(item('archived'))).toBe('Pausiert: Board archiviert');
    expect(problemText(item('deleted'))).toBe('Pausiert: Board fehlt');
  });
});
