import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/** Unterordner in /share, über den Daten von einer App zur anderen wandern (andere Adresse in Home Assistant = andere App) */
export const TRANSFER_DIR = 'stups-umzug';
const DB_NAME = 'data.sqlite';

export interface ExportResult {
  dir: string;
  bytes: number;
  files: boolean;
}

/** Schreibt eine saubere Kopie der Datenbank und aller Anhänge nach <share>/stups-umzug. Ein früherer Export wird ersetzt. */
export function exportData(db: DatabaseSync, dataDir: string, shareDir: string, now: Date = new Date()): ExportResult {
  if (!existsSync(shareDir)) throw new Error(`Der Ordner ${shareDir} ist nicht eingebunden`);
  const dir = join(shareDir, TRANSFER_DIR);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const target = join(dir, DB_NAME);
  db.exec(`vacuum into '${target.replace(/'/g, "''")}'`);
  const files = existsSync(join(dataDir, 'files'));
  if (files) cpSync(join(dataDir, 'files'), join(dir, 'files'), { recursive: true });
  writeFileSync(join(dir, 'info.json'), JSON.stringify({ exportedAt: now.toISOString() }, null, 2));
  return { dir, bytes: statSync(target).size, files };
}

/**
 * Beim ersten Start einer neuen App ohne eigene Daten: Datenbank und Anhänge aus <share>/stups-umzug übernehmen.
 * Muss vor dem Öffnen der Datenbank laufen; hat die App schon Daten, passiert nichts.
 */
export function importTransfer(dbPath: string, filesDir: string, shareDir: string): boolean {
  if (existsSync(dbPath) && statSync(dbPath).size > 0) return false;
  const source = join(shareDir, TRANSFER_DIR);
  const sourceDb = join(source, DB_NAME);
  if (!existsSync(sourceDb)) return false;
  mkdirSync(dirname(dbPath), { recursive: true });
  copyFileSync(sourceDb, dbPath);
  if (existsSync(join(source, 'files'))) cpSync(join(source, 'files'), filesDir, { recursive: true });
  return true;
}
