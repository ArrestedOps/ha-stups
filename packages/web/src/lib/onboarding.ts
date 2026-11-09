import type { User } from './api';
import type { WatcherSuggestion } from './watcher-types';

/**
 * Einrichtung beim ersten Start (docs/onboarding/README.md): reine Funktionen für Schritte, Personen und Treffer.
 * Die Oberfläche (Onboarding.svelte, lib/onboarding.svelte.ts) hält nur Zustand und Aufrufe.
 */

/** Administrator: Willkommen, Personen, Wächter, Test, Fertig. Mitglied: Handy, Farbe. Kind: nur Handy. */
export type Step = 'welcome' | 'people' | 'watcher' | 'test' | 'done' | 'phone' | 'color';

export interface Role {
  isAdmin: boolean;
  isChild: boolean;
}

/** Welche Schritte es gibt: `people` entfällt im Container mit eigenen Konten, `watcher` ohne Home Assistant oder ohne das Recht */
export interface Flow {
  people: boolean;
  watcher: boolean;
}

export function stepsFor(role: Role, flow: Flow): Step[] {
  if (role.isChild) return ['phone'];
  if (!role.isAdmin) return ['phone', 'color'];
  return ['welcome', ...(flow.people ? (['people'] as const) : []), ...(flow.watcher ? (['watcher'] as const) : []), 'test', 'done'];
}

/** Der gemerkte Schritt, wenn es ihn für diese Person gibt, sonst der erste */
export function nextOpenStep(steps: Step[], saved: string | null | undefined): Step {
  return steps.find((s) => s === saved) ?? steps[0]!;
}

export function progressOf(steps: Step[], step: Step): { index: number; total: number } {
  return { index: Math.max(0, steps.indexOf(step)) + 1, total: steps.length };
}

// ---------- Companion App ----------

/** Die Home-Assistant-Companion-App in den Stores (geprüft gegen companion.home-assistant.io); öffnen sich außerhalb der App */
export const COMPANION_APP_LINKS = {
  ios: 'https://apps.apple.com/app/home-assistant/id1099568401',
  android: 'https://play.google.com/store/apps/details?id=io.homeassistant.companion.android',
} as const;

// ---------- Personen und Handys ----------

const fold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Push-Dienste der Companion App (`mobile_app_…`), die zu einem Namen passen: „Anna" findet `mobile_app_annas_iphone` und
 * `mobile_app_iphone_anna`. Zu kurze Namen (unter drei Buchstaben) raten nicht.
 */
export function matchDevices(name: string, services: string[]): string[] {
  const first = fold(name).trim().split(/[^a-z0-9]+/)[0] ?? '';
  if (first.length < 3) return [];
  return services.filter((s) =>
    fold(s)
      .replace(/^mobile_app_/, '')
      .split('_')
      .some((token) => token === first || token === `${first}s` || token.startsWith(first)),
  );
}

export interface Candidate {
  /** `self`, `p:<Id>` (steht schon in Stups) oder `ha:<Benutzer-Id oder Name>` (aus Home Assistant) */
  key: string;
  name: string;
  haUserId: string | null;
  /** Id in Stups; null, wenn die Person erst angelegt wird */
  personId: string | null;
  self: boolean;
  /** Rolle Kind schon gesetzt (bei bestehenden Personen) */
  isChild: boolean;
  /** `found`: es gibt ein Handy (Gerät oder ntfy), `missing`: keins gefunden */
  phone: 'found' | 'missing';
  /** Das Gerät dieser Person (Push-Dienst); null, wenn keins gewählt ist */
  device: string | null;
  /** Das Gerät muss noch eingetragen werden (automatisch gewählt, nicht schon bei der Person gespeichert) */
  deviceNew: boolean;
  /** Passende Geräte zur Auswahl, wenn nicht eindeutig */
  choices: string[];
}

/** Du zuerst, dann die Personen, die schon in Stups stehen, dann die aus Home Assistant, die noch fehlen */
export function buildCandidates(input: {
  me: User;
  people: User[];
  haPersons: { name: string; userId: string | null }[];
  services: string[];
}): Candidate[] {
  const { me, people, haPersons, services } = input;
  const make = (base: Pick<Candidate, 'key' | 'name' | 'haUserId' | 'personId' | 'self' | 'isChild'>, existing: User | null): Candidate => {
    const own = existing?.notifyServices ?? [];
    if (own.length > 0) return { ...base, phone: 'found', device: own[0]!, deviceNew: false, choices: own };
    const found = matchDevices(base.name, services);
    if (found.length === 1) return { ...base, phone: 'found', device: found[0]!, deviceNew: true, choices: found };
    return { ...base, phone: existing?.ntfy ? 'found' : 'missing', device: null, deviceNew: false, choices: found };
  };
  const mine = people.find((p) => p.id === me.id) ?? (me.isPerson ? me : null);
  const out: Candidate[] = [
    make({ key: 'self', name: me.displayName, haUserId: me.haUserId, personId: mine ? mine.id : null, self: true, isChild: false }, mine),
  ];
  for (const p of people) {
    if (p.id === me.id) continue;
    out.push(make({ key: `p:${p.id}`, name: p.displayName, haUserId: p.haUserId, personId: p.id, self: false, isChild: p.isChild }, p));
  }
  for (const h of haPersons) {
    out.push(make({ key: `ha:${h.userId ?? h.name}`, name: h.name, haUserId: h.userId, personId: null, self: false, isChild: false }, null));
  }
  return out;
}

/** Alle sind vorgewählt */
export const defaultSelection = (candidates: Candidate[]): string[] => candidates.map((c) => c.key);

/** Antippen: an- oder abwählen. Du bleibt gewählt. */
export function toggleSelection(selected: string[], key: string, candidates: Candidate[]): string[] {
  if (candidates.find((c) => c.key === key)?.self) return selected;
  return selected.includes(key) ? selected.filter((k) => k !== key) : candidates.map((c) => c.key).filter((k) => k === key || selected.includes(k));
}

/**
 * Wer die Wächter bekommt: die gewählten Personen ohne Kinder (gibt es nur Kinder, dann diese). `ids` ordnet Schlüssel den Ids in Stups zu;
 * wer noch keine Id hat, fehlt.
 */
export function assigneeIds(selected: string[], ids: Record<string, string>, children: Set<string>): string[] {
  const all = selected.filter((k) => ids[k]);
  const adults = all.filter((k) => !children.has(k));
  return (adults.length > 0 ? adults : all).map((k) => ids[k]!);
}

// ---------- Wächter ----------

/** Rangfolge der Vorlagen für den besten Treffer; alles andere folgt in der Reihenfolge des Servers */
const HIT_ORDER = ['washer', 'dryer', 'dishwasher', 'bins', 'battery'];
/** Beste Treffer im Onboarding: einer groß, bis zu zwei als Zeilen */
export const OTHER_HITS = 2;

export function rankHits(items: WatcherSuggestion[]): { best: WatcherSuggestion | null; others: WatcherSuggestion[] } {
  const rank = (h: WatcherSuggestion) => {
    const i = HIT_ORDER.indexOf(h.templateId);
    return i < 0 ? HIT_ORDER.length : i;
  };
  const sorted = items.map((h, i) => ({ h, i })).sort((a, b) => rank(a.h) - rank(b.h) || a.i - b.i).map((x) => x.h);
  return { best: sorted[0] ?? null, others: sorted.slice(1, 1 + OTHER_HITS) };
}
