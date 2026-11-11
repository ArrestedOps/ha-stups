import type { User } from './api';
import { deviceName } from './pushStand';

/**
 * Einrichtung beim ersten Start (dev/onboarding/README.md): reine Funktionen für Schritte, Personen und Treffer.
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
 * `mobile_app_iphone_anna`. Zu kurze Namen (unter drei Buchstaben) raten nicht. Es zählen nur ganze Wörter des Gerätenamens (mit
 * Genitiv-s): „Ann" findet kein `annas_iphone`, „Jan" kein `jannik_pixel`.
 */
export function matchDevices(name: string, services: string[]): string[] {
  const first = fold(name).trim().split(/[^a-z0-9]+/)[0] ?? '';
  if (first.length < 3) return [];
  return services.filter((s) =>
    fold(s)
      .replace(/^mobile_app_/, '')
      .split('_')
      .some((token) => token === first || token === `${first}s`),
  );
}

/**
 * Das eine Gerät, das nach dem Namen zu dieser Person gehört: genau ein Treffer, und keine andere Person (`otherNames`) passt auf
 * dasselbe Gerät. Sonst null: ein Namensverdacht ist keine bestätigte Zugehörigkeit, die Person wählt dann selbst.
 */
export function uniqueDeviceByName(name: string, otherNames: string[], services: string[]): string | null {
  const found = matchDevices(name, services);
  if (found.length !== 1) return null;
  return otherNames.some((other) => matchDevices(other, found).length > 0) ? null : found[0]!;
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
  /** Die Geräte dieser Person (Push-Dienste der Companion App); leer, wenn keins gefunden ist */
  devices: string[];
  /** Die Geräte müssen noch eingetragen werden (erkannt, aber nicht schon bei der Person gespeichert) */
  deviceNew: boolean;
  /** Passende Geräte zum Namen, wenn sich keins eindeutig zuordnen ließ (nur zur Anzeige) */
  choices: string[];
}

/**
 * Die Geräte einer Person nach Home Assistant: zu jedem Eintrag in `device_trackers` (`device_tracker.connys_iphone`) der Push-Dienst der
 * Companion App (`mobile_app_connys_iphone`), in der Reihenfolge von Home Assistant. Das ist genauer als jeder Name (auch bei doppelten
 * Anmeldungen wie `connys_iphone` und `connys_iphone_2`). Gibt es keinen Dienst mit genau diesem Namen, gilt einer mit Zähler
 * (`mobile_app_iphone_von_rene_2` zu `device_tracker.iphone_von_rene`): so benennt Home Assistant Geräte, die neu angemeldet wurden.
 */
export function devicesOfTrackers(trackers: string[] | undefined, services: string[]): string[] {
  const out: string[] = [];
  for (const tracker of trackers ?? []) {
    const base = `mobile_app_${tracker.replace(/^device_tracker\./, '')}`;
    const exact = services.filter((s) => s === base);
    const counted = services.filter((s) => s.startsWith(`${base}_`) && /^\d+$/.test(s.slice(base.length + 1)));
    for (const s of exact.length > 0 ? exact : counted) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Du zuerst (nur auf Wunsch sichtbar), dann die Personen, die schon in Stups stehen, dann die aus Home Assistant, die noch fehlen */
export function buildCandidates(input: {
  me: User;
  people: User[];
  haPersons: { name: string; userId: string | null; deviceTrackers?: string[] }[];
  services: string[];
}): Candidate[] {
  const { me, people, haPersons, services } = input;
  const isMe = (h: { name: string; userId: string | null }) =>
    (h.userId !== null && h.userId === me.haUserId) || [me.displayName, me.name].some((n) => fold(n) === fold(h.name));
  // Alle Namen der Liste: ein Gerät, das zum Namen von mehr als einer Person passt, gehört keiner sicher (nur ein Verdacht)
  const names = [me.displayName, ...people.filter((p) => p.id !== me.id).map((p) => p.displayName), ...haPersons.filter((x) => !isMe(x)).map((x) => x.name)];
  const make = (base: Pick<Candidate, 'key' | 'name' | 'haUserId' | 'personId' | 'self' | 'isChild'>, existing: User | null, trackers?: string[]): Candidate => {
    const own = existing?.notifyServices ?? [];
    if (own.length > 0) return { ...base, phone: 'found', devices: own, deviceNew: false, choices: own };
    // 1. was Home Assistant der Person zuordnet, 2. sonst ein Gerät, dessen Name zum Namen passt (nur wenn es genau eins ist und
    // zu keiner anderen Person passt; sonst bleibt die Wahl offen und das Gerät steht nur als Vorschlag in der Auswahl)
    const assigned = devicesOfTrackers(trackers, services);
    if (assigned.length > 0) return { ...base, phone: 'found', devices: assigned, deviceNew: true, choices: assigned };
    const found = matchDevices(base.name, services);
    const others = names.filter((_, i) => i !== names.indexOf(base.name));
    const sure = uniqueDeviceByName(base.name, others, services);
    if (sure) return { ...base, phone: 'found', devices: [sure], deviceNew: true, choices: found };
    return { ...base, phone: existing?.ntfy ? 'found' : 'missing', devices: [], deviceNew: false, choices: found };
  };
  const mine = people.find((p) => p.id === me.id) ?? (me.isPerson ? me : null);
  const myHa = haPersons.find(isMe);
  const out: Candidate[] = [
    make({ key: 'self', name: me.displayName, haUserId: me.haUserId, personId: mine ? mine.id : null, self: true, isChild: false }, mine, myHa?.deviceTrackers),
  ];
  for (const p of people) {
    if (p.id === me.id) continue;
    out.push(make({ key: `p:${p.id}`, name: p.displayName, haUserId: p.haUserId, personId: p.id, self: false, isChild: p.isChild }, p));
  }
  // Du steht oben und nicht noch einmal als Person aus Home Assistant (die Administratorin ist dort eine Person, in Stups noch nicht)
  for (const h of haPersons.filter((x) => !isMe(x))) {
    out.push(make({ key: `ha:${h.userId ?? h.name}`, name: h.name, haUserId: h.userId, personId: null, self: false, isChild: false }, null, h.deviceTrackers));
  }
  return out;
}

/** Wer in der Liste steht: der Administrator nur, wenn er selbst schon eine Person ist oder „Mich auch hinzufügen" gewählt hat */
export const visibleCandidates = (candidates: Candidate[], includeSelf: boolean): Candidate[] => candidates.filter((c) => !c.self || includeSelf);

/** Alle, die in der Liste stehen, sind vorgewählt */
export const defaultSelection = (candidates: Candidate[], includeSelf: boolean): string[] => visibleCandidates(candidates, includeSelf).map((c) => c.key);

/** Antippen: an- oder abwählen; die Reihenfolge der Liste bleibt */
export function toggleSelection(selected: string[], key: string, candidates: Candidate[]): string[] {
  return candidates.map((c) => c.key).filter((k) => (k === key ? !selected.includes(k) : selected.includes(k)));
}

/** „Wer ist ein Kind?": zur Wahl stehen die gewählten Personen, nie der Administrator (ein Administrator ist nie ein Kind) */
export const childChoices = (candidates: Candidate[], selected: string[]): Candidate[] => candidates.filter((c) => !c.self && selected.includes(c.key));

/**
 * Wer im Assistenten bei „Wer kommt infrage?" vorausgewählt ist: die gewählten Personen ohne Kinder (gibt es nur Kinder, dann diese).
 * Alles andere am Wächter bleibt, wie die Vorlage und der Assistent es vorgeben.
 */
export function assigneeIds(personIds: string[], childIds: string[]): string[] {
  const adults = personIds.filter((id) => !childIds.includes(id));
  return adults.length > 0 ? adults : personIds;
}

// ---------- Handy von Hand wählen ----------

/** Die Geräte, die für diese Person gelten: die Wahl von Hand (auch eine leere) geht vor, sonst was erkannt wurde */
export const effectiveDevices = (c: Candidate, overrides: Record<string, string[]>): string[] => overrides[c.key] ?? c.devices;

/**
 * Die Geräteliste, die für diese Person gespeichert werden muss (null: der gespeicherte Stand bleibt). Verglichen wird mit dem, was in
 * Stups schon steht: bei neu erkannten Geräten (`deviceNew`) steht noch nichts. Eine bewusst geleerte Liste ist eine Änderung und wird
 * übertragen (sonst bliebe das letzte abgewählte Handy zugeordnet).
 */
export function deviceChange(c: Candidate, overrides: Record<string, string[]>): string[] | null {
  const devices = effectiveDevices(c, overrides);
  const stored = c.deviceNew ? [] : c.devices;
  const same = devices.length === stored.length && devices.every((d) => stored.includes(d));
  return same ? null : devices;
}

/** Antippen: ein Gerät an- oder abwählen (eine Person kann mehrere Handys und ein Tablet haben) */
export const toggleDevice = (current: string[], service: string): string[] => (current.includes(service) ? current.filter((s) => s !== service) : [...current, service]);

export interface DeviceOption {
  service: string;
  /** Home Assistant oder der Name ordnet es dieser Person zu */
  assigned: boolean;
  /** Der Name der anderen Person, die dieses Gerät schon gewählt hat (sonst null) */
  takenBy: string | null;
}

/**
 * Alle Geräte der Companion App zur Auswahl für eine Person: zuerst die, die zu ihr passen (in der Reihenfolge der Erkennung), dann alle
 * anderen nach Gerätename. `query` sucht im Gerätenamen. „takenBy" zeigt, wer ein Gerät schon hat, damit man nicht zwei Personen dasselbe Handy gibt.
 */
export function deviceOptions(candidate: Candidate, candidates: Candidate[], services: string[], overrides: Record<string, string[]>, query = ''): DeviceOption[] {
  const q = fold(query).trim();
  const label = (s: string) => fold(`${deviceName(s)} ${s}`);
  const owner = (service: string): string | null => candidates.find((o) => o.key !== candidate.key && effectiveDevices(o, overrides).includes(service))?.name ?? null;
  const rank = (s: string) => {
    const i = candidate.choices.indexOf(s);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return services
    .filter((s) => q === '' || label(s).includes(q))
    .map((s) => ({ service: s, assigned: candidate.choices.includes(s), takenBy: owner(s) }))
    .sort((a, b) => rank(a.service) - rank(b.service) || deviceName(a.service).localeCompare(deviceName(b.service)));
}
