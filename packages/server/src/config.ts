import { readFileSync } from 'node:fs';

export interface UserOption {
  name: string;
  notify: string[];
}

export type AccessModeOption = 'everyone' | 'selected';

export interface Options {
  users: UserOption[];
  /** gilt nur, wenn users ausgefüllt ist (dann verwaltet die Konfiguration Personen und Zugriff) */
  accessMode: AccessModeOption;
  dashboardPath: string;
  dailySummaryTime: string;
  overdueNagTime: string;
  logLevel: string;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Mit `invalid` (Add-on) fällt eine ungültige Uhrzeit auf den Standard zurück und der Schlüssel wird vermerkt, statt den Start abzubrechen */
function time(raw: unknown, fallback: string, key: string, invalid?: string[]): string {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw !== 'string' || !TIME_RE.test(raw)) {
    if (invalid) {
      invalid.push(key);
      return fallback;
    }
    throw new Error(`Option ${key} muss die Form HH:MM haben, ist aber ${JSON.stringify(raw)}`);
  }
  return raw;
}

function str(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : fallback;
}

export function parseOptions(raw: unknown, invalid?: string[]): Options {
  const o = (raw ?? {}) as Record<string, unknown>;
  const users = Array.isArray(o.users) ? o.users : [];
  const dashboard = str(o.dashboard_path, '/lovelace/0');
  return {
    users: users.map((u) => {
      const entry = (u ?? {}) as Record<string, unknown>;
      const notify = Array.isArray(entry.notify) ? entry.notify : [];
      return {
        name: str(entry.name, ''),
        notify: notify
          .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
          .map((n) => n.trim().replace(/^notify\./, '')),
      };
    }),
    accessMode: o.access_mode === 'everyone' ? 'everyone' : 'selected',
    dashboardPath: dashboard.startsWith('/') ? dashboard : `/${dashboard}`,
    dailySummaryTime: time(o.daily_summary_time, '08:00', 'daily_summary_time', invalid),
    overdueNagTime: time(o.overdue_nag_time, '18:00', 'overdue_nag_time', invalid),
    logLevel: str(o.log_level, 'info'),
  };
}

export function loadOptions(path: string): Options {
  try {
    return parseOptions(JSON.parse(readFileSync(path, 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return parseOptions({});
    throw err;
  }
}
