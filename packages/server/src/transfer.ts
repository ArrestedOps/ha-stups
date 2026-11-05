import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Unterordner in /share, über den Daten von einer App zur anderen wandern (andere Adresse in Home Assistant = andere App) */
export const TRANSFER_DIR = 'stups-umzug';
const DB_NAME = 'data.sqlite';

/** So lange liegt ein Export bereit; danach löscht ihn die App beim Start */
export const EXPORT_TTL_MS = 24 * 3_600_000;

export interface ExportResult {
  dir: string;
  bytes: number;
  files: boolean;
  /** Danach wird der Export beim Start einer App gelöscht */
  expiresAt: string;
}

/** Alle Dateien unterhalb von dir nur für den Besitzer lesbar machen (/share sehen auch andere Apps) */
function restrict(dir: string): void {
  chmodSync(dir, 0o700);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) restrict(path);
    else chmodSync(path, 0o600);
  }
}

/** Entfernt aus der Kopie, was nicht mitwandern soll: Push-Geheimnis, Passwort-Hashes, Sitzungen, Passkeys */
function scrubSecrets(file: string): void {
  const copy = new DatabaseSync(file);
  try {
    copy.exec('pragma journal_mode = delete');
    for (const sql of [
      `delete from settings where key = 'pushSecret'`,
      'delete from sessions',
      'delete from passkeys',
      // Das Konto bleibt, der Hash ist ungültig: ein Administrator vergibt in der neuen App ein neues Passwort
      `update local_accounts set password_hash = '!'`,
    ]) {
      try {
        copy.exec(sql);
      } catch (err) {
        if (!/no such table/i.test(String(err))) throw err; // Tabelle gibt es im älteren Stand nicht: nichts zu entfernen
      }
    }
    copy.exec('vacuum'); // freie Seiten enthalten sonst noch die gelöschten Werte
  } finally {
    copy.close();
  }
}

/**
 * Schreibt eine Kopie der Datenbank (ohne Geheimnisse, nur für den Besitzer lesbar) und aller Anhänge nach
 * <share>/stups-umzug. Ein früherer Export wird ersetzt. Der Export läuft nach 24 Stunden ab.
 */
export function exportData(db: DatabaseSync, dataDir: string, shareDir: string, now: Date = new Date()): ExportResult {
  if (!existsSync(shareDir)) throw new Error(`Der Ordner ${shareDir} ist nicht eingebunden`);
  const dir = join(shareDir, TRANSFER_DIR);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const target = join(dir, DB_NAME);
  db.exec(`vacuum into '${target.replace(/'/g, "''")}'`);
  const files = existsSync(join(dataDir, 'files'));
  if (files) cpSync(join(dataDir, 'files'), join(dir, 'files'), { recursive: true });
  if (existsSync(join(dataDir, 'avatars'))) cpSync(join(dataDir, 'avatars'), join(dir, 'avatars'), { recursive: true });
  scrubSecrets(target);
  const expiresAt = new Date(now.getTime() + EXPORT_TTL_MS).toISOString();
  writeFileSync(join(dir, 'info.json'), JSON.stringify({ exportedAt: now.toISOString(), expiresAt }, null, 2));
  restrict(dir);
  return { dir, bytes: statSync(target).size, files, expiresAt };
}

/**
 * Löscht beim Start einen abgelaufenen Export. Ältere Exporte ohne Ablaufdatum bleiben liegen und lassen sich weiter
 * übernehmen. true = gelöscht.
 */
export function purgeExpiredExport(shareDir: string, now: Date = new Date()): boolean {
  const dir = join(shareDir, TRANSFER_DIR);
  try {
    const info = JSON.parse(readFileSync(join(dir, 'info.json'), 'utf8')) as { expiresAt?: unknown };
    if (typeof info.expiresAt !== 'string' || !(Date.parse(info.expiresAt) < now.getTime())) return false;
    rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Beim ersten Start einer neuen App ohne eigene Daten: Datenbank und Anhänge aus <share>/stups-umzug übernehmen.
 * Muss vor dem Öffnen der Datenbank laufen; hat die App schon Daten, passiert nichts.
 */
export function importTransfer(dbPath: string, filesDir: string, shareDir: string, avatarsDir?: string): boolean {
  if (existsSync(dbPath) && statSync(dbPath).size > 0) return false;
  const source = join(shareDir, TRANSFER_DIR);
  const sourceDb = join(source, DB_NAME);
  if (!existsSync(sourceDb)) return false;
  mkdirSync(dirname(dbPath), { recursive: true });
  copyFileSync(sourceDb, dbPath);
  if (existsSync(join(source, 'files'))) cpSync(join(source, 'files'), filesDir, { recursive: true });
  if (avatarsDir && existsSync(join(source, 'avatars'))) cpSync(join(source, 'avatars'), avatarsDir, { recursive: true });
  // Der Export hat seinen Zweck erfüllt: weg damit, er liegt sonst weiter offen in /share
  try {
    rmSync(source, { recursive: true, force: true });
  } catch {
    /* bleibt liegen und läuft ab bzw. wird vom Besitzer gelöscht */
  }
  return true;
}

export interface TransferStatus {
  /** has-data: die App hat schon Daten; will-import: ein Export liegt bereit; none: es gibt nichts zu übernehmen */
  state: 'has-data' | 'will-import' | 'none';
  /** Für das Protokoll beim Start */
  text: string;
}

const listing = (dir: string): string => {
  try {
    const names = readdirSync(dir).sort();
    if (names.length === 0) return 'leer';
    return names.slice(0, 20).join(', ') + (names.length > 20 ? ` und ${names.length - 20} weitere` : '');
  } catch {
    return 'nicht lesbar';
  }
};

/**
 * Sagt vor dem Öffnen der Datenbank, ob und warum ein Umzug stattfindet. Eine neue App ohne Export startet still leer
 * und holt den Export nie mehr nach; die Protokollzeile zeigt dann sofort, was gesucht wurde und was stattdessen da liegt.
 */
export function transferStatus(dbPath: string, shareDir: string): TransferStatus {
  if (existsSync(dbPath) && statSync(dbPath).size > 0) return { state: 'has-data', text: 'Die App hat schon Daten, ein Umzug wird nicht gesucht' };
  const source = join(shareDir, TRANSFER_DIR);
  const sourceDb = join(source, DB_NAME);
  if (existsSync(sourceDb)) return { state: 'will-import', text: `Umzug: Export gefunden (${sourceDb})` };
  if (!existsSync(shareDir)) {
    return { state: 'none', text: `Umzug: Kein Export gefunden. Der Ordner ${shareDir} ist nicht eingebunden (die App braucht share:rw)` };
  }
  const found = existsSync(source) ? `Der Ordner ${source} enthält: ${listing(source)}.` : `In ${shareDir} liegt: ${listing(shareDir)}.`;
  return {
    state: 'none',
    text:
      `Umzug: Kein Export gefunden, gesucht wurde ${sourceDb}. ${found} ` +
      'Eine neue App ohne Daten startet damit leer. Sollte etwas übernommen werden: in der alten App Einstellungen › Umzug › Exportieren, ' +
      'dann diese App ohne Daten neu installieren (sie übernimmt nur beim allerersten Start).',
  };
}