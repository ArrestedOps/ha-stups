import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import { detectLinkKind, normalizeUrl, type LinkKind } from './links.js';
import { DEFAULT_QUIET, isHm, quietEnd, type QuietWindow } from './quiet.js';
import { nextDue, type Recurrence } from './recurrence.js';
import { startOfTomorrow } from './time.js';

export type Priority = 'low' | 'medium' | 'high';

export interface User {
  id: string;
  haUserId: string | null;
  name: string;
  displayName: string;
  isPerson: boolean;
  color: string | null;
  /** Notify-Dienste der Companion App, ohne „notify." davor */
  notifyServices: string[];
  /** Ruhezeit für Stupse */
  nudgeQuiet: QuietWindow;
}

export type NudgeTemplate = 'think' | 'today' | 'help' | 'thanks';

/** Die Schnellauswahl im Stups-Sheet */
export const NUDGE_TEMPLATES: Record<NudgeTemplate, string> = {
  think: 'Denkst du dran?',
  today: 'Heute noch?',
  help: 'Brauch deine Hilfe',
  thanks: 'Danke dir! ❤️',
};

export const NUDGE_TEXT_MAX = 120;
/** Zwischen zwei Stupsen derselben Person an dieselbe Person zur selben Karte */
export const NUDGE_COOLDOWN_MS = 30 * 60_000;
export const NUDGE_LATER_MS = 60 * 60_000;
export const NUDGE_LATER_MAX = 3;

export type NudgeReply = 'ack' | 'done' | 'closed';

export interface Nudge {
  id: string;
  cardId: string;
  fromId: string;
  toId: string;
  template: NudgeTemplate | null;
  text: string;
  createdAt: string;
  deliverAt: string;
  deliveredAt: string | null;
  deliveredRound: number;
  laterCount: number;
  reply: NudgeReply | null;
  replyAt: string | null;
}

/** Offener Stups an der Karte (für Abzeichen und Filter) */
export interface OpenNudge {
  id: string;
  fromId: string;
  toId: string;
  /** schon als Push zugestellt */
  delivered: boolean;
}

export interface NudgeSent {
  nudgeId: string;
  to: string;
  /** sent = sofort, queued = wartet auf das Ende der Ruhezeit */
  status: 'sent' | 'queued';
  deliverAt: string;
}

export type NudgeSkipReason = 'self' | 'no_person' | 'no_device' | 'rate';

export interface NudgeSkipped {
  to: string;
  reason: NudgeSkipReason;
  retryAt: string | null;
}

export interface NudgeTarget {
  id: string;
  name: string;
  color: string | null;
  selectable: boolean;
  reason: 'no_device' | 'rate' | null;
  /** ab wann wieder gestupst werden darf */
  retryAt: string | null;
  /** bei Ruhezeit: wann zugestellt wird, sonst null (sofort) */
  deliverAt: string | null;
  preselected: boolean;
}

export interface DueNudge {
  id: string;
  cardId: string;
  cardTitle: string;
  fromId: string;
  fromName: string;
  toId: string;
  text: string;
  /** 0 = erste Zustellung, 1 bis 3 = nach „Später" */
  round: number;
  laterCount: number;
}

/** Ein durch Erledigen geschlossener Stups: Der Absender bekommt „… hat erledigt ✓" */
export interface ClosedNudge {
  nudgeId: string;
  cardId: string;
  cardTitle: string;
  fromId: string;
  toId: string;
  /** wer die Karte erledigt hat (null = unbekannt) */
  byId: string | null;
}

export interface RecentNudge {
  title: string;
  from: string;
  to: string;
  at: string;
  deliverAt: string;
  state: 'wartet' | 'offen' | 'beantwortet' | 'geschlossen';
}

export type AccessMode = 'everyone' | 'selected';

export interface Board {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  position: string;
  archiveAfterDays: number;
}

export interface BoardSummary extends Board {
  openCards: number;
}

export interface Column {
  id: string;
  boardId: string;
  name: string;
  position: string;
  isDone: boolean;
  /** Nur Karten mit Termin nach heute; rücken am Tag der Fälligkeit nach „Offen" */
  isPlanned: boolean;
}

export interface Category {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: string;
}

export type { Recurrence };

export type CompletionSource = 'app' | 'push';

export interface Completion {
  id: string;
  cardId: string;
  completedBy: string | null;
  completedByName: string | null;
  completedAt: string;
  dueAt: string | null;
  source: CompletionSource;
}

export interface CompleteResult {
  card: CardDetail;
  /** null, wenn die Karte schon erledigt war (nichts wurde protokolliert) */
  completionId: string | null;
  /** nur bei wiederkehrenden Karten */
  nextDueAt: string | null;
  /** die neue Karte, die bei einer wiederkehrenden Karte angelegt wurde */
  nextCardId: string | null;
}

/** Felder, die eine wiederkehrende Karte auf Wunsch in die nächste Karte mitnimmt */
export type CarryField = 'description' | 'checklist' | 'links' | 'cost' | 'attachments' | 'comments';

export const CARRY_FIELDS: readonly CarryField[] = ['description', 'checklist', 'links', 'cost', 'attachments', 'comments'];

/** Ohne eigene Auswahl: Fotos und Kommentare gehören meist zu genau einem Durchgang und bleiben bei der erledigten Karte */
export const DEFAULT_CARRY: readonly CarryField[] = ['description', 'checklist', 'links', 'cost'];

export interface Card {
  id: string;
  boardId: string;
  columnId: string;
  position: string;
  title: string;
  description: string | null;
  priority: Priority | null;
  dueAt: string | null;
  recurrence: Recurrence | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Vorab-Erinnerung in Minuten vor der Fälligkeit */
  remindBeforeMin: number | null;
  /** täglich nachhaken, solange überfällig */
  overdueNag: boolean;
  costCents: number | null;
  /** Was die nächste Karte übernimmt, wenn diese sich wiederholt */
  carryOver: CarryField[];
  /** offene Stupse zu dieser Karte */
  openNudges: OpenNudge[];
  /** Karte, aus deren Wiederholung diese entstanden ist */
  repeatedFrom: string | null;
  /** Wächter, aus dem die Karte entstanden ist */
  watcherId: string | null;
  assigneeIds: string[];
  categoryIds: string[];
  checklist: { done: number; total: number };
  linkCount: number;
  commentCount: number;
  attachmentCount: number;
}

/** Karte mit Termin samt Board, für Agenda und Kalender */
export interface ScheduleCard extends Card {
  boardName: string;
  boardColor: string | null;
}

export interface Attachment {
  id: string;
  cardId: string;
  filename: string;
  mime: string;
  size: number;
  hasThumb: boolean;
  createdBy: string | null;
  createdAt: string;
}

/** Interne Sicht mit den Dateinamen im Speicher, nie an Clients ausliefern */
export interface StoredAttachment extends Attachment {
  file: string;
  thumb: string | null;
}

export interface Comment {
  id: string;
  cardId: string;
  authorId: string | null;
  authorName: string | null;
  text: string;
  createdAt: string;
  editedAt: string | null;
}

export interface Settings {
  /** Ziel des „Zurück zum Dashboard"-Buttons, null = Vorgabe aus den Add-on-Optionen */
  dashboardPath: string | null;
  /** Pfad des Stups-Panels in HA, vom Client gemeldet (für Links in Push-Nachrichten) */
  panelPath: string | null;
}

export interface OpenDueCard {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  dueAt: string;
  remindBeforeMin: number | null;
  overdueNag: boolean;
  assigneeIds: string[];
}

export type NotificationKind = 'due' | 'reminder' | 'nag' | 'summary';

export interface RecentNotification {
  kind: NotificationKind;
  status: 'sent' | 'skipped' | 'failed';
  at: string;
  title: string;
  user: string;
}

export interface NotificationKey {
  cardId: string;
  userId: string;
  kind: NotificationKind;
  key: string;
}

export interface ChecklistItem {
  id: string;
  cardId: string;
  text: string;
  done: boolean;
  position: string;
}

export interface CardLink {
  id: string;
  cardId: string;
  url: string;
  title: string | null;
  kind: LinkKind;
  position: string;
}

export type ActivityKind = 'created' | 'repeated' | 'completed' | 'moved' | 'reopened' | 'due' | 'nudged' | 'nudge_reply' | 'watcher';

/**
 * Ein Eintrag im Verlauf einer Karte. Bei „due" sind from/to ISO-Zeiten, bei „moved"/„reopened" Spaltennamen,
 * bei „nudged" ist `to` der Empfänger und `text` die Nachricht, bei „nudge_reply" ist `text` die Antwort.
 */
export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  at: string;
  byName: string | null;
  source?: CompletionSource;
  from?: string | null;
  to?: string | null;
  text?: string;
}

export interface CardDetail extends Card {
  checklistItems: ChecklistItem[];
  links: CardLink[];
  /** die letzten Erledigungen, neueste zuerst */
  history: Completion[];
  /** gesamter Verlauf (angelegt, verschoben, erledigt, wieder geöffnet, Termin geändert), neueste zuerst */
  activity: ActivityEntry[];
  attachments: Attachment[];
}

export interface BoardView {
  board: Board;
  columns: Column[];
  categories: Category[];
  cards: Card[];
  /** Summe der Kosten aller Karten des Boards */
  costTotalCents: number;
}

export interface CardInput {
  columnId: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  dueAt?: string | null;
  recurrence?: unknown;
  remindBeforeMin?: number | null;
  overdueNag?: unknown;
  costCents?: number | null;
  carryOver?: unknown;
  assigneeIds?: string[];
  categoryIds?: string[];
}

export type CardPatch = Partial<Omit<CardInput, 'columnId'>>;

export type TrashType = 'board' | 'column' | 'category' | 'card';

export interface TrashItem {
  type: TrashType;
  id: string;
  title: string;
  boardId: string;
  deletedAt: string;
  purgeAt: string;
}

export interface StoreOptions {
  /** Wird nach dem Erledigen einer Karte mit den dabei geschlossenen Stupsen aufgerufen (für die Rückmeldung) */
  onNudgesClosed?: (list: ClosedNudge[]) => void;
  now?: () => Date;
  /** IANA-Zeitzone von Home Assistant, z. B. Europe/Berlin */
  timeZone?: () => string;
}

type Row = Record<string, any>;

const TRASH_DAYS = 30;
const PERSON_COLORS = ['#9DB4FF', '#FF9EC4', '#8FE3B4', '#FFC58A'];
const DUE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const PRIORITIES = ['low', 'medium', 'high'];

function cleanText(value: unknown, what: string, max: number): string {
  if (typeof value !== 'string' || value.trim() === '') throw new ValidationError(`${what} fehlt`);
  const t = value.trim();
  if (t.length > max) throw new ValidationError(`${what} ist zu lang (höchstens ${max} Zeichen)`);
  return t;
}

function parseDue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !DUE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError('Die Fälligkeit braucht Datum und Uhrzeit mit Zeitzone');
  }
  return new Date(value).toISOString();
}

function parsePriority(value: unknown): Priority | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !PRIORITIES.includes(value)) {
    throw new ValidationError('Priorität muss low, medium oder high sein');
  }
  return value as Priority;
}

function parseRemind(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 43_200) {
    throw new ValidationError('Die Vorab-Erinnerung muss zwischen 1 Minute und 30 Tagen liegen');
  }
  return value as number;
}

function parseCost(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1_000_000_000) {
    throw new ValidationError('Die Kosten müssen eine nicht negative Zahl in Cent sein');
  }
  return value as number;
}

/** undefined = nicht angegeben, null = Voreinstellung, sonst eine geprüfte Liste ohne Doppelte */
function parseCarryOver(value: unknown): CarryField[] | null | undefined {
  if (value === undefined || value === null) return value;
  if (!Array.isArray(value)) throw new ValidationError('Die Übernahme-Felder müssen eine Liste sein');
  const out: CarryField[] = [];
  for (const v of value) {
    if (typeof v !== 'string' || !(CARRY_FIELDS as readonly string[]).includes(v)) {
      throw new ValidationError('Unbekanntes Feld bei der Wiederholung');
    }
    if (!out.includes(v as CarryField)) out.push(v as CarryField);
  }
  return out;
}

/** Gespeicherte Auswahl (JSON oder null) als Liste, bei null die Voreinstellung */
function resolveCarry(raw: string | null | undefined): CarryField[] {
  if (!raw) return [...DEFAULT_CARRY];
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((v): v is CarryField => (CARRY_FIELDS as readonly string[]).includes(v)) : [...DEFAULT_CARRY];
  } catch {
    return [...DEFAULT_CARRY];
  }
}

function parseBool(value: unknown, what: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new ValidationError(`${what} muss wahr oder falsch sein`);
  return value;
}

function isPosInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1;
}

function parseRecurrence(value: unknown): Recurrence | null {
  if (value === null || value === undefined) return null;
  const r = value as Record<string, unknown>;
  const bad = () => new ValidationError('Die Wiederholung ist ungültig');
  if (typeof r !== 'object') throw bad();
  if (r.type === 'fixed') {
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq as string) || !isPosInt(r.every)) throw bad();
    if (r.weekdays !== undefined) {
      if (!Array.isArray(r.weekdays) || r.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw bad();
    }
    if (r.monthDay !== undefined) {
      if (!Number.isInteger(r.monthDay) || (r.monthDay !== -1 && ((r.monthDay as number) < 1 || (r.monthDay as number) > 31))) {
        throw bad();
      }
    }
    return value as Recurrence;
  }
  if (r.type === 'after_completion') {
    if (!isPosInt(r.every) || !['days', 'weeks', 'months'].includes(r.unit as string)) throw bad();
    return value as Recurrence;
  }
  throw bad();
}

export function createStore(db: DatabaseSync, opts: StoreOptions = {}) {
  const now = opts.now ?? (() => new Date());
  const timeZone = opts.timeZone ?? (() => 'Europe/Berlin');
  const iso = () => now().toISOString();

  const one = (sql: string, ...p: unknown[]) => db.prepare(sql).get(...(p as never[])) as Row | undefined;
  const all = (sql: string, ...p: unknown[]) => db.prepare(sql).all(...(p as never[])) as Row[];
  const run = (sql: string, ...p: unknown[]) => db.prepare(sql).run(...(p as never[]));

  let depth = 0;
  /** Geschlossene Stupse, die erst nach dem erfolgreichen Abschluss der Transaktion gemeldet werden */
  let pendingClosed: ClosedNudge[] = [];
  function tx<T>(fn: () => T): T {
    if (depth > 0) return fn();
    db.exec('begin');
    depth++;
    try {
      const result = fn();
      db.exec('commit');
      const announce = pendingClosed;
      pendingClosed = [];
      try {
        if (announce.length > 0) opts.onNudgesClosed?.(announce);
      } catch {
        /* eine fehlgeschlagene Rückmeldung darf das Erledigen nicht zurückrollen */
      }
      return result;
    } catch (err) {
      db.exec('rollback');
      pendingClosed = [];
      throw err;
    } finally {
      depth--;
    }
  }

  // ---------- users ----------

  const toUser = (r: Row): User => ({
    id: r.id,
    haUserId: r.ha_user_id,
    name: r.name,
    displayName: r.display_name,
    isPerson: r.is_person === 1,
    color: r.color,
    notifyServices: JSON.parse(r.notify_services ?? '[]') as string[],
    nudgeQuiet: quietOf(r),
  });

  /** Ruhezeit aus den Spalten der Person, mit der Vorgabe für alles, was nicht gesetzt ist */
  function quietOf(r: Row): QuietWindow {
    return {
      start: r.nudge_quiet_start ?? DEFAULT_QUIET.start,
      end: r.nudge_quiet_end ?? DEFAULT_QUIET.end,
      off: r.nudge_quiet_off === 1,
    };
  }

  function nextPersonColor(): string {
    const used = all('select color from users where is_person = 1').map((r) => r.color);
    return PERSON_COLORS.find((c) => !used.includes(c)) ?? PERSON_COLORS[0]!;
  }

  /** Dienstnamen bereinigen: ohne „notify.", ohne Leere und Doppelte. strict: Unsinn ablehnen statt überspringen. */
  function cleanServices(raw: unknown, strict: boolean): string[] {
    if (!Array.isArray(raw)) {
      if (strict) throw new ValidationError('Die Dienste müssen eine Liste sein');
      return [];
    }
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item !== 'string') {
        if (strict) throw new ValidationError('Ein Dienstname ist kein Text');
        continue;
      }
      const name = item.trim().replace(/^notify\./, '');
      if (name === '') continue;
      if (!/^[A-Za-z0-9_]+$/.test(name)) {
        if (strict) throw new ValidationError(`„${name}" ist kein gültiger Dienstname`);
        continue;
      }
      if (!out.includes(name)) out.push(name);
    }
    return out;
  }

  /** Aus den Add-on-Optionen (nur noch für die einmalige Übernahme) */
  function syncPeople(people: { name: string; notify?: string[] }[]): void {
    tx(() => {
      for (const p of people) {
        const wanted = p.name.trim().toLowerCase();
        if (!wanted) continue;
        let existing = all('select * from users').find(
          (u) => u.name.toLowerCase() === wanted || u.display_name.toLowerCase() === wanted,
        );
        if (!existing) {
          const id = randomUUID();
          run(
            'insert into users (id, ha_user_id, name, display_name, is_person, color, created_at) values (?, null, ?, ?, 1, ?, ?)',
            id,
            p.name.trim(),
            p.name.trim(),
            nextPersonColor(),
            iso(),
          );
          existing = one('select * from users where id = ?', id)!;
        } else if (existing.is_person !== 1) {
          run('update users set is_person = 1 where id = ?', existing.id);
        }
        if (p.notify !== undefined) {
          run('update users set notify_services = ? where id = ?', JSON.stringify(cleanServices(p.notify, false)), existing.id);
        }
      }
    });
  }

  function resolveUser(who: { haId: string; name: string; displayName: string }): User {
    return tx(() => {
      const byId = one('select * from users where ha_user_id = ?', who.haId);
      if (byId) return toUser(byId);

      const names = [who.name, who.displayName].map((n) => n.trim().toLowerCase()).filter(Boolean);
      const placeholder = all('select * from users where ha_user_id is null').find((u) =>
        names.includes(u.name.toLowerCase()),
      );
      if (placeholder) {
        run('update users set ha_user_id = ? where id = ?', who.haId, placeholder.id);
        return toUser(one('select * from users where id = ?', placeholder.id)!);
      }
      const id = randomUUID();
      run(
        'insert into users (id, ha_user_id, name, display_name, is_person, color, created_at) values (?, ?, ?, ?, 0, null, ?)',
        id,
        who.haId,
        who.name || who.displayName,
        who.displayName || who.name,
        iso(),
      );
      return toUser(one('select * from users where id = ?', id)!);
    });
  }

  const people = (): User[] => all('select * from users where is_person = 1 order by created_at, rowid').map(toUser);

  /** Benutzer, die die App geöffnet haben, aber (noch) keine Person sind: „Wartet auf Freigabe" */
  const pendingUsers = (): User[] =>
    all('select * from users where is_person = 0 and ha_user_id is not null order by created_at, rowid').map(toUser);

  const userRow = (id: string): Row => {
    const r = one('select * from users where id = ?', id);
    if (!r) throw new NotFoundError('Person nicht gefunden');
    return r;
  };

  function cleanPersonName(raw: unknown): string {
    if (typeof raw !== 'string' || raw.trim() === '') throw new ValidationError('Der Name fehlt');
    const name = raw.trim();
    if (name.length > 60) throw new ValidationError('Der Name ist zu lang (höchstens 60 Zeichen)');
    return name;
  }

  /** Macht jemanden zur Person (zuweisbar, bekommt Push). Gibt es ihn schon, wird er nur markiert. */
  function addPerson(input: { haUserId?: string | null; name: string }): User {
    const name = cleanPersonName(input.name);
    return tx(() => {
      const haId = input.haUserId || null;
      let row = haId ? one('select * from users where ha_user_id = ?', haId) : undefined;
      if (!row) {
        // Eine Person, die noch nie angemeldet war, wird beim ersten Öffnen über den Namen verknüpft
        row = all('select * from users where ha_user_id is null').find(
          (u) => u.name.toLowerCase() === name.toLowerCase() || u.display_name.toLowerCase() === name.toLowerCase(),
        );
        if (row && haId) run('update users set ha_user_id = ? where id = ?', haId, row.id);
      }
      if (!row) {
        const id = randomUUID();
        run(
          'insert into users (id, ha_user_id, name, display_name, is_person, color, created_at) values (?, ?, ?, ?, 1, ?, ?)',
          id,
          haId,
          name,
          name,
          nextPersonColor(),
          iso(),
        );
        return toUser(one('select * from users where id = ?', id)!);
      }
      if (row.is_person !== 1) {
        run('update users set is_person = 1, color = ? where id = ?', row.color ?? nextPersonColor(), row.id);
      }
      return toUser(one('select * from users where id = ?', row.id)!);
    });
  }

  /** Nimmt jemanden aus der Liste. Karten behalten die Zuweisung, sie tritt wieder in Kraft, wenn die Person zurückkommt. */
  function removePerson(id: string): void {
    userRow(id);
    run('update users set is_person = 0 where id = ?', id);
    closeNudgesOfUser(id);
  }

  function renamePerson(id: string, displayName: unknown): User {
    userRow(id);
    run('update users set display_name = ? where id = ?', cleanPersonName(displayName), id);
    return toUser(userRow(id));
  }

  function setNotifyServices(id: string, services: unknown): User {
    userRow(id);
    run('update users set notify_services = ? where id = ?', JSON.stringify(cleanServices(services, true)), id);
    return toUser(userRow(id));
  }

  const getSetting = (key: string): string | null =>
    (one('select value from settings where key = ?', key)?.value as string | undefined) ?? null;
  const putSetting = (key: string, value: string) =>
    run('insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value', key, value);

  function getAccessMode(): AccessMode {
    return getSetting('accessMode') === 'selected' ? 'selected' : 'everyone';
  }

  function setAccessMode(mode: unknown): AccessMode {
    if (mode !== 'everyone' && mode !== 'selected') throw new ValidationError('Unbekannter Zugriffsmodus');
    putSetting('accessMode', mode);
    return mode;
  }

  /**
   * Bis Version 0.10 standen die Personen und ihre Notify-Dienste in den Add-on-Optionen. Sie werden einmal
   * in die Datenbank übernommen, danach gelten die Einstellungen in der App. Bestehende Installationen bleiben
   * bei „alle", frische starten mit „nur freigegebene". Gibt true zurück, wenn übernommen wurde.
   */
  function importLegacyPeople(users: { name: string; notify: string[] }[]): boolean {
    if (getSetting('legacyPeopleImported') !== null) return false;
    tx(() => {
      const hadPeople = people().length > 0 || users.length > 0;
      syncPeople(users);
      if (getSetting('accessMode') === null) putSetting('accessMode', hadPeople ? 'everyone' : 'selected');
      putSetting('legacyPeopleImported', iso());
    });
    return true;
  }

  /**
   * Personen und Zugriff kommen aus der Add-on-Konfiguration in Home Assistant (Option users ausgefüllt).
   * Bei jedem Start gilt die Liste dort: genannte Personen werden angelegt und bekommen ihre Push-Geräte,
   * alle anderen sind keine Person mehr (ihre Karten behalten die Zuweisung), der Zugriff folgt access_mode.
   * In der App sind Personen, Geräte und Zugriff dann gesperrt.
   */
  function applyManagedPeople(users: { name: string; notify: string[] }[], mode: AccessMode): void {
    tx(() => {
      const listed = users.filter((u) => u.name.trim() !== '');
      syncPeople(listed);
      const names = new Set(listed.map((u) => u.name.trim().toLowerCase()));
      for (const p of people()) {
        if (!names.has(p.name.toLowerCase()) && !names.has(p.displayName.toLowerCase())) removePerson(p.id);
      }
      putSetting('accessMode', mode);
      if (getSetting('legacyPeopleImported') === null) putSetting('legacyPeopleImported', iso());
      putSetting('managedByOptions', '1');
    });
  }

  /** Personen und Zugriff werden in der Add-on-Konfiguration verwaltet (nicht in der App) */
  const isManaged = (): boolean => getSetting('managedByOptions') === '1';
  /** Die Konfiguration verwaltet nichts mehr: die App darf Personen und Zugriff wieder ändern. */
  const clearManaged = (): void => {
    if (isManaged()) putSetting('managedByOptions', '0');
  };

  // ---------- boards ----------

  const toBoard = (r: Row): Board => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    position: r.position,
    archiveAfterDays: r.archive_after_days,
  });

  function visibleBoard(id: string): Row {
    const r = one('select * from boards where id = ? and deleted_at is null', id);
    if (!r) throw new NotFoundError('Board nicht gefunden');
    return r;
  }

  const lastPos = (table: string, where: string, ...p: unknown[]): string | null =>
    (one(`select max(position) as p from ${table} where ${where}`, ...p)?.p as string | null) ?? null;

  function createBoard(input: {
    name: string;
    icon?: string | null;
    color?: string | null;
    /** Spalte „Geplant" gleich mit anlegen (Standard der App) */
    withPlanned?: boolean;
  }): Board {
    const name = cleanText(input.name, 'Der Name', 80);
    return tx(() => {
      const id = randomUUID();
      const t = iso();
      run(
        'insert into boards (id, name, icon, color, position, archive_after_days, created_at, updated_at) values (?, ?, ?, ?, ?, 7, ?, ?)',
        id,
        name,
        input.icon ?? null,
        input.color ?? null,
        generateKeyBetween(lastPos('boards', '1 = 1'), null),
        t,
        t,
      );
      const defaults: { name: string; done?: boolean; planned?: boolean }[] = [
        { name: 'Offen' },
        ...(input.withPlanned ? [{ name: 'Geplant', planned: true }] : []),
        { name: 'In Arbeit' },
        { name: 'Erledigt', done: true },
      ];
      const positions = generateNKeysBetween(null, null, defaults.length);
      defaults.forEach((col, i) => {
        run(
          'insert into columns (id, board_id, name, position, is_done, is_planned) values (?, ?, ?, ?, ?, ?)',
          randomUUID(),
          id,
          col.name,
          positions[i]!,
          col.done ? 1 : 0,
          col.planned ? 1 : 0,
        );
      });
      return toBoard(one('select * from boards where id = ?', id)!);
    });
  }

  function listBoards(): BoardSummary[] {
    return all('select * from boards where deleted_at is null order by position, id').map((r) => ({
      ...toBoard(r),
      openCards: one(
        `select count(*) as n from cards c join columns col on col.id = c.column_id
         where c.board_id = ? and c.deleted_at is null and c.archived_at is null
           and col.is_done = 0 and col.is_planned = 0`,
        r.id,
      )!.n as number,
    }));
  }

  function updateBoard(
    id: string,
    patch: { name?: string; icon?: string | null; color?: string | null; archiveAfterDays?: number },
  ): Board {
    visibleBoard(id);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      sets.push('name = ?');
      params.push(cleanText(patch.name, 'Der Name', 80));
    }
    if (patch.icon !== undefined) {
      sets.push('icon = ?');
      params.push(patch.icon);
    }
    if (patch.color !== undefined) {
      sets.push('color = ?');
      params.push(patch.color);
    }
    if (patch.archiveAfterDays !== undefined) {
      if (!Number.isInteger(patch.archiveAfterDays) || patch.archiveAfterDays < 0 || patch.archiveAfterDays > 3650) {
        throw new ValidationError('Die Archivfrist muss zwischen 0 und 3650 Tagen liegen');
      }
      sets.push('archive_after_days = ?');
      params.push(patch.archiveAfterDays);
    }
    if (sets.length > 0) {
      run(`update boards set ${sets.join(', ')}, updated_at = ? where id = ?`, ...params, iso(), id);
    }
    return toBoard(one('select * from boards where id = ?', id)!);
  }

  function deleteBoard(id: string): void {
    visibleBoard(id);
    run('update boards set deleted_at = ? where id = ?', iso(), id);
  }

  // ---------- columns ----------

  const toColumn = (r: Row): Column => ({
    id: r.id,
    boardId: r.board_id,
    name: r.name,
    position: r.position,
    isDone: r.is_done === 1,
    isPlanned: r.is_planned === 1,
  });

  function visibleColumn(id: string): Row {
    const r = one(
      `select c.* from columns c join boards b on b.id = c.board_id
       where c.id = ? and c.deleted_at is null and b.deleted_at is null`,
      id,
    );
    if (!r) throw new NotFoundError('Spalte nicht gefunden');
    return r;
  }

  const visibleColumns = (boardId: string): Row[] =>
    all('select * from columns where board_id = ? and deleted_at is null order by position, id', boardId);

  function addColumn(boardId: string, input: { name: string; isDone?: boolean; isPlanned?: boolean }): Column {
    visibleBoard(boardId);
    const name = cleanText(input.name, 'Der Name', 60);
    if (input.isDone && input.isPlanned) {
      throw new ValidationError('Eine Spalte kann nicht gleichzeitig „Erledigt" und „Geplant" sein');
    }
    return tx(() => {
      const id = randomUUID();
      if (input.isDone) run('update columns set is_done = 0 where board_id = ? and is_done = 1', boardId);
      if (input.isPlanned) run('update columns set is_planned = 0 where board_id = ? and is_planned = 1', boardId);
      run(
        'insert into columns (id, board_id, name, position, is_done, is_planned) values (?, ?, ?, ?, ?, ?)',
        id,
        boardId,
        name,
        generateKeyBetween(lastPos('columns', 'board_id = ?', boardId), null),
        input.isDone ? 1 : 0,
        input.isPlanned ? 1 : 0,
      );
      if (input.isPlanned) syncPlannedBoard(boardId);
      return toColumn(one('select * from columns where id = ?', id)!);
    });
  }

  function updateColumn(id: string, patch: { name?: string; isDone?: boolean; isPlanned?: boolean }): Column {
    const col = visibleColumn(id);
    return tx(() => {
      if (patch.name !== undefined) {
        run('update columns set name = ? where id = ?', cleanText(patch.name, 'Der Name', 60), id);
      }
      if (patch.isDone === true && (col.is_planned === 1 || patch.isPlanned === true)) {
        throw new ValidationError('Eine Spalte kann nicht gleichzeitig „Erledigt" und „Geplant" sein');
      }
      if (patch.isPlanned === true && col.is_done === 1 && patch.isDone !== false) {
        throw new ValidationError('Eine Spalte kann nicht gleichzeitig „Erledigt" und „Geplant" sein');
      }
      if (patch.isDone === true) {
        run('update columns set is_done = 0 where board_id = ? and is_done = 1 and id <> ?', col.board_id, id);
        run('update columns set is_done = 1 where id = ?', id);
      } else if (patch.isDone === false) {
        run('update columns set is_done = 0 where id = ?', id);
      }
      if (patch.isPlanned === true) {
        run('update columns set is_planned = 0 where board_id = ? and is_planned = 1 and id <> ?', col.board_id, id);
        run('update columns set is_planned = 1 where id = ?', id);
        syncPlannedBoard(col.board_id);
      } else if (patch.isPlanned === false) {
        run('update columns set is_planned = 0 where id = ?', id);
      }
      return toColumn(one('select * from columns where id = ?', id)!);
    });
  }

  // ---------- Geplant ----------

  const plannedColumn = (boardId: string): Row | undefined => visibleColumns(boardId).find((c) => c.is_planned === 1);
  /** Die Spalte, in die neue Karten kommen: die erste, die weder „Erledigt" noch „Geplant" ist */
  const inboxColumn = (boardId: string): Row | undefined =>
    visibleColumns(boardId).find((c) => c.is_done !== 1 && c.is_planned !== 1);

  /** Termin heute oder später als heute? Dann ist die Karte „geplant", nicht „offen". */
  function isFutureDue(dueAt: string | null): boolean {
    return dueAt !== null && Date.parse(dueAt) >= startOfTomorrow(now().getTime(), timeZone());
  }

  /**
   * Hält „Offen" und „Geplant" sauber: Karten mit Termin nach heute wandern nach „Geplant",
   * Karten in „Geplant" ohne Termin oder mit Termin heute oder früher zurück nach „Offen".
   * Andere Spalten (z. B. „In Arbeit") bleiben unangetastet.
   */
  function syncPlannedBoard(boardId: string): number {
    const planned = plannedColumn(boardId);
    const inbox = inboxColumn(boardId);
    if (!planned || !inbox) return 0;
    let moved = 0;
    const cards = all(
      `select id, column_id, due_at from cards
       where board_id = ? and column_id in (?, ?) and deleted_at is null and archived_at is null and completed_at is null
       order by position, id`,
      boardId,
      inbox.id,
      planned.id,
    );
    for (const c of cards) {
      const future = isFutureDue(c.due_at);
      if (c.column_id === inbox.id && future) {
        placeCard(c.id, planned, undefined);
        touchCard(c.id);
        moved++;
      } else if (c.column_id === planned.id && !future) {
        placeCard(c.id, inbox, null);
        touchCard(c.id);
        moved++;
      }
    }
    return moved;
  }

  /** Alle Boards abgleichen. Gibt die Zahl der verschobenen Karten zurück. */
  function syncPlanned(): number {
    return tx(() => all('select id from boards where deleted_at is null').reduce((n, b) => n + syncPlannedBoard(b.id), 0));
  }

  /**
   * Einmalig für Boards, die es vor der Spalte „Geplant" gab: Spalte hinter der ersten Spalte anlegen.
   * Wer sie später löscht, bekommt sie nicht zurück.
   */
  function ensurePlannedColumns(): void {
    if (one("select 1 as ok from settings where key = 'plannedColumnsAdded'")) return;
    tx(() => {
      for (const b of all('select id from boards where deleted_at is null')) {
        if (all('select id from columns where board_id = ? and is_planned = 1', b.id).length > 0) continue;
        const cols = visibleColumns(b.id);
        const inbox = inboxColumn(b.id);
        if (!inbox) continue;
        const next = cols[cols.findIndex((c) => c.id === inbox.id) + 1];
        run(
          'insert into columns (id, board_id, name, position, is_done, is_planned) values (?, ?, ?, ?, 0, 1)',
          randomUUID(),
          b.id,
          'Geplant',
          generateKeyBetween(inbox.position, next?.position ?? null),
        );
        syncPlannedBoard(b.id);
      }
      run("insert into settings (key, value) values ('plannedColumnsAdded', '1')");
    });
  }

  function neighbours(
    items: { id: string; position: string }[],
    afterId: string | null | undefined,
  ): { prev: string | null; next: string | null } {
    if (afterId === undefined) return { prev: items.at(-1)?.position ?? null, next: null };
    if (afterId === null) return { prev: null, next: items[0]?.position ?? null };
    const i = items.findIndex((x) => x.id === afterId);
    if (i < 0) throw new ValidationError('Die Bezugsposition liegt nicht in dieser Liste');
    return { prev: items[i]!.position, next: items[i + 1]?.position ?? null };
  }

  function moveColumn(id: string, afterId: string | null): Column {
    const col = visibleColumn(id);
    const others = visibleColumns(col.board_id).filter((c) => c.id !== id);
    const { prev, next } = neighbours(others as { id: string; position: string }[], afterId);
    run('update columns set position = ? where id = ?', generateKeyBetween(prev, next), id);
    return toColumn(one('select * from columns where id = ?', id)!);
  }

  function deleteColumn(id: string, moveToColumnId?: string): void {
    const col = visibleColumn(id);
    tx(() => {
      if (visibleColumns(col.board_id).length <= 1) {
        throw new ConflictError('Die letzte Spalte kann nicht gelöscht werden');
      }
      const cards = all(
        'select id from cards where column_id = ? and deleted_at is null order by position, id',
        id,
      );
      if (cards.length > 0) {
        if (!moveToColumnId) {
          throw new ConflictError('Die Spalte enthält Karten. Bitte eine Spalte zum Verschieben wählen');
        }
        const target = visibleColumn(moveToColumnId);
        if (target.board_id !== col.board_id || target.id === id) {
          throw new ValidationError('Die Zielspalte ist ungültig');
        }
        let prev = lastPos('cards', 'column_id = ?', target.id);
        for (const c of cards) {
          const pos = generateKeyBetween(prev, null);
          run('update cards set column_id = ?, position = ?, updated_at = ?, version = version + 1 where id = ?', target.id, pos, iso(), c.id);
          prev = pos;
        }
      }
      run('update columns set deleted_at = ? where id = ?', iso(), id);
    });
  }

  // ---------- categories ----------

  const toCategory = (r: Row): Category => ({
    id: r.id,
    boardId: r.board_id,
    name: r.name,
    color: r.color,
    position: r.position,
  });

  function visibleCategory(id: string): Row {
    const r = one('select * from categories where id = ? and deleted_at is null', id);
    if (!r) throw new NotFoundError('Kategorie nicht gefunden');
    return r;
  }

  function addCategory(boardId: string, input: { name: string; color: string }): Category {
    visibleBoard(boardId);
    const name = cleanText(input.name, 'Der Name', 40);
    const color = cleanText(input.color, 'Die Farbe', 32);
    const id = randomUUID();
    run(
      'insert into categories (id, board_id, name, color, position) values (?, ?, ?, ?, ?)',
      id,
      boardId,
      name,
      color,
      generateKeyBetween(lastPos('categories', 'board_id = ?', boardId), null),
    );
    return toCategory(one('select * from categories where id = ?', id)!);
  }

  function updateCategory(id: string, patch: { name?: string; color?: string }): Category {
    visibleCategory(id);
    if (patch.name !== undefined) run('update categories set name = ? where id = ?', cleanText(patch.name, 'Der Name', 40), id);
    if (patch.color !== undefined) run('update categories set color = ? where id = ?', cleanText(patch.color, 'Die Farbe', 32), id);
    return toCategory(one('select * from categories where id = ?', id)!);
  }

  function deleteCategory(id: string): void {
    visibleCategory(id);
    run('update categories set deleted_at = ? where id = ?', iso(), id);
  }

  // ---------- cards ----------

  function loadCards(where: string, ...params: unknown[]): Card[] {
    const rows = all(`select * from cards where ${where} order by position, id`, ...params);
    if (rows.length === 0) return [];
    const sub = `select id from cards where ${where}`;

    const group = <T>(list: Row[], key: string, value: (r: Row) => T): Map<string, T[]> => {
      const m = new Map<string, T[]>();
      for (const r of list) {
        const arr = m.get(r[key]) ?? [];
        arr.push(value(r));
        m.set(r[key], arr);
      }
      return m;
    };
    const assignees = group(
      all(`select card_id, user_id from card_assignees where card_id in (${sub}) order by rowid`, ...params),
      'card_id',
      (r) => r.user_id as string,
    );
    const categories = group(
      all(
        `select cc.card_id, cc.category_id from card_categories cc
         join categories cat on cat.id = cc.category_id and cat.deleted_at is null
         where cc.card_id in (${sub}) order by cat.position, cat.id`,
        ...params,
      ),
      'card_id',
      (r) => r.category_id as string,
    );
    const checklist = new Map<string, { done: number; total: number }>();
    for (const r of all(
      `select card_id, count(*) as total, coalesce(sum(done), 0) as done from checklist_items
       where card_id in (${sub}) group by card_id`,
      ...params,
    )) {
      checklist.set(r.card_id, { done: r.done, total: r.total });
    }
    const links = new Map<string, number>();
    for (const r of all(
      `select card_id, count(*) as n from links where card_id in (${sub}) group by card_id`,
      ...params,
    )) {
      links.set(r.card_id, r.n);
    }
    const attachmentCounts = new Map<string, number>();
    for (const r of all(
      `select card_id, count(*) as n from attachments where card_id in (${sub}) group by card_id`,
      ...params,
    )) {
      attachmentCounts.set(r.card_id, r.n);
    }
    const nudges = group(
      all(
        `select card_id, id, from_user, to_user, delivered_round from nudges where reply is null and card_id in (${sub}) order by created_at, rowid`,
        ...params,
      ),
      'card_id',
      (r): OpenNudge => ({ id: r.id, fromId: r.from_user, toId: r.to_user, delivered: r.delivered_round >= 0 }),
    );
    const commentCounts = new Map<string, number>();
    for (const r of all(
      `select card_id, count(*) as n from comments where card_id in (${sub}) group by card_id`,
      ...params,
    )) {
      commentCounts.set(r.card_id, r.n);
    }

    return rows.map((r) => ({
      id: r.id,
      boardId: r.board_id,
      columnId: r.column_id,
      position: r.position,
      title: r.title,
      description: r.description,
      priority: r.priority,
      dueAt: r.due_at,
      recurrence: r.recurrence ? (JSON.parse(r.recurrence) as Recurrence) : null,
      completedAt: r.completed_at,
      archivedAt: r.archived_at,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      version: r.version,
      remindBeforeMin: r.remind_before_min,
      overdueNag: r.overdue_nag === 1,
      costCents: r.cost_cents,
      carryOver: resolveCarry(r.carry_over),
      openNudges: nudges.get(r.id) ?? [],
      repeatedFrom: r.repeated_from ?? null,
      watcherId: r.watcher_id ?? null,
      assigneeIds: assignees.get(r.id) ?? [],
      categoryIds: categories.get(r.id) ?? [],
      checklist: checklist.get(r.id) ?? { done: 0, total: 0 },
      linkCount: links.get(r.id) ?? 0,
      commentCount: commentCounts.get(r.id) ?? 0,
      attachmentCount: attachmentCounts.get(r.id) ?? 0,
    }));
  }

  const columnName = (id: string): string | null => one('select name from columns where id = ?', id)?.name ?? null;

  function visibleCardRow(id: string): Row {
    const r = one('select * from cards where id = ? and deleted_at is null', id);
    if (!r) throw new NotFoundError('Karte nicht gefunden');
    return r;
  }

  const toItem = (r: Row): ChecklistItem => ({
    id: r.id,
    cardId: r.card_id,
    text: r.text,
    done: r.done === 1,
    position: r.position,
  });

  const toLink = (r: Row): CardLink => ({
    id: r.id,
    cardId: r.card_id,
    url: r.url,
    title: r.title,
    kind: r.kind,
    position: r.position,
  });

  function getCard(id: string): CardDetail {
    visibleCardRow(id);
    const [card] = loadCards('id = ?', id);
    return {
      ...card!,
      checklistItems: all('select * from checklist_items where card_id = ? order by position, id', id).map(toItem),
      links: all('select * from links where card_id = ? order by position, id', id).map(toLink),
      history: listCompletions(id, 10),
      activity: listActivity(id, card!),
      attachments: listAttachments(id),
    };
  }

  function logEvent(
    cardId: string,
    kind: 'moved' | 'reopened' | 'due',
    by: string | null,
    from: string | null,
    to: string | null,
  ): void {
    run(
      'insert into card_events (id, card_id, kind, by_user, at, from_v, to_v) values (?, ?, ?, ?, ?, ?, ?)',
      randomUUID(),
      cardId,
      kind,
      by,
      iso(),
      from,
      to,
    );
  }

  /** Was ein Wächter mit der Karte gemacht hat (Läufe), ohne das Anlegen selbst (das steht schon im Eintrag „Angelegt") */
  function watcherActivity(cardId: string): ActivityEntry[] {
    const out: ActivityEntry[] = [];
    for (const r of all(`select * from watcher_runs where card_id = ? and result not in ('created', 'test') order by at, rowid`, cardId)) {
      const names = (JSON.parse(r.assigned_to) as string[])
        .map((id) => one('select display_name from users where id = ?', id)?.display_name)
        .filter(Boolean)
        .join(', ');
      const note = r.note ? ` · ${r.note}` : '';
      const text =
        r.result === 'retriggered'
          ? `Erneut ausgelöst${note}`
          : r.result === 'waiting'
            ? 'Wartet auf die erste Person, die heimkommt'
            : r.result === 'assigned'
              ? `Zugewiesen: ${names}${note}`
              : r.result === 'auto_done'
                ? 'Automatisch erledigt, weil die Bedingung eingetreten ist'
                : r.result === 'nudged'
                  ? `Erinnerung gesendet, weil die Karte noch offen war${note}`
                  : null;
      if (text) out.push({ id: r.id, kind: 'watcher', at: r.at, byName: null, text });
    }
    return out;
  }

  function listActivity(cardId: string, card: Card, limit = 50): ActivityEntry[] {
    const created = card.createdBy ? one('select display_name from users where id = ?', card.createdBy) : undefined;
    const watcher = card.watcherId ? one('select name from watchers where id = ?', card.watcherId) : undefined;
    const entries: ActivityEntry[] = [
      {
        id: `created-${cardId}`,
        kind: card.repeatedFrom ? 'repeated' : 'created',
        at: card.createdAt,
        byName: watcher ? `Wächter „${watcher.name}“` : (created?.display_name ?? null),
      },
    ];
    for (const c of listCompletions(cardId, limit)) {
      entries.push({ id: c.id, kind: 'completed', at: c.completedAt, byName: c.completedByName, source: c.source });
    }
    for (const r of all(
      `select e.*, u.display_name as by_name from card_events e left join users u on u.id = e.by_user
       where e.card_id = ? order by e.at desc, e.rowid desc limit ?`,
      cardId,
      limit,
    )) {
      entries.push({ id: r.id, kind: r.kind, at: r.at, byName: r.by_name, from: r.from_v, to: r.to_v });
    }
    entries.push(...nudgeActivity(cardId));
    entries.push(...watcherActivity(cardId));
    // Neueste zuerst; „angelegt" steht bei gleicher Zeit ganz unten
    const isStart = (e: ActivityEntry) => e.kind === 'created' || e.kind === 'repeated';
    return entries
      .sort((a, b) => (a.at === b.at ? Number(isStart(a)) - Number(isStart(b)) : a.at < b.at ? 1 : -1))
      .slice(0, limit);
  }

  // ---------- Anhänge ----------

  const toStored = (r: Row): StoredAttachment => ({
    id: r.id,
    cardId: r.card_id,
    filename: r.filename,
    mime: r.mime,
    size: r.size,
    hasThumb: r.thumb !== null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    file: r.file,
    thumb: r.thumb,
  });

  const publicAttachment = ({ file: _file, thumb: _thumb, ...rest }: StoredAttachment): Attachment => rest;

  function listAttachments(cardId: string): Attachment[] {
    return all('select * from attachments where card_id = ? order by created_at, rowid', cardId).map((r) =>
      publicAttachment(toStored(r)),
    );
  }

  function addAttachment(
    cardId: string,
    a: { id: string; filename: string; mime: string; size: number; file: string; thumb: string | null },
    by: string | null,
  ): Attachment {
    visibleCardRow(cardId);
    run(
      `insert into attachments (id, card_id, filename, mime, size, file, thumb, created_by, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.id,
      cardId,
      a.filename,
      a.mime,
      a.size,
      a.file,
      a.thumb,
      by,
      iso(),
    );
    touchCard(cardId);
    return publicAttachment(toStored(one('select * from attachments where id = ?', a.id)!));
  }

  function getAttachment(id: string): StoredAttachment {
    const r = one(
      `select a.* from attachments a join cards c on c.id = a.card_id where a.id = ? and c.deleted_at is null`,
      id,
    );
    if (!r) throw new NotFoundError('Anhang nicht gefunden');
    return toStored(r);
  }

  /** Entfernt den Eintrag und gibt die Dateinamen zurück, die der Aufrufer löschen soll. */
  function deleteAttachment(id: string): { file: string | null; thumb: string | null } {
    const a = getAttachment(id);
    run('delete from attachments where id = ?', id);
    touchCard(a.cardId);
    // Bei einer Wiederholung teilen sich Karten dieselbe Datei: gelöscht wird erst, wenn niemand sie mehr braucht
    const used = (name: string) => !!one('select 1 as x from attachments where file = ? or thumb = ?', name, name);
    return { file: used(a.file) ? null : a.file, thumb: a.thumb && !used(a.thumb) ? a.thumb : null };
  }

  /** Alle Dateinamen im Speicher, auf die noch ein Eintrag verweist (für das Aufräumen) */
  function referencedFiles(): Set<string> {
    const names = new Set<string>();
    for (const r of all('select file, thumb from attachments')) {
      names.add(r.file);
      if (r.thumb) names.add(r.thumb);
    }
    return names;
  }

  function listCompletions(cardId: string, limit = 50): Completion[] {
    return all(
      `select c.*, u.display_name as by_name from completions c left join users u on u.id = c.completed_by
       where c.card_id = ? order by c.completed_at desc, c.rowid desc limit ?`,
      cardId,
      limit,
    ).map((r) => ({
      id: r.id,
      cardId: r.card_id,
      completedBy: r.completed_by,
      completedByName: r.by_name,
      completedAt: r.completed_at,
      dueAt: r.due_at,
      source: r.source,
    }));
  }

  function checkAssignees(ids: unknown): string[] {
    if (!Array.isArray(ids)) throw new ValidationError('Zuständige müssen eine Liste sein');
    const unique = [...new Set(ids as string[])];
    for (const uid of unique) {
      if (!one('select 1 as ok from users where id = ? and is_person = 1', uid)) {
        throw new ValidationError('Zugewiesen werden können nur Personen aus Stups');
      }
    }
    return unique;
  }

  function checkCategories(boardId: string, ids: unknown): string[] {
    if (!Array.isArray(ids)) throw new ValidationError('Kategorien müssen eine Liste sein');
    const unique = [...new Set(ids as string[])];
    for (const cid of unique) {
      if (!one('select 1 as ok from categories where id = ? and board_id = ? and deleted_at is null', cid, boardId)) {
        throw new ValidationError('Die Kategorie gehört nicht zu diesem Board');
      }
    }
    return unique;
  }

  function createCard(boardId: string, input: CardInput, createdBy: string | null): CardDetail {
    visibleBoard(boardId);
    const col = visibleColumn(input.columnId);
    if (col.board_id !== boardId) throw new ValidationError('Die Spalte gehört nicht zu diesem Board');
    const title = cleanText(input.title, 'Der Titel', 200);
    const priority = parsePriority(input.priority);
    const dueAt = parseDue(input.dueAt);
    const recurrence = parseRecurrence(input.recurrence);
    if (recurrence && !dueAt) throw new ValidationError('Eine Wiederholung braucht eine Fälligkeit');
    const remind = parseRemind(input.remindBeforeMin);
    const cost = parseCost(input.costCents);
    const carry = parseCarryOver(input.carryOver);
    const nag = parseBool(input.overdueNag, 'Nachhaken');
    if (remind !== null && !dueAt) throw new ValidationError('Eine Vorab-Erinnerung braucht eine Fälligkeit');
    if (col.is_planned === 1 && !isFutureDue(dueAt)) {
      throw new ValidationError('In „Geplant" kommen nur Karten mit einem Termin nach heute');
    }

    return tx(() => {
      const assignees = checkAssignees(input.assigneeIds ?? []);
      const categories = checkCategories(boardId, input.categoryIds ?? []);
      const id = randomUUID();
      const t = iso();
      run(
        `insert into cards (id, board_id, column_id, position, title, description, priority, due_at, recurrence,
                            remind_before_min, overdue_nag, cost_cents, carry_over, created_by, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        boardId,
        col.id,
        generateKeyBetween(lastPos('cards', 'column_id = ?', col.id), null),
        title,
        input.description ?? null,
        priority,
        dueAt,
        recurrence ? JSON.stringify(recurrence) : null,
        remind,
        nag ? 1 : 0,
        cost,
        carry ? JSON.stringify(carry) : null,
        createdBy,
        t,
        t,
      );
      for (const u of assignees) run('insert into card_assignees (card_id, user_id) values (?, ?)', id, u);
      for (const c of categories) run('insert into card_categories (card_id, category_id) values (?, ?)', id, c);
      syncPlannedCard(id);
      return getCard(id);
    });
  }

  /** Karte in die Spalte für Termine nach heute oder zurück in die erste offene Spalte, je nach Termin. */
  function syncPlannedCard(id: string): void {
    const card = one('select * from cards where id = ? and deleted_at is null', id);
    if (!card || card.completed_at !== null || card.archived_at !== null) return;
    const planned = plannedColumn(card.board_id);
    const inbox = inboxColumn(card.board_id);
    if (!planned || !inbox) return;
    const future = isFutureDue(card.due_at);
    if (card.column_id === inbox.id && future) {
      placeCard(id, planned, undefined);
      touchCard(id);
    } else if (card.column_id === planned.id && !future) {
      placeCard(id, inbox, null);
      touchCard(id);
    }
  }

  /** Markiert eine Karte als vom Wächter angelegt (für die Doppelkarten-Regel und den Verlauf) */
  function setCardOrigin(id: string, origin: { watcherId?: string | null; dedupeKey?: string | null }): void {
    visibleCardRow(id);
    run('update cards set watcher_id = ?, dedupe_key = ? where id = ?', origin.watcherId ?? null, origin.dedupeKey ?? null, id);
  }

  /** Offene Karte (nicht erledigt, nicht gelöscht, nicht archiviert) eines Wächters */
  function openCardOfWatcher(watcherId: string): Card | undefined {
    const r = one(
      'select id from cards where watcher_id = ? and completed_at is null and deleted_at is null and archived_at is null order by created_at desc, rowid desc',
      watcherId,
    );
    return r ? getCard(r.id) : undefined;
  }

  /** Wurde eine Karte dieses Wächters seit diesem Zeitpunkt erledigt? (setzt den Zähler zurück) */
  function watcherCardCompletedSince(watcherId: string, sinceIso: string): boolean {
    return !!one('select 1 as ok from cards where watcher_id = ? and completed_at is not null and completed_at >= ?', watcherId, sinceIso);
  }

  /** Wie viele offene Karten ein Wächter angelegt hat (Sensor) */
  function openWatcherCardCount(): number {
    return (
      one('select count(*) as n from cards where watcher_id is not null and completed_at is null and deleted_at is null and archived_at is null')?.n ?? 0
    );
  }

  /** Offene Karte mit diesem Schlüssel (für Automationen über das Ereignis stups_create_card) */
  function openCardByDedupeKey(key: string): Card | undefined {
    const r = one(
      'select id from cards where dedupe_key = ? and completed_at is null and deleted_at is null and archived_at is null order by created_at desc, rowid desc',
      key,
    );
    return r ? getCard(r.id) : undefined;
  }

  function updateCard(id: string, patch: CardPatch, by: string | null = null): CardDetail {
    const card = visibleCardRow(id);
    return tx(() => {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.title !== undefined) {
        sets.push('title = ?');
        params.push(cleanText(patch.title, 'Der Titel', 200));
      }
      if (patch.description !== undefined) {
        sets.push('description = ?');
        params.push(patch.description);
      }
      if (patch.priority !== undefined) {
        sets.push('priority = ?');
        params.push(parsePriority(patch.priority));
      }
      const dueAt = patch.dueAt !== undefined ? parseDue(patch.dueAt) : (card.due_at as string | null);
      const recurrence =
        patch.recurrence !== undefined
          ? parseRecurrence(patch.recurrence)
          : card.recurrence
            ? (JSON.parse(card.recurrence) as Recurrence)
            : null;
      if (recurrence && !dueAt) throw new ValidationError('Eine Wiederholung braucht eine Fälligkeit');
      if (patch.dueAt !== undefined) {
        sets.push('due_at = ?');
        params.push(dueAt);
        if (dueAt !== card.due_at) logEvent(id, 'due', by, card.due_at, dueAt);
        // Ohne Fälligkeit gibt es nichts, wovor erinnert werden könnte.
        if (dueAt === null && patch.remindBeforeMin === undefined) {
          sets.push('remind_before_min = ?');
          params.push(null);
        }
      }
      if (patch.recurrence !== undefined) {
        sets.push('recurrence = ?');
        params.push(recurrence ? JSON.stringify(recurrence) : null);
      }
      if (patch.remindBeforeMin !== undefined) {
        const remind = parseRemind(patch.remindBeforeMin);
        if (remind !== null && !dueAt) throw new ValidationError('Eine Vorab-Erinnerung braucht eine Fälligkeit');
        sets.push('remind_before_min = ?');
        params.push(remind);
      }
      if (patch.overdueNag !== undefined) {
        sets.push('overdue_nag = ?');
        params.push(parseBool(patch.overdueNag, 'Nachhaken') ? 1 : 0);
      }
      if (patch.costCents !== undefined) {
        sets.push('cost_cents = ?');
        params.push(parseCost(patch.costCents));
      }
      if (patch.carryOver !== undefined) {
        const carry = parseCarryOver(patch.carryOver);
        sets.push('carry_over = ?');
        params.push(carry ? JSON.stringify(carry) : null);
      }
      if (patch.assigneeIds !== undefined) {
        const ids = checkAssignees(patch.assigneeIds);
        run('delete from card_assignees where card_id = ?', id);
        for (const u of ids) run('insert into card_assignees (card_id, user_id) values (?, ?)', id, u);
      }
      if (patch.categoryIds !== undefined) {
        const ids = checkCategories(card.board_id, patch.categoryIds);
        run('delete from card_categories where card_id = ?', id);
        for (const c of ids) run('insert into card_categories (card_id, category_id) values (?, ?)', id, c);
      }
      run(
        `update cards set ${[...sets, 'updated_at = ?', 'version = version + 1'].join(', ')} where id = ?`,
        ...params,
        iso(),
        id,
      );
      syncPlannedCard(id);
      return getCard(id);
    });
  }

  /**
   * Kopie einer Karte: Felder, Zuweisung, Kategorien, Checkliste (zurückgesetzt) und Links.
   * Nicht kopiert werden Kommentare, Anhänge und der Verlauf. Die Kopie ist immer offen.
   */
  function duplicateCard(id: string, by: string | null): CardDetail {
    const src = visibleCardRow(id);
    return tx(() => {
      const newId = randomUUID();
      const t = iso();
      const sameColumn = src.completed_at === null;
      const col = sameColumn ? visibleColumn(src.column_id) : firstOpenColumn(src.board_id);
      const next = sameColumn
        ? (one(
            `select position from cards where column_id = ? and deleted_at is null and archived_at is null
             and position > ? order by position limit 1`,
            col.id,
            src.position,
          )?.position as string | undefined)
        : undefined;
      const position = sameColumn
        ? generateKeyBetween(src.position, next ?? null)
        : generateKeyBetween(lastPos('cards', 'column_id = ?', col.id), null);
      run(
        `insert into cards (id, board_id, column_id, position, title, description, priority, due_at, recurrence,
                            remind_before_min, overdue_nag, cost_cents, carry_over, created_by, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId,
        src.board_id,
        col.id,
        position,
        `${src.title} (Kopie)`.slice(0, 200),
        src.description,
        src.priority,
        src.due_at,
        src.recurrence,
        src.remind_before_min,
        src.overdue_nag,
        src.cost_cents,
        src.carry_over,
        by,
        t,
        t,
      );
      run('insert into card_assignees (card_id, user_id) select ?, user_id from card_assignees where card_id = ?', newId, id);
      run(
        `insert into card_categories (card_id, category_id)
         select ?, cc.category_id from card_categories cc
         join categories c on c.id = cc.category_id and c.deleted_at is null where cc.card_id = ?`,
        newId,
        id,
      );
      for (const item of all('select text, position from checklist_items where card_id = ? order by position, id', id)) {
        run(
          'insert into checklist_items (id, card_id, text, done, position) values (?, ?, ?, 0, ?)',
          randomUUID(),
          newId,
          item.text,
          item.position,
        );
      }
      for (const l of all('select url, title, kind, position from links where card_id = ? order by position, id', id)) {
        run(
          'insert into links (id, card_id, url, title, kind, position) values (?, ?, ?, ?, ?, ?)',
          randomUUID(),
          newId,
          l.url,
          l.title,
          l.kind,
          l.position,
        );
      }
      syncPlannedCard(newId);
      return getCard(newId);
    });
  }

  function touchCard(id: string): void {
    run('update cards set updated_at = ?, version = version + 1 where id = ?', iso(), id);
  }

  /** Setzt Spalte und Position. Erhöht die Version nicht, das macht der Aufrufer über touchCard. */
  function placeCard(id: string, col: Row, afterId: string | null | undefined): void {
    const others = all(
      'select id, position from cards where column_id = ? and deleted_at is null and archived_at is null and id <> ? order by position, id',
      col.id,
      id,
    ) as { id: string; position: string }[];
    const { prev, next } = neighbours(others, afterId);
    run('update cards set column_id = ?, position = ? where id = ?', col.id, generateKeyBetween(prev, next), id);
  }

  function moveCard(
    id: string,
    to: { columnId: string; afterId?: string | null },
    by: string | null = null,
  ): CardDetail {
    const card = visibleCardRow(id);
    const col = visibleColumn(to.columnId);
    if (col.board_id !== card.board_id) throw new ValidationError('Die Spalte gehört nicht zu diesem Board');
    return tx(() => {
      // „Geplant" nimmt nur Karten mit Termin nach heute, und solche Karten gehören nicht nach „Offen":
      // Wer dort ablegt, was nicht passt, landet in der passenden Nachbarspalte.
      const planned = plannedColumn(card.board_id);
      const inbox = inboxColumn(card.board_id);
      let target = col;
      if (planned && inbox && card.completed_at === null) {
        if (col.id === planned.id && !isFutureDue(card.due_at)) target = inbox;
        else if (col.id === inbox.id && isFutureDue(card.due_at)) target = planned;
      }
      const afterId = target.id === col.id ? to.afterId : target.id === planned?.id ? undefined : null;

      const entersDone = target.is_done === 1 && card.completed_at === null;
      // Eine wiederkehrende Karte bleibt nie in der Erledigt-Spalte: Ablegen dort heißt "erledigen".
      if (entersDone && card.recurrence) return completeCard(id, { by, source: 'app' }).card;

      const snapshot = entersDone ? snapshotOf(card) : null;
      const fromName = columnName(card.column_id);
      placeCard(id, target, afterId);
      if (snapshot) {
        run('update cards set completed_at = ?, archived_at = null where id = ?', iso(), id);
        recordCompletion(id, by, 'app', card.due_at, snapshot);
        closeOpenNudges(id, by, true);
      } else if (target.is_done === 0 && card.completed_at !== null) {
        run('update cards set completed_at = null, archived_at = null where id = ?', id);
        logEvent(id, 'reopened', by, fromName, target.name);
      } else if (target.id !== card.column_id) {
        logEvent(id, 'moved', by, fromName, target.name);
      }
      touchCard(id);
      return getCard(id);
    });
  }

  // ---------- erledigen ----------

  interface Snapshot {
    columnId: string;
    position: string;
    dueAt: string | null;
    completedAt: string | null;
    archivedAt: string | null;
    checklistDone: string[];
    /** Wiederholungsregel vor dem Erledigen (JSON). Fehlt bei Erledigungen aus Versionen vor 0.12. */
    recurrence?: string | null;
    /** Die bei der Wiederholung angelegte Karte, die „Rückgängig" wieder entfernt */
    spawnedId?: string | null;
  }

  function snapshotOf(card: Row): Snapshot {
    return {
      columnId: card.column_id,
      position: card.position,
      dueAt: card.due_at,
      completedAt: card.completed_at,
      archivedAt: card.archived_at,
      checklistDone: all('select id from checklist_items where card_id = ? and done = 1', card.id).map((r) => r.id as string),
      recurrence: card.recurrence,
    };
  }

  /**
   * Legt die nächste Karte einer wiederkehrenden Karte an: Titel, Zuweisung, Kategorien, Priorität, Wiederholung und
   * Erinnerungen immer, den Rest nur laut Auswahl der Karte. Fotos teilen sich die Datei mit der erledigten Karte.
   */
  function spawnNextCard(src: Row, nextDueAt: string): string {
    const carry = resolveCarry(src.carry_over);
    const newId = randomUUID();
    const t = iso();
    const planned = plannedColumn(src.board_id);
    const toPlanned = !!planned && isFutureDue(nextDueAt);
    const col = toPlanned ? planned! : firstOpenColumn(src.board_id);
    run(
      `insert into cards (id, board_id, column_id, position, title, description, priority, due_at, recurrence,
                          remind_before_min, overdue_nag, cost_cents, carry_over, repeated_from, created_by, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId,
      src.board_id,
      col.id,
      generateKeyBetween(lastPos('cards', 'column_id = ?', col.id), null),
      src.title,
      carry.includes('description') ? src.description : null,
      src.priority,
      nextDueAt,
      src.recurrence,
      src.remind_before_min,
      src.overdue_nag,
      carry.includes('cost') ? src.cost_cents : null,
      src.carry_over,
      src.id,
      src.created_by,
      t,
      t,
    );
    run('insert into card_assignees (card_id, user_id) select ?, user_id from card_assignees where card_id = ?', newId, src.id);
    run(
      `insert into card_categories (card_id, category_id)
       select ?, cc.category_id from card_categories cc
       join categories c on c.id = cc.category_id and c.deleted_at is null where cc.card_id = ?`,
      newId,
      src.id,
    );
    if (carry.includes('checklist')) {
      for (const item of all('select text, position from checklist_items where card_id = ? order by position, id', src.id)) {
        run('insert into checklist_items (id, card_id, text, done, position) values (?, ?, ?, 0, ?)', randomUUID(), newId, item.text, item.position);
      }
    }
    if (carry.includes('links')) {
      for (const l of all('select url, title, kind, position from links where card_id = ? order by position, id', src.id)) {
        run('insert into links (id, card_id, url, title, kind, position) values (?, ?, ?, ?, ?, ?)', randomUUID(), newId, l.url, l.title, l.kind, l.position);
      }
    }
    if (carry.includes('attachments')) {
      for (const a of all('select * from attachments where card_id = ? order by created_at, rowid', src.id)) {
        run(
          `insert into attachments (id, card_id, filename, mime, size, file, thumb, created_by, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          randomUUID(),
          newId,
          a.filename,
          a.mime,
          a.size,
          a.file,
          a.thumb,
          a.created_by,
          a.created_at,
        );
      }
    }
    if (carry.includes('comments')) {
      for (const c of all('select author_id, text, created_at, edited_at from comments where card_id = ? order by created_at, rowid', src.id)) {
        run(
          'insert into comments (id, card_id, author_id, text, created_at, edited_at) values (?, ?, ?, ?, ?, ?)',
          randomUUID(),
          newId,
          c.author_id,
          c.text,
          c.created_at,
          c.edited_at,
        );
      }
    }
    placeCard(newId, col, toPlanned ? undefined : null);
    return newId;
  }

  function recordCompletion(
    cardId: string,
    by: string | null,
    source: CompletionSource,
    dueAt: string | null,
    snapshot: Snapshot,
  ): string {
    const id = randomUUID();
    run(
      'insert into completions (id, card_id, completed_by, completed_at, due_at, source, snapshot) values (?, ?, ?, ?, ?, ?, ?)',
      id,
      cardId,
      by,
      iso(),
      dueAt,
      source,
      JSON.stringify(snapshot),
    );
    return id;
  }

  function firstOpenColumn(boardId: string): Row {
    const cols = visibleColumns(boardId);
    const col = cols.find((c) => c.is_done !== 1 && c.is_planned !== 1) ?? cols.find((c) => c.is_done !== 1) ?? cols[0];
    if (!col) throw new ConflictError('Das Board hat keine Spalte');
    return col;
  }

  function completeCard(id: string, ctx: { by: string | null; source: CompletionSource }): CompleteResult {
    const card = visibleCardRow(id);
    const recurrence = card.recurrence ? (JSON.parse(card.recurrence) as Recurrence) : null;
    if (!recurrence && card.completed_at !== null) {
      return { card: getCard(id), completionId: null, nextDueAt: null, nextCardId: null };
    }
    return tx(() => {
      const snapshot = snapshotOf(card);
      let nextDueAt: string | null = null;
      let nextCardId: string | null = null;
      // Offene Stupse gehören zur erledigten Karte; die Absender bekommen eine Rückmeldung
      closeOpenNudges(id, ctx.by, true);
      if (recurrence) {
        // Die erledigte Karte bleibt als Nachweis in „Erledigt" (ohne Wiederholung), eine neue Karte
        // mit dem nächsten Termin übernimmt: oben in „Offen" oder, bei Termin nach heute, in „Geplant"
        nextDueAt = nextDue(recurrence, card.due_at ?? iso(), iso(), timeZone());
        nextCardId = spawnNextCard(card, nextDueAt);
        snapshot.spawnedId = nextCardId;
        const done = visibleColumns(card.board_id).find((c) => c.is_done === 1);
        if (done && done.id !== card.column_id) placeCard(id, done, null);
        run('update cards set recurrence = null, completed_at = ?, archived_at = null where id = ?', iso(), id);
      } else {
        const done = visibleColumns(card.board_id).find((c) => c.is_done === 1);
        if (done && done.id !== card.column_id) placeCard(id, done, null);
        run('update cards set completed_at = ?, archived_at = null where id = ?', iso(), id);
      }
      const completionId = recordCompletion(id, ctx.by, ctx.source, card.due_at, snapshot);
      touchCard(id);
      return { card: getCard(id), completionId, nextDueAt, nextCardId };
    });
  }

  function undoCompletion(completionId: string): CardDetail {
    const c = one('select * from completions where id = ?', completionId);
    if (!c) throw new NotFoundError('Erledigung nicht gefunden');
    const latest = one(
      'select id from completions where card_id = ? order by completed_at desc, rowid desc limit 1',
      c.card_id,
    );
    if (latest?.id !== c.id) throw new ConflictError('Nur die letzte Erledigung lässt sich rückgängig machen');
    if (!c.snapshot) throw new ConflictError('Diese Erledigung lässt sich nicht rückgängig machen');
    const card = visibleCardRow(c.card_id);
    const snap = JSON.parse(c.snapshot) as Snapshot;
    return tx(() => {
      // Die bei der Wiederholung angelegte Karte verschwindet wieder, solange niemand mit ihr gearbeitet hat
      if (snap.spawnedId) {
        if (one('select 1 as x from completions where card_id = ?', snap.spawnedId)) {
          throw new ConflictError('Die nächste Karte wurde schon erledigt, deshalb lässt sich das nicht mehr rückgängig machen');
        }
        run('delete from cards where id = ?', snap.spawnedId);
      }
      if (snap.recurrence !== undefined) run('update cards set recurrence = ? where id = ?', snap.recurrence, card.id);
      const col = one('select * from columns where id = ? and deleted_at is null', snap.columnId);
      if (col) {
        run('update cards set column_id = ?, position = ? where id = ?', snap.columnId, snap.position, card.id);
      } else {
        placeCard(card.id, firstOpenColumn(card.board_id), null);
      }
      run(
        'update cards set due_at = ?, completed_at = ?, archived_at = ? where id = ?',
        snap.dueAt,
        snap.completedAt,
        snap.archivedAt,
        card.id,
      );
      run('update checklist_items set done = 0 where card_id = ?', card.id);
      for (const itemId of snap.checklistDone) run('update checklist_items set done = 1 where id = ?', itemId);
      run('delete from completions where id = ?', completionId);
      touchCard(card.id);
      return getCard(card.id);
    });
  }

  function archiveDone(): number {
    const rows = all(
      `select c.id, c.completed_at, b.archive_after_days as days
       from cards c join boards b on b.id = c.board_id
       where c.deleted_at is null and c.archived_at is null and c.completed_at is not null
         and b.deleted_at is null and b.archive_after_days > 0`,
    );
    let n = 0;
    for (const r of rows) {
      if (Date.parse(r.completed_at) + r.days * 86_400_000 <= now().getTime()) {
        run('update cards set archived_at = ?, updated_at = ?, version = version + 1 where id = ?', iso(), iso(), r.id);
        n++;
      }
    }
    return n;
  }

  function restoreArchived(cardId: string, columnId: string, by: string | null = null): CardDetail {
    const card = visibleCardRow(cardId);
    if (card.archived_at === null) throw new ConflictError('Die Karte ist nicht archiviert');
    const col = visibleColumn(columnId);
    if (col.board_id !== card.board_id) throw new ValidationError('Die Spalte gehört nicht zu diesem Board');
    return tx(() => {
      placeCard(cardId, col, null);
      run('update cards set archived_at = null, completed_at = null where id = ?', cardId);
      logEvent(cardId, 'reopened', by, columnName(card.column_id), col.name);
      touchCard(cardId);
      return getCard(cardId);
    });
  }

  function deleteCard(id: string): void {
    visibleCardRow(id);
    run('update cards set deleted_at = ?, updated_at = ?, version = version + 1 where id = ?', iso(), iso(), id);
    closeOpenNudges(id, null, false);
  }

  function setArchived(id: string, archived: boolean): void {
    visibleCardRow(id);
    run(
      'update cards set archived_at = ?, updated_at = ?, version = version + 1 where id = ?',
      archived ? iso() : null,
      iso(),
      id,
    );
  }

  /**
   * Alle Karten mit Termin über alle Boards (für Agenda und Kalender), nach Termin sortiert.
   * `from` ist eingeschlossen, `to` ausgeschlossen; ohne `from` kommt auch alles Überfällige.
   */
  function listSchedule(opts: { boardIds?: string[]; from?: string; to?: string; includeDone?: boolean }): ScheduleCard[] {
    const where = ['due_at is not null', 'deleted_at is null', 'archived_at is null', 'board_id in (select id from boards where deleted_at is null)'];
    const params: unknown[] = [];
    if (!opts.includeDone) where.push('completed_at is null');
    if (opts.from) {
      where.push('due_at >= ?');
      params.push(new Date(opts.from).toISOString());
    }
    if (opts.to) {
      where.push('due_at < ?');
      params.push(new Date(opts.to).toISOString());
    }
    if (opts.boardIds && opts.boardIds.length > 0) {
      where.push(`board_id in (${opts.boardIds.map(() => '?').join(', ')})`);
      params.push(...opts.boardIds);
    }
    const boards = new Map(all('select id, name, color from boards where deleted_at is null').map((b) => [b.id as string, b]));
    return loadCards(where.join(' and '), ...params)
      .map((c) => ({ ...c, boardName: boards.get(c.boardId)?.name ?? '', boardColor: (boards.get(c.boardId)?.color as string | null) ?? null }))
      .sort((a, b) => (a.dueAt === b.dueAt ? (a.id < b.id ? -1 : 1) : a.dueAt! < b.dueAt! ? -1 : 1));
  }

  function listArchived(boardId: string): Card[] {
    visibleBoard(boardId);
    return loadCards('board_id = ? and deleted_at is null and archived_at is not null', boardId).sort((a, b) =>
      (b.archivedAt ?? '') < (a.archivedAt ?? '') ? -1 : 1,
    );
  }

  function getBoardView(boardId: string): BoardView {
    const board = visibleBoard(boardId);
    return {
      board: toBoard(board),
      columns: visibleColumns(boardId).map(toColumn),
      categories: all(
        'select * from categories where board_id = ? and deleted_at is null order by position, id',
        boardId,
      ).map(toCategory),
      cards: loadCards('board_id = ? and deleted_at is null and archived_at is null', boardId),
      costTotalCents: Number(
        one(
          'select coalesce(sum(cost_cents), 0) as total from cards where board_id = ? and deleted_at is null',
          boardId,
        )!.total,
      ),
    };
  }

  // ---------- Kommentare ----------

  const toComment = (r: Row): Comment => ({
    id: r.id,
    cardId: r.card_id,
    authorId: r.author_id,
    authorName: r.author_name ?? null,
    text: r.text,
    createdAt: r.created_at,
    editedAt: r.edited_at,
  });

  const commentRow = (id: string): Row => {
    const r = one(
      `select c.*, u.display_name as author_name from comments c left join users u on u.id = c.author_id where c.id = ?`,
      id,
    );
    if (!r) throw new NotFoundError('Kommentar nicht gefunden');
    return r;
  };

  function addComment(cardId: string, authorId: string | null, text: string): Comment {
    visibleCardRow(cardId);
    const clean = cleanText(text, 'Der Kommentar', 2000);
    const id = randomUUID();
    run('insert into comments (id, card_id, author_id, text, created_at) values (?, ?, ?, ?, ?)', id, cardId, authorId, clean, iso());
    touchCard(cardId);
    return toComment(commentRow(id));
  }

  function listComments(cardId: string): Comment[] {
    visibleCardRow(cardId);
    return all(
      `select c.*, u.display_name as author_name from comments c left join users u on u.id = c.author_id
       where c.card_id = ? order by c.created_at, c.rowid`,
      cardId,
    ).map(toComment);
  }

  function updateComment(id: string, text: string): Comment {
    const c = commentRow(id);
    run('update comments set text = ?, edited_at = ? where id = ?', cleanText(text, 'Der Kommentar', 2000), iso(), id);
    touchCard(c.card_id);
    return toComment(commentRow(id));
  }

  function deleteComment(id: string): void {
    const c = commentRow(id);
    run('delete from comments where id = ?', id);
    touchCard(c.card_id);
  }

  // ---------- Einstellungen ----------

  function getSettings(): Settings {
    const get = (k: string) => (one('select value from settings where key = ?', k)?.value as string | undefined) ?? null;
    return { dashboardPath: get('dashboardPath'), panelPath: get('panelPath') };
  }

  function setSettings(patch: Partial<Settings>): Settings {
    for (const key of ['dashboardPath', 'panelPath'] as const) {
      const value = patch[key];
      if (value === undefined) continue;
      if (value === null) {
        run('delete from settings where key = ?', key);
        continue;
      }
      if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.length > 200) {
        throw new ValidationError('Der Pfad muss mit / beginnen');
      }
      run('insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value', key, value);
    }
    return getSettings();
  }

  // ---------- Benachrichtigungen ----------

  function openDueCards(): OpenDueCard[] {
    const rows = all(
      `select c.id, c.title, c.board_id, b.name as board_name, c.due_at, c.remind_before_min, c.overdue_nag
       from cards c join boards b on b.id = c.board_id
       where c.deleted_at is null and c.archived_at is null and c.completed_at is null
         and c.due_at is not null and b.deleted_at is null
       order by c.due_at, c.id`,
    );
    const assignees = new Map<string, string[]>();
    for (const r of all(
      `select ca.card_id, ca.user_id from card_assignees ca join users u on u.id = ca.user_id and u.is_person = 1 order by ca.rowid`,
    )) {
      assignees.set(r.card_id, [...(assignees.get(r.card_id) ?? []), r.user_id]);
    }
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      boardId: r.board_id,
      boardName: r.board_name,
      dueAt: r.due_at,
      remindBeforeMin: r.remind_before_min,
      overdueNag: r.overdue_nag === 1,
      assigneeIds: assignees.get(r.id) ?? [],
    }));
  }

  /** Legt den Eintrag an. false = es gab ihn schon (also nicht noch einmal senden). */
  function claimNotification(k: NotificationKey, status: 'sent' | 'skipped' | 'failed' = 'sent'): boolean {
    return (
      Number(
        run(
          `insert or ignore into sent_notifications (card_id, user_id, kind, occurrence_key, status, sent_at)
           values (?, ?, ?, ?, ?, ?)`,
          k.cardId,
          k.userId,
          k.kind,
          k.key,
          status,
          iso(),
        ).changes,
      ) > 0
    );
  }

  /** Letzte Einträge des Sendeprotokolls, neueste zuerst (für die Übersicht in den Einstellungen). */
  function recentNotifications(limit = 20): RecentNotification[] {
    return all(
      `select n.kind, n.status, n.sent_at, n.occurrence_key, c.title, u.name as user_name
       from sent_notifications n
       left join cards c on c.id = n.card_id
       left join users u on u.id = n.user_id
       order by n.id desc limit ?`,
      limit,
    ).map((r) => ({
      kind: r.kind,
      status: r.status,
      at: r.sent_at,
      title: r.kind === 'summary' ? 'Tageszusammenfassung' : (r.title ?? '(Karte gelöscht)'),
      user: r.user_name ?? '?',
    }));
  }

  function releaseNotification(k: NotificationKey): void {
    run(
      'delete from sent_notifications where card_id = ? and user_id = ? and kind = ? and occurrence_key = ?',
      k.cardId,
      k.userId,
      k.kind,
      k.key,
    );
  }

  function userByHaId(haId: string): User | null {
    const r = one('select * from users where ha_user_id = ?', haId);
    return r ? toUser(r) : null;
  }

  function userById(id: string): User | null {
    const r = one('select * from users where id = ?', id);
    return r ? toUser(r) : null;
  }

  // ---------- Stupsen ----------

  const toNudge = (r: Row): Nudge => ({
    id: r.id,
    cardId: r.card_id,
    fromId: r.from_user,
    toId: r.to_user,
    template: r.template,
    text: r.text,
    createdAt: r.created_at,
    deliverAt: r.deliver_at,
    deliveredAt: r.delivered_at,
    deliveredRound: r.delivered_round,
    laterCount: r.later_count,
    reply: r.reply,
    replyAt: r.reply_at,
  });

  const getNudge = (id: string): Nudge | undefined => {
    const r = one('select * from nudges where id = ?', id);
    return r ? toNudge(r) : undefined;
  };

  const OPEN_CARD = 'c.deleted_at is null and c.archived_at is null and c.completed_at is null';

  /** Bis wann die Sperrzeit für dieses Paar an dieser Karte noch gilt (null = darf stupsen) */
  function nudgeCooldownEnd(cardId: string, fromId: string, toId: string, nowMs: number): number | null {
    const last = one('select max(created_at) as t from nudges where card_id = ? and from_user = ? and to_user = ?', cardId, fromId, toId);
    if (!last?.t) return null;
    const end = Date.parse(last.t as string) + NUDGE_COOLDOWN_MS;
    return end > nowMs ? end : null;
  }

  const hasDevice = (u: Row): boolean => (JSON.parse(u.notify_services ?? '[]') as string[]).length > 0;

  /** Frühester Zustellzeitpunkt: sofort, außer der Empfänger hat gerade Ruhezeit */
  const deliverAtFor = (recipient: Row, atMs: number): number => quietEnd(atMs, timeZone(), quietOf(recipient)) ?? atMs;

  function createNudges(
    cardId: string,
    fromId: string,
    input: { to: unknown; template?: unknown; text?: unknown },
  ): { sent: NudgeSent[]; skipped: NudgeSkipped[] } {
    const sender = one('select * from users where id = ?', fromId);
    if (!sender || sender.is_person !== 1) throw new ForbiddenError('Nur Personen von Stups können stupsen');
    const card = visibleCardRow(cardId);
    if (card.completed_at !== null || card.archived_at !== null) throw new ConflictError('Die Karte ist schon erledigt');

    if (input.text !== undefined && input.text !== null && typeof input.text !== 'string') {
      throw new ValidationError('Der Text muss aus Zeichen bestehen');
    }
    const custom = typeof input.text === 'string' ? input.text.trim() : '';
    let template: NudgeTemplate | null = null;
    let text: string;
    if (custom) {
      if (custom.length > NUDGE_TEXT_MAX) throw new ValidationError(`Der Text ist zu lang (höchstens ${NUDGE_TEXT_MAX} Zeichen)`);
      text = custom;
    } else {
      if (typeof input.template !== 'string' || !(input.template in NUDGE_TEMPLATES)) {
        throw new ValidationError('Bitte eine Nachricht wählen oder schreiben');
      }
      template = input.template as NudgeTemplate;
      text = NUDGE_TEMPLATES[template];
    }
    if (!Array.isArray(input.to) || input.to.length === 0) throw new ValidationError('Bitte mindestens eine Person wählen');
    const recipients = [...new Set(input.to as string[])];

    return tx(() => {
      const nowMs = now().getTime();
      const sent: NudgeSent[] = [];
      const skipped: NudgeSkipped[] = [];
      for (const toId of recipients) {
        if (toId === fromId) {
          skipped.push({ to: toId, reason: 'self', retryAt: null });
          continue;
        }
        const to = typeof toId === 'string' ? one('select * from users where id = ?', toId) : undefined;
        if (!to || to.is_person !== 1) {
          skipped.push({ to: toId, reason: 'no_person', retryAt: null });
          continue;
        }
        if (!hasDevice(to)) {
          skipped.push({ to: toId, reason: 'no_device', retryAt: null });
          continue;
        }
        const cooldown = nudgeCooldownEnd(cardId, fromId, toId, nowMs);
        if (cooldown !== null) {
          skipped.push({ to: toId, reason: 'rate', retryAt: new Date(cooldown).toISOString() });
          continue;
        }
        const id = randomUUID();
        const deliverMs = deliverAtFor(to, nowMs);
        run(
          `insert into nudges (id, card_id, from_user, to_user, template, text, created_at, deliver_at)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          cardId,
          fromId,
          toId,
          template,
          text,
          new Date(nowMs).toISOString(),
          new Date(deliverMs).toISOString(),
        );
        sent.push({ nudgeId: id, to: toId, status: deliverMs > nowMs ? 'queued' : 'sent', deliverAt: new Date(deliverMs).toISOString() });
      }
      return { sent, skipped };
    });
  }

  /** Wer in der Stups-Auswahl steht, wer vorausgewählt ist und warum jemand (noch) nicht wählbar ist */
  function nudgeTargets(cardId: string, fromId: string): NudgeTarget[] {
    visibleCardRow(cardId);
    const nowMs = now().getTime();
    const assigned = new Set(all('select user_id from card_assignees where card_id = ?', cardId).map((r) => r.user_id as string));
    const others = all('select * from users where is_person = 1 and id <> ? order by created_at, rowid', fromId);
    const targets = others.map((u): NudgeTarget => {
      const cooldown = hasDevice(u) ? nudgeCooldownEnd(cardId, fromId, u.id, nowMs) : null;
      const reason = !hasDevice(u) ? 'no_device' : cooldown !== null ? 'rate' : null;
      const deliverMs = reason === null ? deliverAtFor(u, nowMs) : nowMs;
      return {
        id: u.id,
        name: u.display_name,
        color: u.color,
        selectable: reason === null,
        reason,
        retryAt: cooldown !== null ? new Date(cooldown).toISOString() : null,
        deliverAt: reason === null && deliverMs > nowMs ? new Date(deliverMs).toISOString() : null,
        preselected: false,
      };
    });
    const assignedOthers = targets.filter((t) => assigned.has(t.id));
    const selectable = targets.filter((t) => t.selectable);
    if (assignedOthers.length > 0) {
      for (const t of assignedOthers) t.preselected = t.selectable;
    } else if (selectable.length === 1) {
      selectable[0]!.preselected = true;
    }
    return targets;
  }

  /** Stupse, die jetzt zugestellt werden sollen (noch nicht beantwortet, Karte offen, Empfänger ist Person) */
  function dueNudges(): DueNudge[] {
    return all(
      `select n.*, c.title as card_title, f.display_name as from_name
       from nudges n
       join cards c on c.id = n.card_id
       join users f on f.id = n.from_user
       join users t on t.id = n.to_user and t.is_person = 1
       where n.reply is null and n.delivered_round < n.later_count and n.deliver_at <= ? and ${OPEN_CARD}
       order by n.deliver_at, n.rowid`,
      now().toISOString(),
    ).map((r) => ({
      id: r.id,
      cardId: r.card_id,
      cardTitle: r.card_title,
      fromId: r.from_user,
      fromName: r.from_name,
      toId: r.to_user,
      text: r.text,
      round: r.later_count,
      laterCount: r.later_count,
    }));
  }

  /** Merkt die Zustellung vor. false = jemand anderes war schneller (oder es gibt nichts mehr zuzustellen). */
  function claimNudge(id: string, round: number): boolean {
    return (
      Number(
        run('update nudges set delivered_round = ?, delivered_at = ? where id = ? and reply is null and delivered_round < ?', round, iso(), id, round)
          .changes,
      ) > 0
    );
  }

  /** Nimmt eine Vormerkung zurück, wenn das Senden nicht geklappt hat */
  function releaseNudge(id: string, round: number): void {
    run('update nudges set delivered_round = ? where id = ? and delivered_round = ?', round - 1, id, round);
  }

  /** Antwort des Empfängers auf „Mach ich" oder „Später". Alles Veraltete wird mit „stale" abgewiesen. */
  function replyNudge(
    id: string,
    userId: string,
    action: 'ack' | 'later',
  ): { outcome: 'ok' | 'stale' | 'forbidden'; nudge?: Nudge } {
    const n = one('select * from nudges where id = ?', id);
    if (!n) return { outcome: 'stale' };
    if (n.to_user !== userId) return { outcome: 'forbidden' };
    const open = one(`select 1 as x from cards c where c.id = ? and ${OPEN_CARD}`, n.card_id);
    if (n.reply !== null || !open) return { outcome: 'stale' };

    const nowMs = now().getTime();
    if (action === 'ack') {
      run("update nudges set reply = 'ack', reply_at = ? where id = ?", new Date(nowMs).toISOString(), id);
    } else {
      if (n.later_count >= NUDGE_LATER_MAX) return { outcome: 'stale' };
      const wanted = nowMs + NUDGE_LATER_MS;
      const recipient = one('select * from users where id = ?', userId)!;
      const deliverMs = quietEnd(wanted, timeZone(), quietOf(recipient)) ?? wanted;
      const log = [...(JSON.parse(n.later_log) as string[]), new Date(nowMs).toISOString()];
      run(
        'update nudges set later_count = later_count + 1, deliver_at = ?, later_log = ? where id = ?',
        new Date(deliverMs).toISOString(),
        JSON.stringify(log),
        id,
      );
    }
    return { outcome: 'ok', nudge: getNudge(id) };
  }

  /**
   * Schließt alle offenen Stupse einer Karte. announce = die Karte wurde erledigt: Wer selbst erledigt hat, hat
   * „erledigt" geantwortet, die übrigen sind geschlossen, und die Absender bekommen eine Rückmeldung.
   */
  function closeOpenNudges(cardId: string, byId: string | null, announce: boolean): void {
    const rows = all(
      `select n.*, c.title as card_title from nudges n join cards c on c.id = n.card_id
       where n.card_id = ? and n.reply is null order by n.created_at, n.rowid`,
      cardId,
    );
    for (const r of rows) {
      const reply = announce && byId !== null && r.to_user === byId ? 'done' : 'closed';
      run('update nudges set reply = ?, reply_at = ? where id = ?', reply, iso(), r.id);
      if (announce) {
        pendingClosed.push({ nudgeId: r.id, cardId, cardTitle: r.card_title, fromId: r.from_user, toId: r.to_user, byId });
      }
    }
  }

  const closeNudgesOfUser = (userId: string) =>
    run("update nudges set reply = 'closed', reply_at = ? where reply is null and (from_user = ? or to_user = ?)", iso(), userId, userId);

  /** Alle, die zu dieser Karte je einen Stups bekommen haben (für das Abräumen der Nachrichten) */
  const nudgeRecipients = (cardId: string): string[] =>
    all('select distinct to_user from nudges where card_id = ?', cardId).map((r) => r.to_user as string);

  function openNudgeCounts(): { total: number; byUser: Record<string, number> } {
    const rows = all(
      `select n.to_user, count(*) as n from nudges n join cards c on c.id = n.card_id
       where n.reply is null and ${OPEN_CARD} group by n.to_user`,
    );
    const byUser: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byUser[r.to_user] = r.n;
      total += r.n;
    }
    return { total, byUser };
  }

  /** Offene Stupse mit Karte und Absender (für die Attribute der Sensoren) */
  function openNudgeList(): { toId: string; card: string; from: string; since: string }[] {
    return all(
      `select n.to_user, n.created_at, c.title as card_title, f.display_name as from_name
       from nudges n join cards c on c.id = n.card_id join users f on f.id = n.from_user
       where n.reply is null and ${OPEN_CARD} order by n.created_at, n.rowid`,
    ).map((r) => ({ toId: r.to_user, card: r.card_title, from: r.from_name, since: r.created_at }));
  }

  function recentNudges(limit = 15): RecentNudge[] {
    const nowIso = now().toISOString();
    return all(
      `select n.*, c.title as card_title, f.display_name as from_name, t.display_name as to_name
       from nudges n join cards c on c.id = n.card_id
       join users f on f.id = n.from_user join users t on t.id = n.to_user
       order by n.created_at desc, n.rowid desc limit ?`,
      limit,
    ).map((r) => ({
      title: r.card_title,
      from: r.from_name,
      to: r.to_name,
      at: r.created_at,
      deliverAt: r.deliver_at,
      state:
        r.reply === 'closed' ? 'geschlossen' : r.reply !== null ? 'beantwortet' : r.deliver_at > nowIso ? 'wartet' : 'offen',
    }));
  }

  function setNudgeQuiet(userId: string, patch: { start?: unknown; end?: unknown; off?: unknown }): User {
    userRow(userId);
    if (patch.start !== undefined) {
      if (!isHm(patch.start)) throw new ValidationError('Der Beginn der Ruhezeit braucht die Form HH:MM');
      run('update users set nudge_quiet_start = ? where id = ?', patch.start, userId);
    }
    if (patch.end !== undefined) {
      if (!isHm(patch.end)) throw new ValidationError('Das Ende der Ruhezeit braucht die Form HH:MM');
      run('update users set nudge_quiet_end = ? where id = ?', patch.end, userId);
    }
    if (patch.off !== undefined) {
      if (typeof patch.off !== 'boolean') throw new ValidationError('„Ruhezeit aus" muss wahr oder falsch sein');
      run('update users set nudge_quiet_off = ? where id = ?', patch.off ? 1 : 0, userId);
    }
    return toUser(userRow(userId));
  }

  /** Verlauf einer Karte aus den Stupsen: der Stups selbst, „Später" und „Mach ich" */
  function nudgeActivity(cardId: string): ActivityEntry[] {
    const out: ActivityEntry[] = [];
    for (const r of all(
      `select n.*, f.display_name as from_name, t.display_name as to_name
       from nudges n join users f on f.id = n.from_user join users t on t.id = n.to_user
       where n.card_id = ? order by n.created_at, n.rowid`,
      cardId,
    )) {
      out.push({ id: `nudge-${r.id}`, kind: 'nudged', at: r.created_at, byName: r.from_name, to: r.to_name, text: r.text });
      (JSON.parse(r.later_log) as string[]).forEach((at, i) =>
        out.push({ id: `nudge-${r.id}-later-${i}`, kind: 'nudge_reply', at, byName: r.to_name, text: 'Später' }),
      );
      if (r.reply === 'ack') out.push({ id: `nudge-${r.id}-ack`, kind: 'nudge_reply', at: r.reply_at, byName: r.to_name, text: 'Mach ich' });
    }
    return out;
  }

  // ---------- checklist ----------

  function addChecklistItem(cardId: string, text: string): ChecklistItem {
    visibleCardRow(cardId);
    const clean = cleanText(text, 'Der Text', 200);
    return tx(() => {
      const id = randomUUID();
      run(
        'insert into checklist_items (id, card_id, text, done, position) values (?, ?, ?, 0, ?)',
        id,
        cardId,
        clean,
        generateKeyBetween(lastPos('checklist_items', 'card_id = ?', cardId), null),
      );
      touchCard(cardId);
      return toItem(one('select * from checklist_items where id = ?', id)!);
    });
  }

  function itemRow(id: string): Row {
    const r = one(
      `select i.* from checklist_items i join cards c on c.id = i.card_id where i.id = ? and c.deleted_at is null`,
      id,
    );
    if (!r) throw new NotFoundError('Eintrag nicht gefunden');
    return r;
  }

  function updateChecklistItem(id: string, patch: { text?: string; done?: boolean }): ChecklistItem {
    const item = itemRow(id);
    return tx(() => {
      if (patch.text !== undefined) {
        run('update checklist_items set text = ? where id = ?', cleanText(patch.text, 'Der Text', 200), id);
      }
      if (patch.done !== undefined) run('update checklist_items set done = ? where id = ?', patch.done ? 1 : 0, id);
      touchCard(item.card_id);
      return toItem(one('select * from checklist_items where id = ?', id)!);
    });
  }

  function deleteChecklistItem(id: string): void {
    const item = itemRow(id);
    run('delete from checklist_items where id = ?', id);
    touchCard(item.card_id);
  }

  // ---------- links ----------

  function addLink(cardId: string, input: { url: string; title?: string | null }): CardLink {
    visibleCardRow(cardId);
    const url = normalizeUrl(input.url);
    const title = input.title?.trim() ? input.title.trim().slice(0, 200) : null;
    return tx(() => {
      const id = randomUUID();
      run(
        'insert into links (id, card_id, url, title, kind, position) values (?, ?, ?, ?, ?, ?)',
        id,
        cardId,
        url,
        title,
        detectLinkKind(url),
        generateKeyBetween(lastPos('links', 'card_id = ?', cardId), null),
      );
      touchCard(cardId);
      return toLink(one('select * from links where id = ?', id)!);
    });
  }

  function linkRow(id: string): Row {
    const r = one('select l.* from links l join cards c on c.id = l.card_id where l.id = ? and c.deleted_at is null', id);
    if (!r) throw new NotFoundError('Link nicht gefunden');
    return r;
  }

  function updateLink(id: string, patch: { url?: string; title?: string | null }): CardLink {
    const link = linkRow(id);
    return tx(() => {
      if (patch.url !== undefined) {
        const url = normalizeUrl(patch.url);
        run('update links set url = ?, kind = ? where id = ?', url, detectLinkKind(url), id);
      }
      if (patch.title !== undefined) {
        run('update links set title = ? where id = ?', patch.title?.trim() ? patch.title.trim().slice(0, 200) : null, id);
      }
      touchCard(link.card_id);
      return toLink(one('select * from links where id = ?', id)!);
    });
  }

  /** Gespeicherte Google-Kurzlinks (für die einmalige Reparatur beim Start) */
  function listShortMapsLinks(): { id: string; url: string; title: string | null }[] {
    return all(
      `select l.id, l.url, l.title from links l join cards c on c.id = l.card_id
       where c.deleted_at is null and (l.url like 'https://maps.app.goo.gl/%' or l.url like 'https://goo.gl/maps/%')`,
    ).map((r) => ({ id: r.id, url: r.url, title: r.title }));
  }

  function deleteLink(id: string): void {
    const link = linkRow(id);
    run('delete from links where id = ?', id);
    touchCard(link.card_id);
  }

  // ---------- trash ----------

  const purgeAt = (deletedAt: string) =>
    new Date(Date.parse(deletedAt) + TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();

  function listTrash(): TrashItem[] {
    const rows: Row[] = [
      ...all("select 'board' as type, id, name as title, id as board_id, deleted_at from boards where deleted_at is not null"),
      ...all("select 'column' as type, id, name as title, board_id, deleted_at from columns where deleted_at is not null"),
      ...all("select 'category' as type, id, name as title, board_id, deleted_at from categories where deleted_at is not null"),
      ...all("select 'card' as type, id, title, board_id, deleted_at from cards where deleted_at is not null"),
    ];
    return rows
      .map((r) => ({
        type: r.type as TrashType,
        id: r.id as string,
        title: r.title as string,
        boardId: r.board_id as string,
        deletedAt: r.deleted_at as string,
        purgeAt: purgeAt(r.deleted_at),
      }))
      .sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : 0));
  }

  function restoreFromTrash(type: TrashType, id: string): void {
    const table = { board: 'boards', column: 'columns', category: 'categories', card: 'cards' }[type];
    if (!table) throw new ValidationError('Unbekannter Typ');
    const row = one(`select * from ${table} where id = ? and deleted_at is not null`, id);
    if (!row) throw new NotFoundError('Nicht im Papierkorb');
    tx(() => {
      if (type !== 'board') {
        const board = one('select deleted_at from boards where id = ?', row.board_id);
        if (board?.deleted_at) throw new ConflictError('Das Board ist gelöscht. Bitte zuerst das Board wiederherstellen');
      }
      if (type === 'card') {
        const col = one('select deleted_at from columns where id = ?', row.column_id);
        if (col?.deleted_at) {
          const first = visibleColumns(row.board_id)[0];
          if (!first) throw new ConflictError('Das Board hat keine Spalte');
          run('update cards set column_id = ?, position = ? where id = ?', first.id, generateKeyBetween(lastPos('cards', 'column_id = ?', first.id), null), id);
        }
        run('update cards set deleted_at = null, updated_at = ?, version = version + 1 where id = ?', iso(), id);
      } else if (type === 'column') {
        const hasDone = one('select 1 as ok from columns where board_id = ? and is_done = 1 and deleted_at is null', row.board_id);
        if (row.is_done === 1 && hasDone) run('update columns set is_done = 0 where id = ?', id);
        const hasPlanned = one('select 1 as ok from columns where board_id = ? and is_planned = 1 and deleted_at is null', row.board_id);
        if (row.is_planned === 1 && hasPlanned) run('update columns set is_planned = 0 where id = ?', id);
        run('update columns set deleted_at = null where id = ?', id);
      } else {
        run(`update ${table} set deleted_at = null where id = ?`, id);
      }
    });
  }

  function purgeTrash(): number {
    const cutoff = new Date(now().getTime() - TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return tx(() => {
      let n = 0;
      n += Number(run('delete from cards where deleted_at is not null and deleted_at < ?', cutoff).changes);
      n += Number(run('delete from categories where deleted_at is not null and deleted_at < ?', cutoff).changes);
      n += Number(
        run(
          `delete from columns where deleted_at is not null and deleted_at < ?
           and not exists (select 1 from cards where cards.column_id = columns.id)`,
          cutoff,
        ).changes,
      );
      n += Number(run('delete from boards where deleted_at is not null and deleted_at < ?', cutoff).changes);
      return n;
    });
  }

  function ensureDefaultBoard(): void {
    if (one('select count(*) as n from boards')!.n === 0) createBoard({ name: 'Haushalt', withPlanned: true });
  }

  return {
    createNudges,
    nudgeTargets,
    dueNudges,
    claimNudge,
    releaseNudge,
    replyNudge,
    getNudge,
    nudgeRecipients,
    openNudgeCounts,
    openNudgeList,
    recentNudges,
    setNudgeQuiet,
    syncPeople,
    resolveUser,
    people,
    pendingUsers,
    addPerson,
    removePerson,
    renamePerson,
    setNotifyServices,
    getAccessMode,
    setAccessMode,
    importLegacyPeople,
    transaction: tx,
    setCardOrigin,
    openCardOfWatcher,
    watcherCardCompletedSince,
    openWatcherCardCount,
    openCardByDedupeKey,
    applyManagedPeople,
    isManaged,
    clearManaged,
    userByHaId,
    userById,
    addAttachment,
    getAttachment,
    deleteAttachment,
    referencedFiles,
    addComment,
    listComments,
    updateComment,
    deleteComment,
    getSettings,
    setSettings,
    openDueCards,
    claimNotification,
    releaseNotification,
    recentNotifications,
    createBoard,
    listBoards,
    getBoardView,
    updateBoard,
    deleteBoard,
    addColumn,
    updateColumn,
    moveColumn,
    deleteColumn,
    syncPlanned,
    ensurePlannedColumns,
    addCategory,
    updateCategory,
    deleteCategory,
    createCard,
    getCard,
    updateCard,
    moveCard,
    completeCard,
    duplicateCard,
    undoCompletion,
    listCompletions,
    archiveDone,
    restoreArchived,
    deleteCard,
    setArchived,
    listArchived,
    listSchedule,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
    addLink,
    updateLink,
    listShortMapsLinks,
    deleteLink,
    listTrash,
    restoreFromTrash,
    purgeTrash,
    ensureDefaultBoard,
  };
}

export type Store = ReturnType<typeof createStore>;
