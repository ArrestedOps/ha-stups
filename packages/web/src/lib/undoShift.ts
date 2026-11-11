/**
 * „Rückgängig" nach „Überfällige verschieben" (Blatt „Überfällig"): Ein alter Termin wird nur zurückgeschrieben, wenn die Karte noch so
 * dasteht, wie die Aktion sie hinterlassen hat. Hat inzwischen jemand anderes einen Termin gesetzt, bleibt die neuere Entscheidung.
 * Gelesen wird frisch, geschrieben mit der gelesenen Version als Vorbedingung (der Server antwortet 409, wenn jemand dazwischen war).
 * Jede Karte für sich: Ein Fehler bei einer bricht die übrigen nicht ab.
 */

import { shiftDue, type ShiftTarget } from './statsSheets';

export interface ShiftRecord {
  id: string;
  title: string;
  /** der Termin vor dem Verschieben */
  from: string;
  /** der Termin, den das Verschieben gesetzt hat */
  to: string;
}

export interface UndoIo {
  card(id: string): Promise<{ dueAt: string | null; version: number }>;
  update(id: string, patch: { dueAt: string; expectedVersion: number }): Promise<unknown>;
}

export interface UndoResult {
  restored: ShiftRecord[];
  /** inzwischen von jemandem geändert: bleibt, wie es ist */
  conflicts: ShiftRecord[];
  /** ließ sich nicht zurücksetzen (Fehler, gelöschte Karte) */
  failed: number;
}

const isConflict = (e: unknown): boolean => (e as { status?: number } | null)?.status === 409;

export async function undoShifts(moved: ShiftRecord[], io: UndoIo): Promise<UndoResult> {
  const out: UndoResult = { restored: [], conflicts: [], failed: 0 };
  for (const m of moved) {
    try {
      const now = await io.card(m.id);
      if (!now.dueAt || Date.parse(now.dueAt) !== Date.parse(m.to)) {
        out.conflicts.push(m);
        continue;
      }
      await io.update(m.id, { dueAt: m.from, expectedVersion: now.version });
      out.restored.push(m);
    } catch (e) {
      if (isConflict(e)) out.conflicts.push(m);
      else out.failed += 1;
    }
  }
  return out;
}

export interface ShiftInput {
  id: string;
  title: string;
  dueAt: string;
  /** die Version, die die Liste gesehen hat: Hat jemand die Karte inzwischen geändert, antwortet der Server mit 409 und die Karte bleibt */
  version?: number;
}

export interface ShiftBatch {
  moved: ShiftRecord[];
  /** ließ sich nicht verschieben (Fehler oder inzwischen von jemandem geändert) */
  failed: number;
  /** der erste Fehler, für die Meldung, wenn gar nichts verschoben wurde */
  first: unknown;
}

/** Überfällige Karten auf einen neuen Termin schieben, jede für sich mit der gesehenen Version als Vorbedingung; ein Fehler bricht die übrigen nicht ab */
export async function shiftBatch(
  items: ShiftInput[],
  target: ShiftTarget,
  nowMs: number,
  update: (id: string, patch: { dueAt: string; expectedVersion?: number }) => Promise<unknown>,
): Promise<ShiftBatch> {
  const out: ShiftBatch = { moved: [], failed: 0, first: null };
  for (const c of items) {
    try {
      const to = shiftDue(c.dueAt, target, nowMs);
      await update(c.id, c.version === undefined ? { dueAt: to } : { dueAt: to, expectedVersion: c.version });
      out.moved.push({ id: c.id, title: c.title, from: c.dueAt, to });
    } catch (e) {
      out.failed += 1;
      out.first ??= e;
    }
  }
  return out;
}
