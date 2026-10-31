import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrations as defaultMigrations } from './migrations.js';

export interface Migration {
  version: number;
  sql: string;
}

export interface OpenOptions {
  migrations?: Migration[];
  /** Where to copy the database file before applying migrations to an existing database. */
  backupDir?: string;
  now?: () => Date;
}

const KEEP_BACKUPS = 5;
const BACKUP_RE = /^stups-v(\d+)-(.+)\.sqlite$/;

function userVersion(db: DatabaseSync): number {
  return (db.prepare('pragma user_version').get() as { user_version: number }).user_version;
}

function backup(db: DatabaseSync, path: string, dir: string, version: number, now: Date): void {
  db.exec('pragma wal_checkpoint(truncate)');
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  copyFileSync(path, join(dir, `stups-v${version}-${stamp}.sqlite`));

  const files = readdirSync(dir)
    .map((name) => ({ name, m: BACKUP_RE.exec(name) }))
    .filter((f): f is { name: string; m: RegExpExecArray } => f.m !== null)
    .sort((a, b) => (a.m[2]! < b.m[2]! ? 1 : -1)); // newest first
  for (const old of files.slice(KEEP_BACKUPS)) rmSync(join(dir, old.name));
}

export function openDb(path: string, opts: OpenOptions = {}): DatabaseSync {
  const migrations = [...(opts.migrations ?? defaultMigrations)].sort((a, b) => a.version - b.version);
  const now = opts.now ?? (() => new Date());
  const inMemory = path === ':memory:';
  const existed = !inMemory && existsSync(path) && statSync(path).size > 0;

  if (!inMemory) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('pragma foreign_keys = on');
  if (!inMemory) db.exec('pragma journal_mode = wal');

  const current = userVersion(db);
  const pending = migrations.filter((m) => m.version > current);
  if (pending.length > 0 && existed && current > 0 && opts.backupDir) {
    backup(db, path, opts.backupDir, current, now());
  }
  for (const m of pending) {
    db.exec('begin');
    try {
      db.exec(m.sql);
      db.exec(`pragma user_version = ${m.version}`);
      db.exec('commit');
    } catch (err) {
      db.exec('rollback');
      db.close();
      throw err;
    }
  }
  return db;
}
