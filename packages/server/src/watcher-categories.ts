import { ValidationError } from './errors.js';
import { t, withLanguage } from './i18n/index.js';
import type { TemplateId } from './watcher-templates.js';

/**
 * Kategorien der Wächter („Batterien", „Haushaltsgeräte" …). Eine Kategorie ist ein frei wählbarer Text je Wächter: Stups schlägt beim
 * Anlegen eine vor (aus der Vorlage, sonst aus Entität und Geräteklasse), der Mensch ändert sie oder legt eine eigene an. Hier steht die
 * EINE Ableitung der Vorschläge (Anlegen, „Kategorien vorschlagen") und die Regel zum Zusammenlegen gleicher Namen.
 */

/** Längste Kategorie in Zeichen */
export const MAX_CATEGORY = 40;

type CategoryId = 'battery' | 'appliances' | 'waste' | 'weather' | 'calendar' | 'presence' | 'climate' | 'energy' | 'security' | 'other';
const IDS: CategoryId[] = ['battery', 'appliances', 'waste', 'weather', 'calendar', 'presence', 'climate', 'energy', 'security', 'other'];

/** Die Namen der Standardkategorien in der Sprache der Anfrage */
const names = (): Record<CategoryId, string> => ({
  battery: t('Batterien'),
  appliances: t('Haushaltsgeräte'),
  waste: t('Müll & Abfall'),
  weather: t('Wetter'),
  calendar: t('Termine & Kalender'),
  presence: t('Anwesenheit'),
  climate: t('Klima'),
  energy: t('Energie'),
  security: t('Sicherheit'),
  other: t('Sonstiges'),
});

const fold = (s: string): string => s.trim().replace(/\s+/g, ' ');

/** Namen aller Standardkategorien in beiden Sprachen (kleingeschrieben) → Kennung: „Batterien" und „Batteries" sind dieselbe Kategorie */
const aliases = (): Map<string, CategoryId> => {
  const map = new Map<string, CategoryId>();
  for (const lang of ['de', 'en'] as const) {
    const n = withLanguage(lang, names);
    for (const id of IDS) map.set(fold(n[id]).toLowerCase(), id);
  }
  return map;
};

/** Schlüssel zum Vergleichen: ohne Beachtung der Groß-/Kleinschreibung, Standardkategorien sprachübergreifend gleich */
export function categoryKey(name: string): string {
  const k = fold(name).toLowerCase();
  const id = aliases().get(k);
  return id ? `#${id}` : k;
}

/** Eine Eingabe prüfen: Text, Leerräume gefaltet, höchstens 40 Zeichen; leer ist keine Kategorie (null) */
export function cleanCategory(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const what = t('Die Kategorie');
  if (typeof raw !== 'string') throw new ValidationError(t('{what} muss ein Text sein', { what }));
  const value = fold(raw);
  if (value === '') return null;
  if (value.length > MAX_CATEGORY) throw new ValidationError(t('{what} ist zu lang (höchstens {max} Zeichen)', { what, max: MAX_CATEGORY }));
  return value;
}

/** Gleiche Namen werden zusammengelegt: gibt es die Kategorie schon (andere Schreibweise), gilt deren Schreibweise */
export function mergeCategory(name: string | null, existing: string[]): string | null {
  if (name === null) return null;
  const key = categoryKey(name);
  return existing.find((e) => categoryKey(e) === key) ?? name;
}

// ---------- Vorschläge ----------

const TEMPLATE_CATEGORY: Partial<Record<TemplateId, CategoryId>> = {
  washer: 'appliances',
  dryer: 'appliances',
  dishwasher: 'appliances',
  vacuum: 'appliances',
  bins: 'waste',
  rain: 'weather',
  battery: 'battery',
  window_open: 'security',
  fridge_open: 'appliances',
  leak: 'security',
  plant: 'other',
  humid: 'climate',
  co2: 'climate',
  dehumidifier: 'appliances',
  robot_error: 'appliances',
  filter_life: 'appliances',
  toner: 'other',
  level: 'energy',
  refill: 'appliances',
  litter: 'other',
  ev_plug: 'energy',
  mail: 'other',
  garage_lock: 'security',
  freezer_warm: 'appliances',
  unavailable: 'other',
  update: 'other',
};

/** Kategorie einer Vorlage; Vorlagen ohne Wächter (Entkalken …) haben keine */
export function categoryOfTemplate(id: string): string | null {
  const c = TEMPLATE_CATEGORY[id as TemplateId];
  return c ? names()[c] : null;
}

const APPLIANCE = /waschmaschine|waschmasch|washing|washer|trockner|dryer|tumble|sp[üu]lmaschine|geschirrsp|dishwasher|k[üu]hlschrank|fridge|freezer|gefrier|backofen|\boven\b/;
const WASTE = /m[üu]ll|abfall|tonne|waste|garbage|trash|rubbish|\bbins?\b/;
const BATTERY = /batter|akku/;
const PRESENCE = /anwesen|presence|occupancy/;
const SECURITY = new Set(['smoke', 'door', 'window', 'garage_door', 'opening', 'motion', 'gas', 'carbon_monoxide', 'lock', 'tamper', 'safety', 'vibration']);
const ENERGY = new Set(['power', 'apparent_power', 'reactive_power', 'current', 'voltage', 'energy', 'power_factor']);
const CLIMATE = new Set(['temperature', 'humidity', 'moisture', 'pressure', 'co2', 'carbon_dioxide']);

export interface CategoryHints {
  entityId: string;
  deviceClass?: string | undefined;
  unit?: string | undefined;
  /** Friendly Name und/oder Name des Wächters: Wörter wie „Waschmaschine" helfen, wenn die Geräteklasse fehlt */
  name?: string | undefined;
}

function idOfEntity(h: CategoryHints): CategoryId {
  const domain = h.entityId.split('.')[0] ?? '';
  const hay = `${h.name ?? ''} ${h.entityId}`.toLowerCase();
  if (domain === 'weather') return 'weather';
  if (domain === 'calendar') return WASTE.test(hay) ? 'waste' : 'calendar';
  if (domain === 'person' || domain === 'device_tracker') return 'presence';
  if (domain === 'vacuum') return 'appliances';
  if (domain === 'lock' || domain === 'alarm_control_panel') return 'security';
  if (h.deviceClass === 'battery' || (h.unit?.trim() === '%' && BATTERY.test(h.entityId.toLowerCase()))) return 'battery';
  if (APPLIANCE.test(hay)) return 'appliances';
  if (WASTE.test(hay)) return 'waste';
  const dc = h.deviceClass ?? '';
  if (CLIMATE.has(dc)) return 'climate';
  if (ENERGY.has(dc)) return 'energy';
  if (SECURITY.has(dc)) return 'security';
  if (dc === 'presence' || dc === 'occupancy' || PRESENCE.test(hay)) return 'presence';
  return 'other';
}

/** Vorschlag für eine Entität ohne Vorlage (aus Domäne, Geräteklasse und Name); nie leer, im Zweifel „Sonstiges" */
export const categoryOfEntity = (h: CategoryHints): string => names()[idOfEntity(h)];

/** Vorschlag für einen vorhandenen Wächter (Sammelknopf): die Entität, dazu Art der Bedingung und Name des Wächters */
export function categoryOfWatcher(w: { name: string; trigger: { entityId: string; kind: string } }, seen?: { deviceClass?: string | undefined; unit?: string | undefined; name?: string | undefined } | null): string {
  if (w.trigger.kind === 'forecast') return names().weather;
  return categoryOfEntity({ entityId: w.trigger.entityId, deviceClass: seen?.deviceClass, unit: seen?.unit, name: `${w.name} ${seen?.name ?? ''}` });
}
