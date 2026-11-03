import { randomUUID } from 'node:crypto';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { t } from '../i18n/index.js';
import { fromLocal, toLocal } from '../recurrence.js';
import { dayDiff } from '../time.js';
import { BUILTIN_TEMPLATES, resolveTemplate, type Lang, type TemplateData } from '../templates.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import type { Board, Row } from './types.js';
import { cleanText } from './validate.js';

/** Eine Vorlage in der Liste: eingebaute und eigene, mit Zahlen für die Vorschau */
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  columns: number;
  categories: number;
  cards: number;
  createdBy: string | null;
}

/** Board-Vorlagen: eingebaute (Code) und eigene (Tabelle board_templates) */
export function createTemplates(c: Ctx, late: unknown) {
  const s = late as Internals;
  const { now, timeZone, iso, one, all, run, tx } = c;
  const { createBoard, addCategory, createCard, addChecklistItem, getBoardView, getSettings, isFutureDue } = lazy(s, [
    'createBoard',
    'addCategory',
    'createCard',
    'addChecklistItem',
    'getBoardView',
    'getSettings',
    'isFutureDue',
  ] as const);

  const info = (data: TemplateData, base: { id: string; name: string; description: string; builtin: boolean; createdBy: string | null }): TemplateInfo => ({
    ...base,
    columns: data.columns.length,
    categories: data.categories.length,
    cards: data.cards.length,
  });

  function listTemplates(lang: Lang): TemplateInfo[] {
    const builtin = BUILTIN_TEMPLATES.map((b) => info(resolveTemplate(b, lang), { id: b.id, name: b.name[lang], description: b.description[lang], builtin: true, createdBy: null }));
    const custom = all('select * from board_templates order by created_at, rowid').map((r) =>
      info(JSON.parse(r.data) as TemplateData, { id: r.id, name: r.name, description: '', builtin: false, createdBy: r.created_by ?? null }),
    );
    return [...builtin, ...custom];
  }

  /** Die Vorlage als einfache Texte (eingebaute in der Sprache, eigene so, wie sie gespeichert wurden); null: gibt es nicht */
  function getTemplateData(id: string, lang: Lang): TemplateData | null {
    const builtin = BUILTIN_TEMPLATES.find((b) => b.id === id);
    if (builtin) return resolveTemplate(builtin, lang);
    const row = one('select data from board_templates where id = ?', id);
    return row ? (JSON.parse(row.data) as TemplateData) : null;
  }

  /** Termin in `days` ganzen Tagen ab heute um die Standardzeit (Ortszeit) */
  function dueIn(days: number): string {
    const tz = timeZone();
    const today = toLocal(now().getTime(), tz);
    const [h, mi] = getSettings().defaultDueTime.split(':').map(Number) as [number, number];
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + days));
    return new Date(fromLocal({ y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate(), h, mi, s: 0 }, tz)).toISOString();
  }

  function createBoardFromTemplate(input: { name: string; template: string; lang: Lang; by: string | null }): Board {
    const data = getTemplateData(input.template, input.lang);
    if (!data) throw new NotFoundError(t('Vorlage nicht gefunden'));
    return tx(() => {
      const board = createBoard({ name: input.name, columns: data.columns });
      const columns = getBoardView(board.id).columns;
      const categoryIds = data.categories.map((cat) => addCategory(board.id, { name: cat.name, color: cat.color }).id);
      const firstOpen = columns.findIndex((col) => !col.isDone && !col.isPlanned);
      const planned = columns.findIndex((col) => col.isPlanned);
      for (const card of data.cards) {
        const dueAt = card.dueInDays === null ? null : dueIn(card.dueInDays);
        let target = columns[card.column] ?? columns[0]!;
        // „Geplant" nimmt nur Karten mit einem Termin nach heute; ein solcher Termin schickt die Karte dorthin, sonst bleibt sie offen
        if (dueAt && isFutureDue(dueAt) && planned >= 0) target = columns[planned]!;
        else if (target.isPlanned) target = columns[Math.max(firstOpen, 0)]!;
        const made = createCard(
          board.id,
          {
            columnId: target.id,
            title: card.title,
            description: card.description,
            priority: card.priority,
            dueAt,
            recurrence: card.recurrence,
            categoryIds: card.categories.map((i) => categoryIds[i]!),
            effort: card.effort,
          },
          input.by,
        );
        for (const text of card.checklist) addChecklistItem(made.id, text);
      }
      return board;
    });
  }

  /** Speichert Spalten, Kategorien und offene Karten eines Boards als eigene Vorlage (ohne Zuweisungen, Anhänge, Kommentare, Erledigtes) */
  function saveBoardAsTemplate(boardId: string, name: unknown, by: string | null): TemplateInfo {
    const view = getBoardView(boardId);
    const clean = cleanText(name, t('Der Name'), 60);
    const columnIndex = new Map(view.columns.map((col, i) => [col.id, i]));
    const categoryIndex = new Map(view.categories.map((cat, i) => [cat.id, i]));
    const doneColumns = new Set(view.columns.filter((col) => col.isDone).map((col) => col.id));
    const open = view.cards.filter((card) => !card.completedAt && !doneColumns.has(card.columnId));

    // Termine relativ zum frühesten, damit die Vorlage an jedem Tag gilt
    const tz = timeZone();
    const dues = open.flatMap((card) => (card.dueAt ? [Date.parse(card.dueAt)] : []));
    const earliest = dues.length > 0 ? Math.min(...dues) : null;

    const data: TemplateData = {
      columns: view.columns.map((col) => ({ name: col.name, done: col.isDone, planned: col.isPlanned })),
      categories: view.categories.map((cat) => ({ name: cat.name, color: cat.color })),
      cards: open.map((card) => ({
        title: card.title,
        description: card.description,
        column: columnIndex.get(card.columnId) ?? 0,
        categories: card.categoryIds.flatMap((id) => (categoryIndex.has(id) ? [categoryIndex.get(id)!] : [])),
        checklist: all('select text from checklist_items where card_id = ? order by position, id', card.id).map((r: Row) => r.text as string),
        priority: card.priority,
        effort: card.effort,
        recurrence: (card.recurrence as Record<string, unknown> | null) ?? null,
        dueInDays: card.dueAt && earliest !== null ? Math.max(0, dayDiff(Date.parse(card.dueAt), earliest, tz)) : null,
      })),
    };
    const id = randomUUID();
    run('insert into board_templates (id, name, data, created_by, created_at) values (?, ?, ?, ?, ?)', id, clean, JSON.stringify(data), by, iso());
    return info(data, { id, name: clean, description: '', builtin: false, createdBy: by });
  }

  /** Löschen darf der Ersteller und ein Administrator; eingebaute nie */
  function deleteTemplate(id: string, byUser: string | null, isAdmin: boolean): void {
    if (BUILTIN_TEMPLATES.some((b) => b.id === id)) throw new ValidationError(t('Eingebaute Vorlagen lassen sich nicht löschen'));
    const row = one('select created_by from board_templates where id = ?', id);
    if (!row) throw new NotFoundError(t('Vorlage nicht gefunden'));
    if (!isAdmin && (byUser === null || row.created_by !== byUser)) throw new ForbiddenError(t('Das darf nur, wer die Vorlage gespeichert hat, oder ein Administrator'));
    run('delete from board_templates where id = ?', id);
  }

  return { listTemplates, getTemplateData, createBoardFromTemplate, saveBoardAsTemplate, deleteTemplate };
}
