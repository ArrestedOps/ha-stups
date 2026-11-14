import type { User } from '../store.js';
import type { AssignRule } from '../watcher-types.js';

export interface Decision {
  ids: string[];
  waiting: boolean;
  /** zuletzt gewählte Person für die Rotation */
  last?: string;
  /** "Erst vorschlagen": diese Personen fragen, wer übernimmt (die Aufgabe entsteht ohne Zuständige) */
  suggest?: string[];
}

/** Nächste Person nach `last` in der Reihenfolge des Kreises; mit `only` nur unter diesen */
export function nextOf(pool: string[], last: string | null, only?: Set<string>): string | undefined {
  if (pool.length === 0) return undefined;
  const start = last ? pool.indexOf(last) : -1;
  for (let i = 1; i <= pool.length; i += 1) {
    const id = pool[(start + i + pool.length) % pool.length]!;
    if (!only || only.has(id)) return id;
  }
  return undefined;
}

/** Wer `busy` ist („wenig Zeit"), wird bei Rotationen übersprungen; sind alle im Kreis beschäftigt, gilt die normale Reihenfolge */
export function rotate(pool: string[], last: string | null, busy: Set<string>, only?: Set<string>): string | undefined {
  const free = pool.filter((id) => !busy.has(id));
  return nextOf(pool, last, only ? new Set([...only].filter((id) => !busy.has(id))) : new Set(free)) ?? nextOf(pool, last, only);
}

/** Der Rückfall des Wächters (wenn niemand zu Hause ist oder sich niemand zum Übernehmen meldet) */
export function fallbackOf(rule: AssignRule, pool: string[], eligible: Set<string>, last: string | null, busy: Set<string>): Decision {
  if (rule.fallback === 'all') return { ids: pool, waiting: false };
  if (rule.fallback === 'none') return { ids: [], waiting: false };
  if (rule.fallback === 'fixed') {
    return { ids: rule.fallbackPersonId && eligible.has(rule.fallbackPersonId) ? [rule.fallbackPersonId] : [], waiting: false };
  }
  const next = rotate(pool, last, busy);
  return next ? { ids: [next], waiting: false, last: next } : { ids: [], waiting: false };
}

export function decide(rule: AssignRule, people: User[], home: Set<string>, last: string | null, busy: Set<string> = new Set()): Decision {
  const eligible = new Set(people.map((p) => p.id));
  const order = rule.personIds.length > 0 ? rule.personIds : people.map((p) => p.id);
  const pool = order.filter((id) => eligible.has(id));
  const fallback = (): Decision => fallbackOf(rule, pool, eligible, last, busy);
  const present = new Set(pool.filter((id) => home.has(id)));

  switch (rule.mode) {
    case 'none':
      return { ids: [], waiting: false };
    case 'fixed':
      return { ids: pool, waiting: false };
    case 'rotation': {
      const next = rotate(pool, last, busy);
      return next ? { ids: [next], waiting: false, last: next } : { ids: [], waiting: false };
    }
    case 'suggest': {
      // Gefragt werden alle Erwachsenen, die zu Hause sind; ist niemand da, greift sofort der Rückfall
      const ask = pool.filter((id) => present.has(id) && !people.find((p) => p.id === id)?.isChild);
      return ask.length > 0 ? { ids: [], waiting: false, suggest: ask } : fallback();
    }
    case 'all_present':
      return present.size > 0 ? { ids: pool.filter((id) => present.has(id)), waiting: false } : fallback();
    case 'rotation_present':
    case 'first_home': {
      if (present.size > 0) {
        const next = rotate(pool, last, busy, present);
        return next ? { ids: [next], waiting: false, last: next } : { ids: [], waiting: false };
      }
      return rule.mode === 'first_home' ? { ids: [], waiting: true } : fallback();
    }
  }
}
