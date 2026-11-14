import type { HaState } from './ha.js';
import { deviceLabel } from './device-names.js';
import { t } from './i18n/index.js';
import type { Recurrence } from './recurrence.js';
import type { AssignMode, DueRule } from './watcher-types.js';

/**
 * Vorlagen für Wächter und ihre Erkennung: Stups sucht in den Entitäten von Home Assistant selbst, was zu einer Vorlage passt
 * ("Steckdose Trockner misst Leistung"), statt dass man Entitäts-ID, Schwellwert und Minuten kennen muss.
 * Dazu Vorlagen ohne Gerät: wiederkehrende Karten (Entkalken, Rauchmelder testen …), die kein Wächter brauchen.
 */

export type TemplateId =
  | 'washer'
  | 'dryer'
  | 'dishwasher'
  | 'bins'
  | 'rain'
  | 'battery'
  | 'vacuum'
  | 'descale'
  | 'smoke'
  | 'filter'
  | 'bedding'
  | 'window_open'
  | 'fridge_open'
  | 'leak'
  | 'plant'
  | 'humid'
  | 'co2'
  | 'dehumidifier'
  | 'robot_error'
  | 'filter_life'
  | 'toner'
  | 'level'
  | 'refill'
  | 'litter'
  | 'ev_plug'
  | 'mail'
  | 'garage_lock'
  | 'freezer_warm'
  | 'unavailable'
  | 'update';

/** Wann sich die Karte von selbst erledigt: ein Wert, den der Sensor erreicht, oder ein Zustand (Fenster wieder zu) */
export type DraftDone = { kind: 'above' | 'below'; value: number } | { kind: 'state'; to: string };

/** Wie die Vorlage den Wächter vorbelegt (die Oberfläche übernimmt es ins Formular; der Mensch passt es an) */
export interface TemplateDraft {
  name: string;
  trigger:
    | { kind: 'below' | 'above'; value: number; forMin: number; count?: number }
    | { kind: 'state'; to: string; forMin: number; count?: number }
    | { kind: 'calendar_event'; leadMin: number }
    | { kind: 'forecast'; condition: 'rain'; hours: number };
  card: { title: string; due: DueRule };
  assign: { mode: AssignMode };
  /** Karte erledigt sich von selbst, wenn die Entität diese Bedingung erreicht (nur wo der Sensor das belegen kann) */
  done: DraftDone | null;
}

export interface WatcherTemplate {
  id: TemplateId;
  kind: 'watcher' | 'recurring';
  title: string;
  hint: string;
  /** Domäne der Entität (für die Suche von Hand) und ein Suchwort */
  domain: string | null;
  search: string;
  draft: TemplateDraft | null;
  /** Nur bei kind = recurring: die Karte, die sich von selbst wiederholt */
  recurring: { title: string; recurrence: Recurrence } | null;
  /** Kann der Sensor belegen, dass die Aufgabe erledigt ist? Sonst bleibt „Von selbst erledigen" aus, mit Begründung */
  canSelfComplete: boolean;
  whyNoSelfComplete: string | null;
}

/** Ein Treffer der Erkennung */
export interface Suggestion {
  templateId: TemplateId;
  entityId: string;
  name: string;
  reason: string;
  /** Einheit des Sensors (zum Beispiel W), falls Home Assistant eine meldet */
  unit?: string;
  /**
   * Welche Fassung der Vorlage passt: Leistung (power) oder Programmstatus des Geräts (status); bei den Vorlagen mit zwei Bauformen
   * der Pegel (level) oder der Schaltzustand (switch), beim Garagentor und Türschloss (cover, lock). Nur Treffer derselben Fassung
   * lassen sich gemeinsam einrichten.
   */
  variant: 'power' | 'status' | 'default' | 'level' | 'switch' | 'cover' | 'lock';
  /** Ersatz für den Entwurf der Vorlage (beim Programmstatus: Wechsel in „finished") */
  draft?: TemplateDraft;
  /** Kurzer Gerätename für Name und Kartentitel des neuen Wächters ("iPhone Rene" statt "iPhone Rene Battery Level") */
  label: string;
}

/** Ein Treffer, bevor der Gerätename dazukommt (das geschieht einmal am Ende) */
type Hit = Omit<Suggestion, 'label'>;

const NOT_PROVABLE_APPLIANCE = () => t('Ein Sensor weiß nicht, ob jemand das Gerät schon ausgeräumt hat.');

/** Die Vorlagen in der Sprache der Anfrage */
export function watcherTemplates(): WatcherTemplate[] {
  const appliance = (id: TemplateId, title: string, hint: string, search: string, card: string): WatcherTemplate => ({
    id,
    kind: 'watcher',
    title,
    hint,
    domain: 'sensor',
    search,
    draft: {
      name: title,
      trigger: { kind: 'below', value: 5, forMin: 3 },
      card: { title: card, due: { kind: 'in', minutes: 30 } },
      assign: { mode: 'rotation_present' },
      done: null,
    },
    recurring: null,
    canSelfComplete: false,
    whyNoSelfComplete: NOT_PROVABLE_APPLIANCE(),
  });
  const recurring = (id: TemplateId, title: string, hint: string, card: string, recurrence: Recurrence): WatcherTemplate => ({
    id,
    kind: 'recurring',
    title,
    hint,
    domain: null,
    search: '',
    draft: null,
    recurring: { title: card, recurrence },
    canSelfComplete: false,
    whyNoSelfComplete: null,
  });
  return [
    appliance(
      'washer',
      t('Waschmaschine fertig'),
      t('Leistungs-Sensor, der nach dem Waschen unter einen kleinen Wert fällt. Hängen Waschmaschine und Trockner an einer Steckdose, hilft nur ein eigener Sensor je Gerät.'),
      t('waschmaschine leistung'),
      t('Waschmaschine ausräumen'),
    ),
    appliance('dryer', t('Trockner fertig'), t('Leistungs-Sensor, der nach dem Trocknen unter einen kleinen Wert fällt.'), t('trockner leistung'), t('Wäsche aus dem Trockner holen')),
    appliance('dishwasher', t('Spülmaschine fertig'), t('Leistungs-Sensor, der nach dem Spülen unter einen kleinen Wert fällt.'), t('spülmaschine leistung'), t('Spülmaschine ausräumen')),
    {
      id: 'bins',
      kind: 'watcher',
      title: t('Tonnen rausstellen'),
      hint: t('Kalender mit den Abfallterminen (zum Beispiel aus der Müllabfuhr-Integration). Am Vorabend entsteht die Karte.'),
      domain: 'calendar',
      search: t('müll abfall'),
      draft: {
        name: t('Tonnen rausstellen'),
        trigger: { kind: 'calendar_event', leadMin: 12 * 60 },
        card: { title: t('Tonnen rausstellen'), due: { kind: 'in', minutes: 12 * 60 } },
        assign: { mode: 'rotation_present' },
        done: null,
      },
      recurring: null,
      canSelfComplete: false,
      whyNoSelfComplete: t('Der Kalender weiß nicht, ob die Tonne schon draußen steht.'),
    },
    {
      id: 'rain',
      kind: 'watcher',
      title: t('Wäsche rein, es regnet'),
      hint: t('Wetter-Entität (weather): sobald in den nächsten Stunden Regen vorhergesagt ist, bekommt jemand die Karte.'),
      domain: 'weather',
      search: '',
      draft: {
        name: t('Wäsche rein, es regnet'),
        trigger: { kind: 'forecast', condition: 'rain', hours: 3 },
        card: { title: t('Wäsche reinholen, es regnet bald'), due: { kind: 'in', minutes: 30 } },
        assign: { mode: 'rotation_present' },
        done: null,
      },
      recurring: null,
      canSelfComplete: false,
      whyNoSelfComplete: t('Das Wetter weiß nicht, ob die Wäsche schon drin ist.'),
    },
    {
      id: 'battery',
      kind: 'watcher',
      title: t('Batterie schwach'),
      hint: t('Batterie-Sensor eines Geräts. Name und Karte nennen das Gerät dazu.'),
      domain: 'sensor',
      search: t('batterie'),
      draft: {
        name: t('Batterie schwach'),
        trigger: { kind: 'below', value: 20, forMin: 10 },
        card: { title: t('Batterie wechseln'), due: { kind: 'none' } },
        assign: { mode: 'rotation_present' },
        // ein neuer Satz Batterien zeigt sich im Sensor: die Karte erledigt sich von selbst
        done: { kind: 'above', value: 50 },
      },
      recurring: null,
      canSelfComplete: true,
      whyNoSelfComplete: null,
    },
    {
      id: 'vacuum',
      kind: 'watcher',
      title: t('Saugroboter: Behälter leeren'),
      hint: t('Staubsaugerroboter (vacuum). Nach 3 Reinigungen entsteht die Karte; wer zuerst nach Hause kommt, bekommt sie. Wird die Karte erledigt, beginnt die Zählung von vorn.'),
      domain: 'vacuum',
      search: '',
      draft: {
        name: t('Saugroboter: Behälter leeren'),
        trigger: { kind: 'state', to: 'docked', forMin: 0, count: 3 },
        card: { title: t('Staubbehälter leeren'), due: { kind: 'none' } },
        assign: { mode: 'first_home' },
        done: null,
      },
      recurring: null,
      canSelfComplete: false,
      whyNoSelfComplete: t('Der Roboter weiß nicht, ob jemand den Behälter geleert hat.'),
    },
    ...deviceTemplates(),
    recurring('descale', t('Entkalken'), t('Kaffeemaschine, Wasserkocher oder Waschmaschine: alle 3 Monate eine Karte.'), t('Entkalken'), { type: 'fixed', freq: 'monthly', every: 3 }),
    recurring('smoke', t('Rauchmelder testen'), t('Alle 6 Monate eine Karte, damit der Test nicht untergeht.'), t('Rauchmelder testen'), { type: 'fixed', freq: 'monthly', every: 6 }),
    recurring('filter', t('Filter wechseln'), t('Luftreiniger, Dunstabzug oder Wasserfilter: alle 3 Monate eine Karte.'), t('Filter wechseln'), { type: 'fixed', freq: 'monthly', every: 3 }),
    recurring('bedding', t('Bettwäsche wechseln'), t('Alle 2 Wochen eine Karte.'), t('Bettwäsche wechseln'), { type: 'fixed', freq: 'weekly', every: 2 }),
  ];
}

/**
 * Die Geräte-Vorlagen über die Auslöser, die es schon gibt (Zustand, über, unter). Titel, Karte, Wartezeit und Schwellwert sind
 * Vorbelegungen: der Mensch passt sie im Assistenten an. `done` nur dort, wo der Sensor belegen kann, dass die Aufgabe erledigt ist.
 */
function deviceTemplates(): WatcherTemplate[] {
  const card = (title: string, minutes: number | null = null): TemplateDraft['card'] => ({ title, due: minutes === null ? { kind: 'none' } : { kind: 'in', minutes } });
  const make = (
    id: TemplateId,
    title: string,
    hint: string,
    domain: string,
    search: string,
    trigger: TemplateDraft['trigger'],
    cardTitle: string,
    done: DraftDone | null,
    why: string,
    over: { mode?: AssignMode; due?: number | null } = {},
  ): WatcherTemplate => ({
    id,
    kind: 'watcher',
    title,
    hint,
    domain,
    search,
    draft: { name: title, trigger, card: card(cardTitle, over.due === undefined ? null : over.due), assign: { mode: over.mode ?? 'rotation_present' }, done },
    recurring: null,
    canSelfComplete: done !== null,
    whyNoSelfComplete: done === null ? why : null,
  });
  const NOT_PROVABLE = t('Ein Sensor weiß nicht, ob jemand sich schon darum gekümmert hat.');
  return [
    make(
      'window_open',
      t('Fenster lange offen'),
      t('Fenster-, Tür- oder Garagen-Sensor (binary_sensor). Ist es länger als 30 Minuten offen, entsteht die Karte; sie erledigt sich, sobald es wieder zu ist.'),
      'binary_sensor',
      t('fenster'),
      { kind: 'state', to: 'on', forMin: 30 },
      t('Fenster schließen'),
      { kind: 'state', to: 'off' },
      NOT_PROVABLE,
    ),
    make(
      'fridge_open',
      t('Kühlschranktür offen'),
      t('Türsensor von Kühlschrank oder Gefriertruhe. Nach 5 Minuten offen entsteht die Karte; sie erledigt sich, sobald die Tür zu ist.'),
      'binary_sensor',
      t('kühlschrank'),
      { kind: 'state', to: 'on', forMin: 5 },
      t('Tür zumachen'),
      { kind: 'state', to: 'off' },
      NOT_PROVABLE,
      { mode: 'all_present', due: 0 },
    ),
    make(
      'leak',
      t('Wasserleck'),
      t('Wassersensor (binary_sensor, Geräteklasse moisture). Sobald er Wasser meldet, bekommen alle Anwesenden die Karte.'),
      'binary_sensor',
      t('wasser'),
      { kind: 'state', to: 'on', forMin: 0 },
      t('Leck prüfen und aufwischen'),
      null,
      t('Der Sensor weiß nicht, ob schon aufgewischt ist.'),
      { mode: 'all_present', due: 0 },
    ),
    make(
      'plant',
      t('Pflanze gießen'),
      t('Bodenfeuchte-Sensor einer Pflanze (oder die Entität plant). Fällt die Feuchte unter 20 %, entsteht die Karte; sie erledigt sich, wenn der Boden wieder feucht ist.'),
      'sensor,plant',
      t('pflanze'),
      { kind: 'below', value: 20, forMin: 60 },
      t('Pflanze gießen'),
      { kind: 'above', value: 40 },
      NOT_PROVABLE,
    ),
    make(
      'humid',
      t('Lüften (Feuchte)'),
      t('Luftfeuchte-Sensor eines Raums. Liegt sie 30 Minuten über 65 %, entsteht die Karte; sie erledigt sich, wenn sie unter 55 % fällt.'),
      'sensor',
      t('luftfeuchte'),
      { kind: 'above', value: 65, forMin: 30 },
      t('Lüften'),
      { kind: 'below', value: 55 },
      NOT_PROVABLE,
    ),
    make(
      'co2',
      t('Lüften (CO₂)'),
      t('CO₂-Sensor eines Raums. Liegt er 10 Minuten über 1200 ppm, entsteht die Karte; sie erledigt sich, wenn er unter 800 ppm fällt.'),
      'sensor',
      t('co2'),
      { kind: 'above', value: 1200, forMin: 10 },
      t('Lüften'),
      { kind: 'below', value: 800 },
      NOT_PROVABLE,
    ),
    make(
      'dehumidifier',
      t('Entfeuchter: Tank voll'),
      t('Tank-Sensor des Entfeuchters (binary_sensor). Ist der Tank voll, entsteht die Karte; sie erledigt sich, sobald er wieder leer ist.'),
      'binary_sensor',
      t('entfeuchter tank'),
      { kind: 'state', to: 'on', forMin: 0 },
      t('Tank leeren'),
      { kind: 'state', to: 'off' },
      NOT_PROVABLE,
      { due: 60 },
    ),
    make(
      'robot_error',
      t('Roboter steckt fest'),
      t('Saugroboter oder Mähroboter. Meldet er einen Fehler, entsteht die Karte; sie erledigt sich, sobald er wieder in der Station ist.'),
      'vacuum,lawn_mower',
      '',
      { kind: 'state', to: 'error', forMin: 0 },
      t('Roboter befreien'),
      { kind: 'state', to: 'docked' },
      NOT_PROVABLE,
      { due: 60 },
    ),
    make(
      'filter_life',
      t('Filter verbraucht'),
      t('Sensor mit der Restlaufzeit eines Filters in Prozent. Unter 10 % entsteht die Karte; sie erledigt sich, wenn der Wert nach dem Wechsel wieder hoch ist.'),
      'sensor',
      t('filter'),
      { kind: 'below', value: 10, forMin: 60 },
      t('Filter wechseln'),
      { kind: 'above', value: 50 },
      NOT_PROVABLE,
    ),
    make(
      'toner',
      t('Toner oder Tinte fast leer'),
      t('Füllstand von Toner oder Tinte eines Druckers in Prozent. Unter 15 % entsteht die Karte; sie erledigt sich, wenn die neue Patrone erkannt wird.'),
      'sensor',
      t('toner'),
      { kind: 'below', value: 15, forMin: 60 },
      t('Toner bestellen'),
      { kind: 'above', value: 50 },
      NOT_PROVABLE,
    ),
    make(
      'level',
      t('Füllstand niedrig'),
      t('Füllstand von Pellets, Heizöl, Zisterne oder Futter in Prozent. Unter 20 % entsteht die Karte; sie erledigt sich, wenn der Wert nach dem Auffüllen wieder hoch ist.'),
      'sensor',
      t('füllstand'),
      { kind: 'below', value: 20, forMin: 60 },
      t('Nachbestellen'),
      { kind: 'above', value: 50 },
      NOT_PROVABLE,
    ),
    make(
      'refill',
      t('Nachfüllen oder leeren'),
      t('Meldung eines Geräts (zum Beispiel Home Connect), dass Salz, Klarspüler, Wassertank oder Kaffeesatz-Behälter dran sind. Die Karte erledigt sich, wenn die Meldung wieder weg ist.'),
      'binary_sensor',
      t('salz'),
      { kind: 'state', to: 'on', forMin: 0 },
      t('Nachfüllen oder leeren'),
      { kind: 'state', to: 'off' },
      NOT_PROVABLE,
      { due: 60 },
    ),
    make(
      'litter',
      t('Katzenklo voll'),
      t('Behälter-Sensor eines Katzenklo-Roboters. Meldet er voll, entsteht die Karte; sie erledigt sich, sobald er wieder leer ist.'),
      'binary_sensor',
      t('katzenklo'),
      { kind: 'state', to: 'on', forMin: 0 },
      t('Katzenklo leeren'),
      { kind: 'state', to: 'off' },
      NOT_PROVABLE,
      { due: 60 },
    ),
    make(
      'ev_plug',
      t('E-Auto einstecken'),
      t('Ladestand des Autos in Prozent. Unter 30 % entsteht die Karte; sie erledigt sich, sobald der Ladestand wieder steigt.'),
      'sensor',
      t('auto ladestand'),
      { kind: 'below', value: 30, forMin: 0 },
      t('Auto einstecken'),
      { kind: 'above', value: 35 },
      NOT_PROVABLE,
    ),
    make(
      'mail',
      t('Post im Briefkasten'),
      t('Briefkasten-Sensor (binary_sensor). Meldet er Post, entsteht die Karte.'),
      'binary_sensor',
      t('briefkasten'),
      { kind: 'state', to: 'on', forMin: 0 },
      t('Post holen'),
      null,
      t('Der Sensor weiß nicht, ob die Post schon geholt ist.'),
    ),
    make(
      'garage_lock',
      t('Garage oder Haustür offen'),
      t('Garagentor (cover) oder Türschloss (lock). Steht es länger als 30 Minuten offen oder unverschlossen, entsteht die Karte; sie erledigt sich, sobald es wieder zu ist.'),
      'cover,lock',
      t('garage'),
      { kind: 'state', to: 'open', forMin: 30 },
      t('Garage schließen'),
      { kind: 'state', to: 'closed' },
      NOT_PROVABLE,
    ),
    make(
      'freezer_warm',
      t('Gefriertruhe zu warm'),
      t('Temperatur-Sensor von Gefrierschrank oder -truhe. Über −15 °C entsteht die Karte.'),
      'sensor',
      t('gefrier'),
      { kind: 'above', value: -15, forMin: 30 },
      t('Gefriertruhe prüfen'),
      null,
      t('Eine kalte Truhe heißt nicht, dass jemand nachgesehen hat.'),
      { mode: 'all_present', due: 0 },
    ),
    make(
      'unavailable',
      t('Gerät nicht erreichbar'),
      t('Ein Sensor (Batterie, Strom, Tür, Fenster) meldet „nicht verfügbar“. Nach einer Stunde entsteht die Karte.'),
      'sensor',
      '',
      { kind: 'state', to: 'unavailable', forMin: 60 },
      t('Gerät prüfen'),
      null,
      t('Der Gegenzustand ist kein fester Wert: das Gerät meldet sich einfach wieder.'),
    ),
    make(
      'update',
      t('Update verfügbar'),
      t('Eine Update-Entität von Home Assistant (update). Steht ein Update an, entsteht die Karte; sie erledigt sich, sobald es eingespielt ist.'),
      'update',
      '',
      { kind: 'state', to: 'on', forMin: 0 },
      t('Update einspielen'),
      { kind: 'state', to: 'off' },
      NOT_PROVABLE,
    ),
  ];
}

// ---------- Erkennung ----------

const lower = (s: unknown): string => String(s ?? '').toLowerCase();
const nameOf = (s: HaState): string => String(s.attributes?.friendly_name ?? s.entity_id);
const hay = (s: HaState): string => `${lower(nameOf(s))} ${lower(s.entity_id)}`;

const WORDS: Record<'washer' | 'dryer' | 'dishwasher', RegExp> = {
  washer: /waschmaschine|waschmasch|washing|washer/,
  dryer: /trockner|dryer|tumble/,
  dishwasher: /sp[üu]e?lmaschine|geschirrsp|dishwasher/,
};
/** Zustände, die Geräte-Integrationen (zum Beispiel Home Connect) als Programmstatus melden */
const STATUS_STATES = new Set(['inactive', 'ready', 'delayedstart', 'run', 'running', 'pause', 'paused', 'actionrequired', 'finished', 'finish', 'end', 'ended', 'error', 'aborting', 'standby', 'idle']);
const STATUS_ENTITY = /operation_state|program_phase|programm?_?status|betriebszustand|status/;
// Wörter der neuen Vorlagen (auf dem Text ohne Punkte und Unterstriche, damit \b an Wortgrenzen greift)
const FRIDGE = /k[üu]hlschrank|k[üu]hl|gefrier|fridge|freezer/;
const PLANT = /pflanze|plant|boden|soil/;
const TANK = /tank|wassertank|water tank/;
const DEHUMIDIFIER = /entfeucht|dehumid/;
const TONER = /toner|\bink\b|tinte|cartridge|patrone/;
const LEVEL = /pellet|heiz[öo]l|heizoel|zisterne|cistern|futter|\bfood\b|f[üu]e?llstand|fill level/;
const REFILL = /salz|\bsalt\b|klarsp[üu]l|rinse aid|wassertank|water tank|trester|grounds/;
const LITTER = /katzenklo|litter/;
const LITTER_FULL = /voll|full|drawer|level|schublade/;
const EV = /\bauto\b|\bcar\b|\bev\b|fahrzeug|vehicle/;
const PHONE = /phone|handy|iphone|tablet/;
const MAIL = /briefkasten|mailbox|letterbox|\bpost\b/;
const FREEZER = /gefrier|freezer|tiefk[üu]hl/;
const BIN_WORDS = /m[üu]ll|abfall|tonne|waste|garbage|trash|rubbish|bin\b|bins\b/;

const unitOf = (s: HaState): { unit?: string } => (typeof s.attributes?.unit_of_measurement === 'string' ? { unit: s.attributes.unit_of_measurement } : {});
const norm = (s: string): string => s.replace(/[^a-z]/g, '');
const num = (s: string): number | null => (s !== '' && s !== 'unknown' && s !== 'unavailable' && Number.isFinite(Number(s)) ? Number(s) : null);
/**
 * Schutzgrenze für die ganze Antwort: Neue Umgebungen haben leicht 100 und mehr Treffer, und die Oberfläche zeigt sie alle (nach Vorlage
 * gruppiert). Die Grenze verhindert nur, dass eine Installation mit tausenden Sensoren die Antwort und die Liste sprengt.
 */
export const MAX_SUGGESTIONS = 500;

/**
 * Welche Entitäten passen zu welcher Vorlage? `watched` sind Entitäten, die schon ein Wächter beobachtet; sie fehlen in der Antwort.
 * Kaputte oder fremdartige Zustände (fehlende Attribute) werden übergangen, nie wirft die Erkennung.
 */
/** Schlüssel eines Treffers (Vorlage + Entität), unter dem ein Administrator ihn ausblendet */
export const suggestionKey = (templateId: string, entityId: string): string => `${templateId}:${entityId}`;

export function detectSuggestions(states: HaState[], watched: Set<string>, hidden: Set<string> = new Set(), limit = MAX_SUGGESTIONS): Suggestion[] {
  const out: Hit[] = [];
  /** Ausgeblendete Treffer fehlen schon vor der Schutzgrenze, damit sie keinen Platz belegen */
  const shown = (id: TemplateId, s: HaState): boolean => !hidden.has(suggestionKey(id, s.entity_id));
  const templates = new Map(watcherTemplates().map((tpl) => [tpl.id, tpl]));
  const fresh = states.filter((s) => s && typeof s.entity_id === 'string' && !watched.has(s.entity_id));

  // Geräte: Leistungssensor oder Programmstatus
  for (const id of ['washer', 'dryer', 'dishwasher'] as const) {
    const words = WORDS[id];
    const hits: Hit[] = [];
    for (const s of fresh) {
      const domain = s.entity_id.split('.')[0];
      if (!shown(id, s) || !words.test(hay(s)) || (id === 'washer' && WORDS.dryer.test(hay(s)))) continue;
      if (domain === 'sensor' && s.attributes?.device_class === 'power') {
        hits.push({ templateId: id, entityId: s.entity_id, name: nameOf(s), variant: 'power', ...unitOf(s), reason: t('{name} misst die Leistung', { name: nameOf(s) }) });
      } else if ((domain === 'sensor' || domain === 'select') && STATUS_ENTITY.test(lower(s.entity_id)) && STATUS_STATES.has(norm(lower(s.state)))) {
        const base = templates.get(id)!.draft!;
        hits.push({
          templateId: id,
          entityId: s.entity_id,
          name: nameOf(s),
          variant: 'status',
          reason: t('{name} meldet den Programmstatus', { name: nameOf(s) }),
          draft: { ...base, trigger: { kind: 'state', to: 'finished', forMin: 0 } },
        });
      }
    }
    // der Leistungssensor zuerst: er trifft jedes Gerät
    out.push(...hits.sort((a, b) => (a.variant === b.variant ? 0 : a.variant === 'power' ? -1 : 1)));
  }

  // Abfallkalender
  out.push(
    ...fresh
      .filter((s) => s.entity_id.startsWith('calendar.') && BIN_WORDS.test(hay(s)) && shown('bins', s))
      
      .map((s): Hit => ({ templateId: 'bins', entityId: s.entity_id, name: nameOf(s), variant: 'default', reason: t('{name} ist ein Kalender mit Abfallterminen', { name: nameOf(s) }) })),
  );

  // Wetter
  out.push(
    ...fresh
      .filter((s) => s.entity_id.startsWith('weather.') && shown('rain', s))
      .map((s): Hit => ({ templateId: 'rain', entityId: s.entity_id, name: nameOf(s), variant: 'default', reason: t('{name} liefert eine Wettervorhersage', { name: nameOf(s) }) })),
  );

  // Batterien: die schwächsten zuerst, nur mit Zahlenwert
  out.push(
    ...fresh
      .filter((s) => s.entity_id.startsWith('sensor.') && s.attributes?.device_class === 'battery' && num(s.state) !== null && shown('battery', s))
      .sort((a, b) => num(a.state)! - num(b.state)!)
      
      .map((s): Hit => ({ templateId: 'battery', entityId: s.entity_id, name: nameOf(s), variant: 'default', ...unitOf(s), reason: t('{name}: Batterie bei {n} %', { name: nameOf(s), n: Math.round(num(s.state)!) }) })),
  );

  // Saugroboter
  out.push(
    ...fresh
      .filter((s) => s.entity_id.startsWith('vacuum.') && shown('vacuum', s))
      
      .map((s): Hit => ({ templateId: 'vacuum', entityId: s.entity_id, name: nameOf(s), variant: 'default', reason: t('{name} ist ein Saugroboter', { name: nameOf(s) }) })),
  );

  // Weitere Geräte (siehe deviceTemplates)
  const spoken = (s: HaState): string => hay(s).replace(/[._-]+/g, ' ');
  const klass = (s: HaState): string => lower(s.attributes?.device_class);
  const percent = (s: HaState): boolean => num(s.state) !== null && s.attributes?.unit_of_measurement === '%';
  const over = (id: TemplateId, patch: Partial<TemplateDraft>): TemplateDraft => ({ ...templates.get(id)!.draft!, ...patch });
  type Pick = { reason: string; variant?: Hit['variant']; unit?: string; draft?: TemplateDraft } | null;
  const detect = (id: TemplateId, pick: (s: HaState, text: string, domain: string) => Pick): void => {
    for (const s of fresh) {
      if (!shown(id, s)) continue;
      const r = pick(s, spoken(s), s.entity_id.split('.')[0]!);
      if (!r) continue;
      out.push({ templateId: id, entityId: s.entity_id, name: nameOf(s), variant: r.variant ?? 'default', ...(r.unit ? { unit: r.unit } : {}), reason: r.reason, ...(r.draft ? { draft: r.draft } : {}) });
    }
  };
  const name = nameOf;
  const n0 = (s: HaState): number => Math.round(num(s.state) ?? 0);
  const OPENINGS = new Set(['window', 'door', 'opening', 'garage_door']);

  detect('window_open', (s, text, domain) => (domain === 'binary_sensor' && OPENINGS.has(klass(s)) && !FRIDGE.test(text) ? { reason: t('{name} meldet, ob es offen ist', { name: name(s) }) } : null));
  detect('fridge_open', (s, text, domain) =>
    domain === 'binary_sensor' && ['door', 'opening', 'window'].includes(klass(s)) && FRIDGE.test(text) ? { reason: t('{name} meldet die Tür von Kühlschrank oder Gefriertruhe', { name: name(s) }) } : null,
  );
  detect('leak', (s, _text, domain) => (domain === 'binary_sensor' && klass(s) === 'moisture' ? { reason: t('{name} meldet Wasser', { name: name(s) }) } : null));
  detect('plant', (s, text, domain) => {
    if (domain === 'plant') {
      return { variant: 'status', reason: t('{name} meldet den Zustand der Pflanze', { name: name(s) }), draft: over('plant', { trigger: { kind: 'state', to: 'problem', forMin: 60 }, done: { kind: 'state', to: 'ok' } }) };
    }
    const soil = domain === 'sensor' && num(s.state) !== null && klass(s) !== 'humidity' && (klass(s) === 'moisture' || PLANT.test(text));
    return soil ? { variant: 'level', ...unitOf(s), reason: t('{name} misst die Bodenfeuchte', { name: name(s) }) } : null;
  });
  detect('humid', (s, _text, domain) => (domain === 'sensor' && klass(s) === 'humidity' && num(s.state) !== null ? { ...unitOf(s), reason: t('{name}: Luftfeuchte bei {n} %', { name: name(s), n: n0(s) }) } : null));
  detect('co2', (s, _text, domain) => (domain === 'sensor' && klass(s) === 'carbon_dioxide' && num(s.state) !== null ? { ...unitOf(s), reason: t('{name}: CO₂ bei {n} ppm', { name: name(s), n: n0(s) }) } : null));
  detect('dehumidifier', (s, text, domain) => (domain === 'binary_sensor' && TANK.test(text) && DEHUMIDIFIER.test(text) ? { reason: t('{name} meldet, ob der Tank des Entfeuchters voll ist', { name: name(s) }) } : null));
  detect('robot_error', (s, _text, domain) => (domain === 'vacuum' || domain === 'lawn_mower' ? { reason: t('{name} ist ein Roboter, der stecken bleiben kann', { name: name(s) }) } : null));
  detect('filter_life', (s, text, domain) => (domain === 'sensor' && /filter/.test(text) && percent(s) ? { ...unitOf(s), reason: t('{name}: Filter bei {n} %', { name: name(s), n: n0(s) }) } : null));
  detect('toner', (s, text, domain) => (domain === 'sensor' && TONER.test(text) && percent(s) ? { ...unitOf(s), reason: t('{name}: Füllstand bei {n} %', { name: name(s), n: n0(s) }) } : null));
  detect('level', (s, text, domain) => (domain === 'sensor' && LEVEL.test(text) && !TONER.test(text) && percent(s) ? { ...unitOf(s), reason: t('{name}: Füllstand bei {n} %', { name: name(s), n: n0(s) }) } : null));
  detect('refill', (s, text, domain) => (domain === 'binary_sensor' && REFILL.test(text) && !DEHUMIDIFIER.test(text) ? { reason: t('{name} meldet, wann etwas nachzufüllen oder zu leeren ist', { name: name(s) }) } : null));
  detect('litter', (s, text, domain) => {
    if (!LITTER.test(text) || !LITTER_FULL.test(text)) return null;
    if (domain === 'binary_sensor') return { variant: 'switch', reason: t('{name} meldet, ob das Katzenklo voll ist', { name: name(s) }) };
    if (domain === 'sensor' && percent(s)) {
      return { variant: 'level', ...unitOf(s), reason: t('{name}: Katzenklo zu {n} % voll', { name: name(s), n: n0(s) }), draft: over('litter', { trigger: { kind: 'above', value: 80, forMin: 10 }, done: { kind: 'below', value: 50 } }) };
    }
    return null;
  });
  detect('ev_plug', (s, text, domain) => (domain === 'sensor' && klass(s) === 'battery' && num(s.state) !== null && EV.test(text) && !PHONE.test(text) ? { ...unitOf(s), reason: t('{name}: Ladestand bei {n} %', { name: name(s), n: n0(s) }) } : null));
  detect('mail', (s, text, domain) => (domain === 'binary_sensor' && MAIL.test(text) ? { reason: t('{name} meldet Post im Briefkasten', { name: name(s) }) } : null));
  detect('garage_lock', (s, _text, domain) => {
    if (domain === 'cover' && ['garage', 'gate'].includes(klass(s))) return { variant: 'cover', reason: t('{name} meldet, ob das Garagentor offen ist', { name: name(s) }) };
    if (domain === 'lock') {
      return {
        variant: 'lock',
        reason: t('{name} meldet, ob die Tür abgeschlossen ist', { name: name(s) }),
        draft: over('garage_lock', { trigger: { kind: 'state', to: 'unlocked', forMin: 30 }, card: { title: t('Tür abschließen'), due: { kind: 'none' } }, done: { kind: 'state', to: 'locked' } }),
      };
    }
    return null;
  });
  detect('freezer_warm', (s, text, domain) => (domain === 'sensor' && klass(s) === 'temperature' && num(s.state) !== null && FREEZER.test(text) ? { ...unitOf(s), reason: t('{name}: Temperatur bei {n} °C', { name: name(s), n: n0(s) }) } : null));
  detect('update', (s, _text, domain) => (domain === 'update' ? { reason: t('{name} meldet Updates', { name: name(s) }) } : null));
  // zuletzt: nicht erreichbare Geräte, die nicht schon ein anderer Treffer belegt (eine Batterie ohne Wert zum Beispiel ist dort nie dabei)
  const taken = new Set(out.map((h) => h.entityId));
  detect('unavailable', (s) => (s.state === 'unavailable' && ['battery', 'power', 'door', 'window'].includes(klass(s)) && !taken.has(s.entity_id) ? { reason: t('{name} ist nicht erreichbar', { name: name(s) }) } : null));

  const byId = new Map(fresh.map((s) => [s.entity_id, s]));
  return out.slice(0, limit).map((h) => ({ ...h, label: deviceLabel(byId.get(h.entityId)?.attributes?.friendly_name, h.entityId) }));
}
