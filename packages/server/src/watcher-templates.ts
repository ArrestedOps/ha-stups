import type { HaState } from './ha.js';
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
  | 'bedding';

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
  done: { kind: 'above'; value: number } | null;
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
  /** Welche Fassung der Vorlage passt: Leistung (power) oder Programmstatus des Geräts (status) */
  variant: 'power' | 'status' | 'default';
  /** Ersatz für den Entwurf der Vorlage (beim Programmstatus: Wechsel in „finished") */
  draft?: TemplateDraft;
}

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
      hint: t('Batterie-Sensor eines Geräts. Der Titel nennt das Gerät erst, wenn du ihn anpasst.'),
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
    recurring('descale', t('Entkalken'), t('Kaffeemaschine, Wasserkocher oder Waschmaschine: alle 3 Monate eine Karte.'), t('Entkalken'), { type: 'fixed', freq: 'monthly', every: 3 }),
    recurring('smoke', t('Rauchmelder testen'), t('Alle 6 Monate eine Karte, damit der Test nicht untergeht.'), t('Rauchmelder testen'), { type: 'fixed', freq: 'monthly', every: 6 }),
    recurring('filter', t('Filter wechseln'), t('Luftreiniger, Dunstabzug oder Wasserfilter: alle 3 Monate eine Karte.'), t('Filter wechseln'), { type: 'fixed', freq: 'monthly', every: 3 }),
    recurring('bedding', t('Bettwäsche wechseln'), t('Alle 2 Wochen eine Karte.'), t('Bettwäsche wechseln'), { type: 'fixed', freq: 'weekly', every: 2 }),
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
const BIN_WORDS = /m[üu]ll|abfall|tonne|waste|garbage|trash|rubbish|bin\b|bins\b/;

const unitOf = (s: HaState): { unit?: string } => (typeof s.attributes?.unit_of_measurement === 'string' ? { unit: s.attributes.unit_of_measurement } : {});
const norm = (s: string): string => s.replace(/[^a-z]/g, '');
const num = (s: string): number | null => (s !== '' && s !== 'unknown' && s !== 'unavailable' && Number.isFinite(Number(s)) ? Number(s) : null);
/** Höchstens so viele Treffer je Vorlage, damit eine Liste mit 40 Batteriesensoren nicht alles zuschüttet */
const MAX_PER_TEMPLATE = 5;

/**
 * Welche Entitäten passen zu welcher Vorlage? `watched` sind Entitäten, die schon ein Wächter beobachtet; sie fehlen in der Antwort.
 * Kaputte oder fremdartige Zustände (fehlende Attribute) werden übergangen, nie wirft die Erkennung.
 */
export function detectSuggestions(states: HaState[], watched: Set<string>): Suggestion[] {
  const out: Suggestion[] = [];
  const templates = new Map(watcherTemplates().map((tpl) => [tpl.id, tpl]));
  const fresh = states.filter((s) => s && typeof s.entity_id === 'string' && !watched.has(s.entity_id));

  // Geräte: Leistungssensor oder Programmstatus
  for (const id of ['washer', 'dryer', 'dishwasher'] as const) {
    const words = WORDS[id];
    const hits: Suggestion[] = [];
    for (const s of fresh) {
      const domain = s.entity_id.split('.')[0];
      if (!words.test(hay(s)) || (id === 'washer' && WORDS.dryer.test(hay(s)))) continue;
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
    out.push(...hits.sort((a, b) => (a.variant === b.variant ? 0 : a.variant === 'power' ? -1 : 1)).slice(0, MAX_PER_TEMPLATE));
  }

  // Abfallkalender
  out.push(
    ...fresh
      .filter((s) => s.entity_id.startsWith('calendar.') && BIN_WORDS.test(hay(s)))
      .slice(0, MAX_PER_TEMPLATE)
      .map((s): Suggestion => ({ templateId: 'bins', entityId: s.entity_id, name: nameOf(s), variant: 'default', reason: t('{name} ist ein Kalender mit Abfallterminen', { name: nameOf(s) }) })),
  );

  // Wetter (eine Entität genügt meist)
  out.push(
    ...fresh
      .filter((s) => s.entity_id.startsWith('weather.'))
      .slice(0, 2)
      .map((s): Suggestion => ({ templateId: 'rain', entityId: s.entity_id, name: nameOf(s), variant: 'default', reason: t('{name} liefert eine Wettervorhersage', { name: nameOf(s) }) })),
  );

  // Batterien: die schwächsten zuerst, nur mit Zahlenwert
  out.push(
    ...fresh
      .filter((s) => s.entity_id.startsWith('sensor.') && s.attributes?.device_class === 'battery' && num(s.state) !== null)
      .sort((a, b) => num(a.state)! - num(b.state)!)
      .slice(0, MAX_PER_TEMPLATE)
      .map((s): Suggestion => ({ templateId: 'battery', entityId: s.entity_id, name: nameOf(s), variant: 'default', ...unitOf(s), reason: t('{name}: Batterie bei {n} %', { name: nameOf(s), n: Math.round(num(s.state)!) }) })),
  );

  // Saugroboter
  out.push(
    ...fresh
      .filter((s) => s.entity_id.startsWith('vacuum.'))
      .slice(0, MAX_PER_TEMPLATE)
      .map((s): Suggestion => ({ templateId: 'vacuum', entityId: s.entity_id, name: nameOf(s), variant: 'default', reason: t('{name} ist ein Saugroboter', { name: nameOf(s) }) })),
  );

  return out;
}
