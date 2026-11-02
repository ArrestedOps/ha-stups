import { t, tn } from './i18n/index.svelte';
import { clock } from './nudge';
import type { AssignMode, DueRule, HaEntity, TriggerKind, WatcherInput, WatcherItem } from './watcher-types';

/** Das Formular im Sheet: alles als Text, damit Eingaben unfertig sein dürfen; toInput prüft und wandelt um */
export interface WatcherForm {
  id: string | null;
  name: string;
  active: boolean;
  entityId: string;
  entityName: string;
  entityUnit: string;
  kind: TriggerKind;
  to: string;
  value: string;
  forMin: string;
  count: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  categoryIds: string[];
  priority: '' | 'high';
  dueKind: 'none' | 'in' | 'at';
  dueMinutes: string;
  dueDay: 'today' | 'tomorrow';
  dueTime: string;
  assignMode: AssignMode;
  personIds: string[];
  fallback: 'next' | 'all' | 'none' | 'fixed';
  waitFallback: 'all' | 'none' | 'fixed';
  fallbackPersonId: string;
  doneOn: boolean;
  doneEntityId: string;
  doneEntityName: string;
  doneKind: TriggerKind;
  doneTo: string;
  doneValue: string;
  cooldownMin: string;
  dedupe: boolean;
  nudgeAfterMin: string;
}

export const emptyForm = (boardId = '', columnId = ''): WatcherForm => ({
  id: null,
  name: '',
  active: true,
  entityId: '',
  entityName: '',
  entityUnit: '',
  kind: 'below',
  to: '',
  value: '',
  forMin: '',
  count: '',
  boardId,
  columnId,
  title: '',
  description: '',
  categoryIds: [],
  priority: '',
  dueKind: 'none',
  dueMinutes: '30',
  dueDay: 'tomorrow',
  dueTime: '08:00',
  assignMode: 'rotation_present',
  personIds: [],
  fallback: 'next',
  waitFallback: 'none',
  fallbackPersonId: '',
  doneOn: false,
  doneEntityId: '',
  doneEntityName: '',
  doneKind: 'state',
  doneTo: '',
  doneValue: '',
  cooldownMin: '',
  dedupe: true,
  nudgeAfterMin: '',
});

// ---------- Vorlagen ----------

export interface WatcherTemplate {
  id: string;
  title: string;
  /** Hilfe unter dem Titel */
  hint: string;
  /** Art der Entitäten für die Suche (domain), Suchwort für den Vorschlag */
  domain: string;
  search: string;
  apply: (f: WatcherForm) => WatcherForm;
}

const base = (f: WatcherForm, over: Partial<WatcherForm>): WatcherForm => ({ ...f, ...over });

export const TEMPLATES: WatcherTemplate[] = [
  {
    id: 'washer',
    get title() {
      return t('Waschmaschine fertig');
    },
    get hint() {
      return t('Leistungs-Sensor, der nach dem Waschen unter einen kleinen Wert fällt. Hängen Waschmaschine und Trockner an einer Steckdose, hilft nur ein eigener Sensor je Gerät.');
    },
    domain: 'sensor',
    get search() {
      return t('waschmaschine leistung');
    },
    apply: (f) =>
      base(f, { name: t('Waschmaschine fertig'), kind: 'below', value: '5', forMin: '3', title: t('Waschmaschine ausräumen'), dueKind: 'in', dueMinutes: '30', assignMode: 'rotation_present' }),
  },
  {
    id: 'dishwasher',
    get title() {
      return t('Spülmaschine fertig');
    },
    get hint() {
      return t('Leistungs-Sensor, der nach dem Spülen unter einen kleinen Wert fällt.');
    },
    domain: 'sensor',
    get search() {
      return t('spülmaschine leistung');
    },
    apply: (f) =>
      base(f, { name: t('Spülmaschine fertig'), kind: 'below', value: '5', forMin: '3', title: t('Spülmaschine ausräumen'), dueKind: 'in', dueMinutes: '30', assignMode: 'rotation_present' }),
  },
  {
    id: 'dryer',
    get title() {
      return t('Trockner fertig');
    },
    get hint() {
      return t('Leistungs-Sensor, der nach dem Trocknen unter einen kleinen Wert fällt.');
    },
    domain: 'sensor',
    get search() {
      return t('trockner leistung');
    },
    apply: (f) =>
      base(f, { name: t('Trockner fertig'), kind: 'below', value: '5', forMin: '3', title: t('Wäsche aus dem Trockner holen'), dueKind: 'in', dueMinutes: '30', assignMode: 'rotation_present' }),
  },
  {
    id: 'filter',
    get title() {
      return t('Filter oder Verbrauchsmaterial niedrig');
    },
    get hint() {
      return t('Sensor mit der Restmenge in Prozent, zum Beispiel beim Luftreiniger.');
    },
    domain: 'sensor',
    get search() {
      return t('filter');
    },
    apply: (f) =>
      base(f, { name: t('Filter niedrig'), kind: 'below', value: '10', forMin: '5', title: t('Filter wechseln'), dueKind: 'none', assignMode: 'rotation_present' }),
  },
  {
    id: 'battery',
    get title() {
      return t('Batterie schwach');
    },
    get hint() {
      return t('Batterie-Sensor eines Geräts. Der Titel nennt das Gerät erst, wenn du ihn anpasst.');
    },
    domain: 'sensor',
    get search() {
      return t('batterie');
    },
    apply: (f) =>
      base(f, { name: t('Batterie schwach'), kind: 'below', value: '15', forMin: '10', title: t('Batterie wechseln'), dueKind: 'none', assignMode: 'rotation_present' }),
  },
  {
    id: 'vacuum',
    get title() {
      return t('Saugroboter: Behälter leeren');
    },
    get hint() {
      return t('Staubsaugerroboter (vacuum). Nach 3 Reinigungen entsteht die Karte; wer zuerst nach Hause kommt, bekommt sie. Wird die Karte erledigt, beginnt die Zählung von vorn.');
    },
    domain: 'vacuum',
    search: '',
    apply: (f) =>
      base(f, { name: t('Saugroboter: Behälter leeren'), kind: 'state', to: 'docked', forMin: '0', count: '3', title: t('Staubbehälter leeren'), dueKind: 'none', assignMode: 'first_home' }),
  },
];

// ---------- Formular ↔ Server ----------

const num = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const intOr = (s: string, fallback: number): number => {
  const n = num(s);
  return n === null ? fallback : Math.round(n);
};

/** Fehlermeldung, wenn das Formular noch nicht gespeichert werden kann, sonst null */
export function formProblem(f: WatcherForm): string | null {
  if (!f.name.trim()) return t('Gib dem Wächter einen Namen.');
  if (!f.entityId) return t('Wähle die Entität, die beobachtet werden soll.');
  if (f.kind === 'state' && !f.to.trim()) return t('Gib den Zustand an, in den die Entität wechseln soll.');
  if (f.kind !== 'state' && num(f.value) === null) return t('Gib den Schwellwert als Zahl an.');
  if (!f.title.trim()) return t('Gib der Karte einen Titel.');
  if (!f.boardId || !f.columnId) return t('Wähle Board und Spalte für die Karte.');
  if (f.dueKind === 'in' && intOr(f.dueMinutes, -1) < 0) return t('Gib die Minuten bis zur Fälligkeit an.');
  if ((f.assignMode === 'fixed') && f.personIds.length === 0) return t('Wähle mindestens eine Person.');
  if ((f.fallback === 'fixed' || f.waitFallback === 'fixed') && !f.fallbackPersonId) return t('Wähle die Person für den Rückfall.');
  if (f.doneOn) {
    if (!f.doneEntityId) return t('Wähle die Entität, bei der sich die Karte von selbst erledigt.');
    if (f.doneKind === 'state' && !f.doneTo.trim()) return t('Gib den Zustand zum Erledigen an.');
    if (f.doneKind !== 'state' && num(f.doneValue) === null) return t('Gib den Schwellwert zum Erledigen an.');
  }
  return null;
}

const dueOf = (f: WatcherForm): DueRule =>
  f.dueKind === 'in'
    ? { kind: 'in', minutes: intOr(f.dueMinutes, 0) }
    : f.dueKind === 'at'
      ? { kind: 'at', day: f.dueDay, time: f.dueTime }
      : { kind: 'none' };

/** Formular → Eingabe für den Server (der Server prüft noch einmal) */
export function toInput(f: WatcherForm): WatcherInput {
  return {
    name: f.name.trim(),
    active: f.active,
    trigger: {
      entityId: f.entityId,
      kind: f.kind,
      to: f.kind === 'state' ? f.to.trim() : null,
      value: f.kind === 'state' ? null : num(f.value),
      forMin: intOr(f.forMin, f.kind === 'state' ? 0 : 3),
      count: Math.max(1, intOr(f.count, 1)),
    },
    card: {
      boardId: f.boardId,
      columnId: f.columnId,
      title: f.title.trim(),
      description: f.description.trim() || null,
      categoryIds: f.categoryIds,
      priority: f.priority || null,
      due: dueOf(f),
    },
    assign: {
      mode: f.assignMode,
      personIds: f.personIds,
      fallback: f.fallback,
      waitFallback: f.waitFallback,
      fallbackPersonId: f.fallbackPersonId || null,
    },
    done: f.doneOn
      ? { entityId: f.doneEntityId, kind: f.doneKind, to: f.doneKind === 'state' ? f.doneTo.trim() : null, value: f.doneKind === 'state' ? null : num(f.doneValue) }
      : null,
    cooldownMin: intOr(f.cooldownMin, 10),
    dedupe: f.dedupe,
    nudgeAfterMin: num(f.nudgeAfterMin) === null ? null : intOr(f.nudgeAfterMin, 60),
  };
}

/** Wächter vom Server → Formular zum Bearbeiten */
export function fromWatcher(w: WatcherItem, entities: Map<string, HaEntity> = new Map()): WatcherForm {
  const e = entities.get(w.trigger.entityId);
  const d = w.done ? entities.get(w.done.entityId) : undefined;
  const s = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));
  return {
    id: w.id,
    name: w.name,
    active: w.active,
    entityId: w.trigger.entityId,
    entityName: e?.name ?? w.trigger.entityId,
    entityUnit: e?.unit ?? '',
    kind: w.trigger.kind,
    to: w.trigger.to ?? '',
    value: s(w.trigger.value),
    forMin: String(w.trigger.forMin),
    count: w.trigger.count > 1 ? String(w.trigger.count) : '',
    boardId: w.card.boardId,
    columnId: w.card.columnId,
    title: w.card.title,
    description: w.card.description ?? '',
    categoryIds: w.card.categoryIds,
    priority: w.card.priority === 'high' ? 'high' : '',
    dueKind: w.card.due.kind,
    dueMinutes: w.card.due.kind === 'in' ? String(w.card.due.minutes) : '30',
    dueDay: w.card.due.kind === 'at' ? w.card.due.day : 'tomorrow',
    dueTime: w.card.due.kind === 'at' ? w.card.due.time : '08:00',
    assignMode: w.assign.mode,
    personIds: w.assign.personIds,
    fallback: w.assign.fallback,
    waitFallback: w.assign.waitFallback,
    fallbackPersonId: w.assign.fallbackPersonId ?? '',
    doneOn: w.done !== null,
    doneEntityId: w.done?.entityId ?? '',
    doneEntityName: d?.name ?? w.done?.entityId ?? '',
    doneKind: w.done?.kind ?? 'state',
    doneTo: w.done?.to ?? '',
    doneValue: s(w.done?.value ?? null),
    cooldownMin: String(w.cooldownMin),
    dedupe: w.dedupe,
    nudgeAfterMin: w.nudgeAfterMin === null ? '' : String(w.nudgeAfterMin),
  };
}

// ---------- Texte ----------

const forMinutes = (min: number) => (min <= 0 ? '' : tn('{n} Minute', '{n} Minuten', min));

/** Die Bedingung in einem Halbsatz: „Waschmaschine Leistung 3 Minuten unter 5 W liegt" */
export function conditionText(f: Pick<WatcherForm, 'entityName' | 'entityId' | 'entityUnit' | 'kind' | 'to' | 'value' | 'forMin'>): string {
  const who = f.entityName || f.entityId || '…';
  const minutes = forMinutes(intOr(f.forMin, f.kind === 'state' ? 0 : 3));
  if (f.kind === 'state') {
    const to = f.to.trim() || '…';
    return minutes ? t('{who} {minutes} lang auf „{to}“ steht', { who, minutes, to }) : t('{who} zu „{to}“ wechselt', { who, to });
  }
  const v = `${f.value.trim() || '…'}${f.entityUnit ? ` ${f.entityUnit}` : ''}`;
  if (f.kind === 'below') return minutes ? t('{who} {minutes} unter {v} liegt', { who, minutes, v }) : t('{who} unter {v} liegt', { who, v });
  return minutes ? t('{who} {minutes} über {v} liegt', { who, minutes, v }) : t('{who} über {v} liegt', { who, v });
}

/** Vorschau in einem Satz oben im Sheet */
export function previewSentence(f: WatcherForm, personName: (id: string) => string): string {
  const names = f.personIds.map(personName).join(', ') || t('niemand');
  const count = intOr(f.count, 1);
  const when = `${conditionText(f)}${count > 1 ? t(' (beim {n}. Mal)', { n: count }) : ''}`;
  const card = t('die Karte „{title}“', { title: f.title.trim() || '…' });
  const who: Record<AssignMode, string> = {
    none: t('entsteht {card} ohne Zuständige', { card }),
    fixed: t('bekommt {names} {card}', { names, card }),
    rotation: t('bekommt abwechselnd {names} {card}', { names, card }),
    rotation_present: t('bekommt eine anwesende Person abwechselnd {card}', { card }),
    all_present: t('bekommen alle Anwesenden {card}', { card }),
    first_home: t('bekommt die Person, die als Erstes nach Hause kommt, {card}', { card }),
  };
  const due =
    f.dueKind === 'in'
      ? t(' (fällig in {n} Min.)', { n: intOr(f.dueMinutes, 0) })
      : f.dueKind === 'at'
        ? t(' (fällig {day} {time})', { day: f.dueDay === 'today' ? t('heute') : t('morgen'), time: f.dueTime })
        : '';
  return t('Wenn {when}, {who}{due}.', { when, who: who[f.assignMode], due });
}

/** Zeile unter dem Namen in der Liste: letzter Lauf, Zählerstand, Probleme */
export function watcherLine(w: WatcherItem, personName: (id: string) => string, tz?: string, withCounter = true): string {
  if (w.status === 'target_missing') return t('Pausiert: Board oder Spalte gibt es nicht mehr');
  if (w.status === 'entity_missing') return t('Entität fehlt in Home Assistant');
  const parts: string[] = [];
  if (withCounter && w.trigger.count > 1) parts.push(t('{n} von {total}', { n: w.counter, total: w.trigger.count }));
  if (w.lastFiredAt) {
    const who = w.lastAssignees.map(personName).join(', ');
    parts.push(`${t('Zuletzt {time} Uhr', { time: clock(w.lastFiredAt, tz) })}${who ? ` → ${who}` : ''}`);
  } else {
    parts.push(t('Noch nicht ausgelöst'));
  }
  return parts.join(' · ');
}

export const RUN_TEXT: Record<string, string> = {
  get created() {
    return t('Karte angelegt');
  },
  get retriggered() {
    return t('Erneut ausgelöst, die Karte war noch offen');
  },
  get counted() {
    return t('Gezählt');
  },
  get cooldown() {
    return t('Übersprungen: Sperrzeit');
  },
  get waiting() {
    return t('Karte wartet auf die erste Heimkehr');
  },
  get assigned() {
    return t('Zugewiesen');
  },
  get auto_done() {
    return t('Automatisch erledigt');
  },
  get nudged() {
    return t('Erinnert, weil die Karte noch offen war');
  },
  get test() {
    return t('Test');
  },
  get error() {
    return t('Fehler');
  },
};
