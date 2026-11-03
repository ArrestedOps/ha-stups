import { t, tn } from './i18n/index.svelte';
import { clock } from './nudge';
import type { AssignMode, ConditionKind, DueRule, HaEntity, TemplateDraft, TriggerKind, WatcherInput, WatcherItem, WatcherTemplate } from './watcher-types';

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
  doneKind: ConditionKind;
  doneTo: string;
  doneValue: string;
  cooldownMin: string;
  dedupe: boolean;
  nudgeAfterMin: string;
  /** Kalender: so viele Stunden vor dem Termin entsteht die Karte */
  leadHours: string;
  /** Vorhersage: Regen in den nächsten so vielen Stunden */
  forecastHours: string;
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
  leadHours: '12',
  forecastHours: '3',
});

// ---------- Vorlagen (vom Server) ----------

/**
 * Wendet eine Vorlage des Servers auf das Formular an. Mit einem Treffer aus „Gefunden" (`hit`) steht auch die Entität schon drin;
 * sonst wählt man sie danach in der Suche. Der Mensch kann alles ändern.
 */
export function applyTemplate(f: WatcherForm, tpl: WatcherTemplate, hit?: { entityId: string; name: string; draft?: TemplateDraft }): WatcherForm {
  const d = hit?.draft ?? tpl.draft;
  if (!d) return f;
  const out: WatcherForm = {
    ...f,
    name: d.name,
    title: d.card.title,
    dueKind: d.card.due.kind,
    dueMinutes: d.card.due.kind === 'in' ? String(d.card.due.minutes) : '30',
    dueDay: d.card.due.kind === 'at' ? d.card.due.day : 'tomorrow',
    dueTime: d.card.due.kind === 'at' ? d.card.due.time : '08:00',
    assignMode: d.assign.mode,
    kind: d.trigger.kind,
    count: 'count' in d.trigger && d.trigger.count && d.trigger.count > 1 ? String(d.trigger.count) : '',
    forMin: 'forMin' in d.trigger ? String(d.trigger.forMin) : '',
    doneOn: false,
  };
  if (d.trigger.kind === 'below' || d.trigger.kind === 'above') out.value = String(d.trigger.value);
  if (d.trigger.kind === 'state') out.to = d.trigger.to;
  if (d.trigger.kind === 'calendar_event') out.leadHours = String(Math.round(d.trigger.leadMin / 60));
  if (d.trigger.kind === 'forecast') out.forecastHours = String(d.trigger.hours);
  if (hit) {
    out.entityId = hit.entityId;
    out.entityName = hit.name;
  }
  // ein Sensor, der das Erledigen belegen kann (Batterie wieder voll): die Karte erledigt sich von selbst
  if (d.done && hit) {
    out.doneOn = true;
    out.doneEntityId = hit.entityId;
    out.doneEntityName = hit.name;
    out.doneKind = d.done.kind;
    out.doneValue = String(d.done.value);
  }
  return out;
}

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
  if ((f.kind === 'above' || f.kind === 'below') && num(f.value) === null) return t('Gib den Schwellwert als Zahl an.');
  if (f.kind === 'calendar_event' && intOr(f.leadHours, -1) < 0) return t('Gib an, wie viele Stunden vor dem Termin die Karte entstehen soll.');
  if (f.kind === 'forecast' && intOr(f.forecastHours, 0) < 1) return t('Gib an, für wie viele Stunden im Voraus nach Regen geschaut werden soll.');
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
    trigger:
      f.kind === 'calendar_event'
        ? { entityId: f.entityId, kind: 'calendar_event', to: null, value: null, forMin: 0, count: 1, leadMin: Math.max(0, intOr(f.leadHours, 12)) * 60 }
        : f.kind === 'forecast'
          ? { entityId: f.entityId, kind: 'forecast', to: null, value: null, forMin: 0, count: 1, forecast: { condition: 'rain', hours: Math.max(1, intOr(f.forecastHours, 3)) } }
          : {
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
    leadHours: w.trigger.leadMin !== undefined ? String(Math.round(w.trigger.leadMin / 60)) : '12',
    forecastHours: w.trigger.forecast ? String(w.trigger.forecast.hours) : '3',
  };
}

// ---------- Texte ----------

const forMinutes = (min: number) => (min <= 0 ? '' : tn('{n} Minute', '{n} Minuten', min));

/** Die Bedingung in einem Halbsatz: „Waschmaschine Leistung 3 Minuten unter 5 W liegt" */
export function conditionText(f: Pick<WatcherForm, 'entityName' | 'entityId' | 'entityUnit' | 'kind' | 'to' | 'value' | 'forMin'>): string {
  const who = f.entityName || f.entityId || '…';
  if (f.kind === 'calendar_event') return t('im Kalender {who} {hours} vor einem Termin ansteht', { who, hours: tn('{n} Stunde', '{n} Stunden', intOr(f.leadHours, 12)) });
  if (f.kind === 'forecast') return t('{who} in den nächsten {hours} Regen vorhersagt', { who, hours: tn('{n} Stunde', '{n} Stunden', intOr(f.forecastHours, 3)) });
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
    suggest: t('fragt Stups alle Anwesenden, wer {card} übernimmt', { card }),
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

/**
 * Die Notizen der Läufe stehen als deutscher Text in der Datenbank (so waren sie schon immer, auch in alten Läufen).
 * Hier erscheinen die bekannten in der Sprache der Oberfläche; alles andere (etwa Fehlertexte) bleibt, wie es ist.
 */
export function noteText(note: string | null | undefined): string {
  if (!note) return '';
  const fixed: Record<string, () => string> = {
    'erledigt, weil die Bedingung eingetreten ist': () => t('erledigt, weil die Bedingung eingetreten ist'),
    'erste Person zu Hause': () => t('erste Person zu Hause'),
    'kurz danach auch zu Hause': () => t('kurz danach auch zu Hause'),
    'nach 24 Stunden niemand heimgekommen': () => t('nach 24 Stunden niemand heimgekommen'),
    'Die Spalte gibt es nicht mehr': () => t('Die Spalte gibt es nicht mehr'),
    Test: () => t('Test'),
  };
  const f = fixed[note];
  if (f) return f();
  let m = /^Sperrzeit (\d+) Min\.$/.exec(note);
  if (m) return t('Sperrzeit {n} Min.', { n: m[1]! });
  m = /^(\d+) von (\d+)$/.exec(note);
  if (m) return t('{n} von {total}', { n: m[1]!, total: m[2]! });
  m = /^(\d+) Auslösungen seit dem letzten Zurücksetzen$/.exec(note);
  if (m) return t('{n} Auslösungen seit dem letzten Zurücksetzen', { n: m[1]! });
  m = /^nach (\d+) Min\.$/.exec(note);
  if (m) return t('nach {n} Min.', { n: m[1]! });
  return note;
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
  get passed() {
    return t('Weitergegeben');
  },
  get suggested() {
    return t('Gefragt, wer übernimmt');
  },
  get claimed() {
    return t('Übernommen');
  },
  get suggest_fallback() {
    return t('Niemand hat sich gemeldet, der Rückfall greift');
  },
};

// ---------- Der Satz ----------

/** Ein Stück des Satzes: Text, oder ein antippbares Feld (`field`) */
export interface SentencePart {
  text: string;
  field?: 'entity' | 'duration' | 'threshold' | 'lead' | 'hours' | 'who' | 'title';
}

/** Wer die Karte bekommt, als Halbsatz für das Feld im Satz */
export function whoText(f: Pick<WatcherForm, 'assignMode' | 'personIds'>, personName: (id: string) => string): string {
  const names = f.personIds.map(personName).join(', ');
  switch (f.assignMode) {
    case 'rotation_present':
      return t('wer zu Hause ist, reihum');
    case 'all_present':
      return t('jede Person, die zu Hause ist');
    case 'first_home':
      return t('wer zuerst nach Hause kommt');
    case 'rotation':
      return names ? t('reihum {names}', { names }) : t('reihum jemand');
    case 'fixed':
      return names || t('niemand gewählt');
    case 'suggest':
      return t('wer sich meldet');
    default:
      return t('niemand');
  }
}

/**
 * Der Satz, den das Formular zeigt: „Wenn [Entität] länger als [3 Min.] unter [5 W] liegt, bekommt [wer zu Hause ist, reihum] die Karte [Titel]."
 * Die Felder in eckigen Klammern sind antippbar. Der Satz wird als Ganzes übersetzt (Wortstellung!) und dann an den Platzhaltern zerlegt.
 */
export function sentenceParts(f: WatcherForm, personName: (id: string) => string): SentencePart[] {
  const minutes = intOr(f.forMin, f.kind === 'state' ? 0 : 3);
  const entity = f.entityName || f.entityId || t('Entität wählen');
  const unit = f.entityUnit ? ` ${f.entityUnit}` : '';
  const threshold = f.kind === 'state' ? f.to.trim() || '…' : `${f.value.trim() || '…'}${unit}`;
  const duration = t('{n} Min.', { n: minutes });
  let template: string;
  if (f.kind === 'calendar_event') template = t('Wenn im Kalender {entity} {lead} vor einem Termin ansteht, bekommt {who} die Karte {title}.');
  else if (f.kind === 'forecast') template = t('Wenn {entity} in den nächsten {hours} Regen vorhersagt, bekommt {who} die Karte {title}.');
  else if (f.kind === 'state') template = minutes > 0 ? t('Wenn {entity} länger als {duration} auf {threshold} steht, bekommt {who} die Karte {title}.') : t('Wenn {entity} zu {threshold} wechselt, bekommt {who} die Karte {title}.');
  else if (f.kind === 'below') template = minutes > 0 ? t('Wenn {entity} länger als {duration} unter {threshold} liegt, bekommt {who} die Karte {title}.') : t('Wenn {entity} unter {threshold} liegt, bekommt {who} die Karte {title}.');
  else template = minutes > 0 ? t('Wenn {entity} länger als {duration} über {threshold} liegt, bekommt {who} die Karte {title}.') : t('Wenn {entity} über {threshold} liegt, bekommt {who} die Karte {title}.');
  const fields: Record<string, SentencePart> = {
    '{entity}': { text: entity, field: 'entity' },
    '{duration}': { text: duration, field: 'duration' },
    '{threshold}': { text: threshold, field: 'threshold' },
    '{lead}': { text: tn('{n} Stunde', '{n} Stunden', intOr(f.leadHours, 12)), field: 'lead' },
    '{hours}': { text: tn('{n} Stunde', '{n} Stunden', intOr(f.forecastHours, 3)), field: 'hours' },
    '{who}': { text: whoText(f, personName), field: 'who' },
    '{title}': { text: f.title.trim() || t('Titel wählen'), field: 'title' },
  };
  return template
    .split(/(\{[a-z]+\})/)
    .filter((x) => x !== '')
    .map((x) => fields[x] ?? { text: x });
}
