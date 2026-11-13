import type { Card, Store } from './store.js';
import { parseIcon, parseIconColor } from './store/validate.js';
import type { WatcherHa } from './watchers.js';

/** Name des Home-Assistant-Ereignisses, mit dem eigene Automationen eine Aufgabe anlegen */
export const EVENT_TYPE = 'stups_create_card';

export interface AutomationDeps {
  store: Store;
  ha: Pick<WatcherHa, 'subscribe'>;
  now: () => Date;
  /** Personen, die gerade zu Hause sind (für „assignees: present") */
  presentPersonIds: () => Promise<string[]>;
  onAssigned?: (card: Card, userIds: string[]) => void;
  onChange?: () => void;
  /** Ereignis, auf das gehört wird (Vorgabe stups_create_card; die Beta hat ein eigenes, siehe channel.ts) */
  eventType?: string;
}

export interface AutomationEntry {
  at: string;
  result: 'created' | 'duplicate' | 'error';
  title: string | null;
  note: string;
}

const KEEP = 20;
const asText = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * Eigene Automationen in Home Assistant legen Aufgaben an, indem sie das Ereignis `stups_create_card` auslösen
 * (Aktion `event.fire` bzw. `event:` in der Automation). Felder: board, column, title, description, assignees
 * (Namen oder „present"), due_in_minutes, dedupe_key. Fehler gehen nicht verloren, sondern stehen im Protokoll.
 */
export function createAutomationCards(deps: AutomationDeps) {
  const { store, now } = deps;
  const log: AutomationEntry[] = [];

  function record(result: AutomationEntry['result'], title: string | null, note: string): void {
    log.unshift({ at: now().toISOString(), result, title, note });
    log.length = Math.min(log.length, KEEP);
  }

  /** `icon` (mdi:name oder name) und `icon_color`: ungültige Angaben werden ignoriert, die Aufgabe entsteht trotzdem */
  function iconOf(data: Record<string, unknown>): { icon?: string; iconColor?: string } {
    const out: { icon?: string; iconColor?: string } = {};
    const raw = asText(data.icon);
    if (raw) {
      try {
        out.icon = parseIcon(raw.replace(/^mdi:/, '')) ?? undefined;
      } catch {
        /* unbekanntes Format: Standardsymbol */
      }
    }
    const color = asText(data.icon_color);
    if (color) {
      try {
        out.iconColor = parseIconColor(color) ?? undefined;
      } catch {
        /* unbekannte Farbe: Auto */
      }
    }
    return out;
  }

  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  async function resolveAssignees(raw: unknown): Promise<{ ids: string[]; unknown: string[] }> {
    const list = (Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw]).filter((x): x is string => typeof x === 'string');
    const people = store.people();
    const ids = new Set<string>();
    const unknown: string[] = [];
    for (const entry of list) {
      if (same(entry, 'present')) {
        for (const id of await deps.presentPersonIds()) ids.add(id);
        continue;
      }
      const p = people.find((x) => same(x.name, entry) || same(x.displayName, entry));
      if (p) ids.add(p.id);
      else unknown.push(entry);
    }
    return { ids: [...ids], unknown };
  }

  /** Ein Ereignis von Home Assistant (die Felder stehen unter `data`) */
  async function handle(data: Record<string, unknown>): Promise<void> {
    const title = asText(data.title);
    try {
      if (!title) throw new Error('title fehlt');
      // Automationen aus Home Assistant kennen nur Boards, die alle sehen (private oder ausgewählte Boards erreichen sie nie)
      const boards = store.listBoards(null);
      const boardKey = asText(data.board);
      const board = boardKey ? boards.find((b) => b.id === boardKey || same(b.name, boardKey)) : boards[0];
      if (!board) throw new Error(`Board „${boardKey ?? ''}" gibt es nicht`);
      const columns = store.getBoardView(board.id).columns;
      const columnKey = asText(data.column);
      const column = columnKey
        ? columns.find((c) => c.id === columnKey || same(c.name, columnKey))
        : columns.find((c) => !c.isDone && !c.isPlanned);
      if (!column) throw new Error(`Spalte „${columnKey ?? ''}" gibt es nicht`);

      const key = asText(data.dedupe_key);
      if (key && store.openCardByDedupeKey(key)) {
        record('duplicate', title, `Für „${key}" gibt es schon eine offene Aufgabe`);
        return;
      }

      const { ids, unknown } = await resolveAssignees(data.assignees);
      const minutes = typeof data.due_in_minutes === 'number' && Number.isFinite(data.due_in_minutes) ? Math.max(0, Math.round(data.due_in_minutes)) : null;
      // Prüfen und Anlegen ohne Unterbrechung: zwischen der ersten Prüfung oben und hier lag ein await (Zuweisung „present"),
      // in dem ein zweites Ereignis mit demselben Schlüssel dieselbe Prüfung bestanden hätte
      const card = store.transaction(() => {
        if (key && store.openCardByDedupeKey(key)) return null;
        const created = store.createCard(
          board.id,
          {
            columnId: column.id,
            title,
            description: asText(data.description),
            dueAt: minutes === null ? null : new Date(now().getTime() + minutes * 60_000).toISOString(),
            assigneeIds: ids,
            ...iconOf(data),
          },
          null,
        );
        if (key) store.setCardOrigin(created.id, { dedupeKey: key });
        return created;
      });
      if (!card) {
        record('duplicate', title, `Für „${key}" gibt es schon eine offene Aufgabe`);
        return;
      }
      record('created', title, unknown.length ? `Unbekannte Personen übersprungen: ${unknown.join(', ')}` : `in „${board.name}"`);
      deps.onChange?.();
      if (ids.length > 0) deps.onAssigned?.(card, ids);
    } catch (err) {
      record('error', title, err instanceof Error ? err.message : String(err));
    }
  }

  function start(): void {
    const eventType = deps.eventType ?? EVENT_TYPE;
    deps.ha.subscribe(
      eventType,
      { type: 'subscribe_events', event_type: eventType },
      (ev) => void handle((ev.data ?? {}) as Record<string, unknown>),
    );
  }

  return { start, handle, log: (): AutomationEntry[] => [...log] };
}

export type AutomationCards = ReturnType<typeof createAutomationCards>;
