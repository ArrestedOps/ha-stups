import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { migrations } from '../src/migrations.js';
import { createStore, type Store } from '../src/store.js';
import { BUILTIN_TEMPLATES } from '../src/templates.js';

const TZ = 'Europe/Berlin';
let now: Date;
let store: Store;
let rene: string;

beforeEach(() => {
  now = new Date('2026-11-03T08:00:00Z'); // Di 09:00 Berlin
  store = createStore(openDb(':memory:'), { now: () => now, timeZone: () => TZ });
  rene = store.addPerson({ haUserId: 'ha-rene', name: 'Rene' }).id;
});

describe('Migration 17', () => {
  it('übernimmt eine Datenbank im Stand von 16 unverändert und legt die Tabelle leer an', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stups-mig17-'));
    const file = join(dir, 'k.sqlite');
    const old = openDb(file, { migrations: migrations.filter((m) => m.version <= 16) });
    old.exec(`insert into users (id, name, display_name, is_person, color, created_at, notify_services) values ('u1','anna','Anna',1,'#fff','2026-01-01T00:00:00Z','["svc"]')`);
    old.close();
    const db = openDb(file, { backupDir: join(dir, 'backups') });
    const s = createStore(db);
    expect(s.people().map((p) => p.name)).toEqual(['anna']);
    expect(s.listTemplates('de').filter((t) => !t.builtin)).toEqual([]);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBeGreaterThanOrEqual(17);
    expect(() => new DatabaseSync(file).prepare('select id from board_templates').all()).not.toThrow();
    db.close();
  });
});

describe('Board aus einer eingebauten Vorlage', () => {
  it('Haushalt: Spalten, Kategorien und Aufgaben in der Sprache der Person, Zuordnung stimmt', () => {
    const board = store.createBoardFromTemplate({ name: 'Zuhause', template: 'household', lang: 'de', by: rene });
    const view = store.getBoardView(board.id);
    expect(view.board.name).toBe('Zuhause');
    expect(view.columns.map((c) => [c.name, c.isDone, c.isPlanned])).toEqual([
      ['Offen', false, false],
      ['Geplant', false, true],
      ['In Arbeit', false, false],
      ['Erledigt', true, false],
    ]);
    expect(view.categories.map((c) => c.name)).toEqual(['Küche', 'Bad', 'Wäsche', 'Einkauf', 'Garten']);
    const cards = store.getBoardView(board.id).cards;
    const muell = cards.find((c) => c.title === 'Müll rausbringen')!;
    expect(muell.recurrence).toMatchObject({ type: 'fixed', freq: 'weekly' });
    expect(muell.categoryIds).toEqual([view.categories[0]!.id]);
    expect(muell.createdBy).toBe(rene);
    const einkauf = cards.find((c) => c.title === 'Einkaufen')!;
    expect(einkauf.checklist).toEqual({ done: 0, total: 3 });
    expect(cards.find((c) => c.title === 'Frühjahrsputz')!.dueAt).toBeNull();
  });

  it('dieselbe Vorlage auf Englisch', () => {
    const board = store.createBoardFromTemplate({ name: 'Home', template: 'household', lang: 'en', by: rene });
    const view = store.getBoardView(board.id);
    expect(view.columns.map((c) => c.name)).toEqual(['Open', 'Planned', 'In progress', 'Done']);
    expect(store.getBoardView(board.id).cards.some((c) => c.title === 'Take out the rubbish')).toBe(true);
  });

  it('Termine: Tage ab heute um die Standardzeit; nach heute landet die Aufgabe von selbst in „Geplant", heute in „Offen"', () => {
    const board = store.createBoardFromTemplate({ name: 'Umzug', template: 'move', lang: 'de', by: rene });
    const view = store.getBoardView(board.id);
    const planned = view.columns.find((c) => c.isPlanned)!.id;
    const open = view.columns[0]!.id;
    const cards = store.getBoardView(board.id).cards;
    const quote = cards.find((c) => c.title === 'Umzugsunternehmen anfragen')!;
    expect(quote.columnId).toBe(planned);
    expect(quote.dueAt).toBe('2026-11-10T08:00:00.000Z'); // in 7 Tagen, 09:00 Berlin
    const measure = cards.find((c) => c.title === 'Neue Wohnung ausmessen')!;
    expect(measure.columnId).toBe(open);
    expect(measure.dueAt).toBeNull();
  });

  it('die Standardzeit der Einstellungen gilt', () => {
    store.setSettings({ defaultDueTime: '18:30' });
    const board = store.createBoardFromTemplate({ name: 'U', template: 'move', lang: 'de', by: null });
    const quote = store.getBoardView(board.id).cards.find((c) => c.title === 'Umzugsunternehmen anfragen')!;
    expect(quote.dueAt).toBe('2026-11-10T17:30:00.000Z');
  });

  it('jede eingebaute Vorlage legt auf Deutsch und Englisch ohne Fehler an', () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      for (const lang of ['de', 'en'] as const) {
        const board = store.createBoardFromTemplate({ name: `${tpl.id} ${lang}`, template: tpl.id, lang, by: rene });
        expect(store.getBoardView(board.id).cards.length, `${tpl.id} ${lang}`).toBe(tpl.cards.length);
      }
    }
  });

  it('unbekannte Vorlage und leerer Name: Fehler, nichts angelegt', () => {
    const before = store.listBoards(null).length;
    expect(() => store.createBoardFromTemplate({ name: 'X', template: 'gibt-es-nicht', lang: 'de', by: rene })).toThrow(/Vorlage/);
    expect(() => store.createBoardFromTemplate({ name: '  ', template: 'household', lang: 'de', by: rene })).toThrow();
    expect(store.listBoards(null).length).toBe(before);
  });
});

describe('Eigene Vorlagen', () => {
  const build = () => {
    const board = store.createBoard({ name: 'Küche renovieren', withPlanned: true });
    const view = store.getBoardView(board.id);
    const [open, planned, , done] = view.columns;
    const cat = store.addCategory(board.id, { name: 'Material', color: 'brown' });
    const a = store.createCard(board.id, { columnId: open!.id, title: 'Fliesen aussuchen', description: 'Mit Muster', priority: 'high', dueAt: '2026-11-05T08:00:00.000Z', categoryIds: [cat.id], assigneeIds: [rene] }, rene);
    store.addChecklistItem(a.id, 'Showroom besuchen');
    store.createCard(board.id, { columnId: planned!.id, title: 'Handwerker anrufen', dueAt: '2026-11-12T08:00:00.000Z', recurrence: { type: 'after_completion', every: 1, unit: 'weeks' } }, rene);
    store.createCard(board.id, { columnId: open!.id, title: 'Idee ohne Termin' }, rene);
    const finished = store.createCard(board.id, { columnId: open!.id, title: 'Schon erledigt' }, rene);
    store.moveCard(finished.id, { columnId: done!.id });
    store.addComment(a.id, rene, 'Ein Kommentar');
    return { board, cat };
  };

  it('speichert Spalten, Kategorien und offene Aufgaben, aber nichts Persönliches', () => {
    const { board } = build();
    const saved = store.saveBoardAsTemplate(board.id, 'Meine Renovierung', rene);
    expect(saved).toMatchObject({ name: 'Meine Renovierung', builtin: false, columns: 4, categories: 1, cards: 3 });
    const data = store.getTemplateData(saved.id, 'de')!;
    expect(data.cards.map((c) => c.title).sort()).toEqual(['Fliesen aussuchen', 'Handwerker anrufen', 'Idee ohne Termin']); // „Schon erledigt" nicht
    const byTitle = (title: string) => data.cards.find((c) => c.title === title)!;
    const fliesen = byTitle('Fliesen aussuchen');
    expect(fliesen).toMatchObject({ description: 'Mit Muster', priority: 'high', checklist: ['Showroom besuchen'], categories: [0], dueInDays: 0 });
    expect(byTitle('Handwerker anrufen')).toMatchObject({ dueInDays: 7, recurrence: { type: 'after_completion' } }); // relativ zum frühesten Termin
    expect(byTitle('Idee ohne Termin').dueInDays).toBeNull();
    expect(JSON.stringify(data)).not.toMatch(/Ein Kommentar|ha-rene|assignee/i);
  });

  it('ein Board daraus hat keine Zuweisungen und keine Kommentare, die Termine sind relativ zu heute', () => {
    const { board } = build();
    const saved = store.saveBoardAsTemplate(board.id, 'Vorlage', rene);
    const fresh = store.createBoardFromTemplate({ name: 'Bad renovieren', template: saved.id, lang: 'de', by: rene });
    const cards = store.getBoardView(fresh.id).cards;
    expect(cards).toHaveLength(3);
    for (const c of cards) expect(c.assigneeIds).toEqual([]);
    const fliesen = cards.find((c) => c.title === 'Fliesen aussuchen')!;
    expect(fliesen.dueAt).toBe('2026-11-03T08:00:00.000Z'); // heute, 09:00 Berlin
    expect(cards.find((c) => c.title === 'Handwerker anrufen')!.dueAt).toBe('2026-11-10T08:00:00.000Z');
    expect(store.getBoardView(fresh.id).columns.map((c) => c.name)).toEqual(store.getBoardView(board.id).columns.map((c) => c.name));
  });

  it('listet eingebaute und eigene (mit Zahlen), prüft den Namen', () => {
    const { board } = build();
    store.saveBoardAsTemplate(board.id, 'Meine', rene);
    const list = store.listTemplates('de');
    expect(list.filter((t) => t.builtin).map((t) => t.id)).toEqual(BUILTIN_TEMPLATES.map((t) => t.id));
    const household = list.find((t) => t.id === 'household')!;
    expect(household).toMatchObject({ name: 'Haushalt', columns: 4, categories: 5 });
    expect(household.description).toMatch(/Müll/);
    expect(list.at(-1)).toMatchObject({ name: 'Meine', builtin: false });
    expect(() => store.saveBoardAsTemplate(board.id, '   ', rene)).toThrow();
    expect(() => store.saveBoardAsTemplate(board.id, 'x'.repeat(61), rene)).toThrow(/zu lang/);
    expect(() => store.saveBoardAsTemplate('gibt-es-nicht', 'N', rene)).toThrow(/nicht gefunden/);
  });

  it('eingebaute Namen in der Sprache der Anfrage', () => {
    expect(store.listTemplates('en').find((t) => t.id === 'household')!.name).toBe('Household');
  });

  it('löschen darf der Ersteller und ein Administrator, sonst nicht; eingebaute nie', () => {
    const { board } = build();
    const other = store.addPerson({ haUserId: 'ha-conny', name: 'Conny' }).id;
    const saved = store.saveBoardAsTemplate(board.id, 'Vorlage', rene);
    expect(() => store.deleteTemplate(saved.id, other, false)).toThrow(/darf/);
    store.deleteTemplate(saved.id, rene, false);
    expect(store.listTemplates('de').filter((t) => !t.builtin)).toEqual([]);
    const again = store.saveBoardAsTemplate(board.id, 'Nochmal', rene);
    store.deleteTemplate(again.id, other, true);
    expect(store.listTemplates('de').filter((t) => !t.builtin)).toEqual([]);
    expect(() => store.deleteTemplate('household', rene, true)).toThrow(/ngebaute/);
    expect(() => store.deleteTemplate('gibt-es-nicht', rene, true)).toThrow(/nicht gefunden/);
  });

  it('eigene Vorlagen ändern die Ansicht (Live-Sync lädt alles neu)', () => {
    const { board } = build();
    store.takeChanges();
    store.saveBoardAsTemplate(board.id, 'V', rene);
    expect(store.takeChanges().full).toBe(true);
  });
});
