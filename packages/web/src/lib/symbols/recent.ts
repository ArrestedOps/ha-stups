import { symbolById } from './library';

/** Zuletzt benutzte Symbole dieses Geräts (nur eine Bequemlichkeit, nie wichtig: ohne Speicher bleibt alles benutzbar) */
export const RECENT_KEY = 'stups.recentIcons';
export const RECENT_MAX = 6;

/** Rückfall, wenn der Speicher des Browsers gesperrt ist (privates Fenster, gelöschte Websitedaten): gilt bis zum Neuladen */
let memory: string[] = [];
export const resetRecentMemory = (): void => {
  memory = [];
};

const defaultStorage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

function clean(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) if (typeof v === 'string' && symbolById(v) && !out.includes(v)) out.push(v);
  return out.slice(0, RECENT_MAX);
}

export function recentSymbols(storage: Storage | null = defaultStorage()): string[] {
  try {
    if (!storage) return memory;
    const raw = storage.getItem(RECENT_KEY);
    if (raw === null) return [];
    return clean(JSON.parse(raw));
  } catch {
    return memory;
  }
}

/** Merkt sich ein benutztes Symbol (das neueste steht vorn, jedes nur einmal) */
export function pushRecent(id: string, storage: Storage | null = defaultStorage()): void {
  if (!symbolById(id)) return;
  const next = [id, ...recentSymbols(storage).filter((x) => x !== id)].slice(0, RECENT_MAX);
  try {
    if (!storage) throw new Error('kein Speicher');
    storage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    memory = next;
  }
}
