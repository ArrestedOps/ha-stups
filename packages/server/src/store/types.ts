import { type LinkKind } from '../links.js';
import { type QuietWindow } from '../quiet.js';
import { type Recurrence } from '../recurrence.js';

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
  /** Hat ein ntfy-Thema. Das Thema selbst bleibt draußen: auf einem offenen Server schützt nur es die Nachrichten (store.ntfyTopic). */
  ntfy: boolean;
  /** Ruhezeit für Stupse */
  nudgeQuiet: QuietWindow;
  /** Feste Wahl der Sprache; „auto" folgt dem Gerät */
  languageChoice: 'auto' | 'de' | 'en';
  /** Die zuletzt von einem Gerät der Person gemeldete Sprache (null: noch keine) */
  language: 'de' | 'en' | null;
  /** Eigener Farbton der Oberfläche (0–359); null: das Orange der App */
  accentHue: number | null;
  /** Das Dashboard, zu dem der Home-Knopf diese Person führt (Pfad in Home Assistant); null: Standard */
  dashboardPath: string | null;
  /** Sonntags-Zusammenfassung als Push (aus, bis die Person sie einschaltet) */
  weeklySummary: boolean;
  /** Rolle „Kind": eingeschränkte Rechte (der Administrator legt sie fest; ein Administrator ist nie Kind) */
  isChild: boolean;
  /** Welche Boards ein Kind sieht: alle oder nur die mit eigenen (zugewiesenen) Aufgaben */
  childScope: 'all' | 'assigned';
  /** „Erledigt" des Kindes braucht standardmäßig eine Bestätigung */
  confirmDefault: boolean;
  /** Personen, die für das Kind bestätigen dürfen (Administratoren dürfen immer) */
  confirmers: string[];
  /** Fassung des Personenbilds (zählt bei jeder Änderung hoch, für langes Caching); null = kein Bild */
  avatarRev: number | null;
  /** Woher das Bild kommt: Home Assistant oder selbst hochgeladen (null: keins) */
  avatarSource: 'ha' | 'upload' | null;
  /** „Wenig Zeit" bis zu diesem Tag (YYYY-MM-DD, einschließlich): Rotationen der Wächter überspringen die Person */
  busyUntil: string | null;
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
/** Zwischen zwei Stupsen derselben Person an dieselbe Person zur selben Aufgabe */
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

/** Offener Stups an der Aufgabe (für Abzeichen und Filter) */
export interface OpenNudge {
  id: string;
  fromId: string;
  toId: string;
  /** schon als Push zugestellt */
  delivered: boolean;
  /** wann gestupst (ISO) */
  at: string;
  /** Schnellauswahl (zum Beispiel „think“) und eigener Text; höchstens einer von beiden */
  template: string | null;
  text: string | null;
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
  /** Die Vorlage, aus der der Text stammt (dann wird er in der Sprache des Empfängers gebildet); null bei eigenem Text */
  template: NudgeTemplate | null;
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
  /** wer die Aufgabe erledigt hat (null = unbekannt) */
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

export type { BoardEffects, BoardAccessPlan, WatcherImpact, WatcherNotice } from './board-access.js';

/** Wer ein Board sieht: alle mit Zugriff, nur der Besitzer, oder der Besitzer und die gewählten Mitglieder (auch Administratoren sehen fremde private Boards nicht) */
export type BoardVisibility = 'all' | 'private' | 'selected';

export interface Board {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  position: string;
  archiveAfterDays: number;
  visibility: BoardVisibility;
  /** Wer das Board angelegt hat und Sichtbarkeit und Fairness ändern darf; null bei Bestandsboards (dann ein Administrator) */
  ownerId: string | null;
  /** Das Board zählt zur Fairness der Woche (ein privates Board zählt nie, auch wenn hier true steht: so bleibt die Wahl beim Zurückstellen erhalten) */
  countsForFairness: boolean;
  /** Die gewählten Mitglieder (nur bei visibility = selected), ohne den Besitzer */
  memberIds: string[];
  /** Seit wann das Board archiviert ist (null: nicht archiviert). Ein archiviertes Board gibt es für alle Listen und Auswertungen nicht. */
  archivedAt: string | null;
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
  /** Nur Aufgaben mit Termin nach heute; rücken am Tag der Fälligkeit nach „Offen" */
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
  /** null, wenn die Aufgabe schon erledigt war (nichts wurde protokolliert) */
  completionId: string | null;
  /** nur bei wiederkehrenden Aufgaben */
  nextDueAt: string | null;
  /** die neue Aufgabe, die bei einer wiederkehrenden Aufgabe angelegt wurde */
  nextCardId: string | null;
  /** true, wenn ein Kind abgehakt hat und die Aufgabe auf Bestätigung wartet (erledigt wurde nichts) */
  awaitingConfirmation?: boolean;
}

/** Felder, die eine wiederkehrende Aufgabe auf Wunsch in die nächste Aufgabe mitnimmt */
export type CarryField = 'description' | 'checklist' | 'links' | 'cost' | 'attachments' | 'comments';

export const CARRY_FIELDS: readonly CarryField[] = ['description', 'checklist', 'links', 'cost', 'attachments', 'comments'];

/** Ohne eigene Auswahl: Fotos und Kommentare gehören meist zu genau einem Durchgang und bleiben bei der erledigten Aufgabe */
export const DEFAULT_CARRY: readonly CarryField[] = ['description', 'checklist', 'links', 'cost'];

/** Aufwand einer Aufgabe: klein, mittel oder groß */
export type Effort = 'small' | 'medium' | 'large';
export const EFFORTS: readonly Effort[] = ['small', 'medium', 'large'];

/** Die acht Kachelfarben der Oberfläche (Symbol an der Aufgabe) */
export type IconColor = 'orange' | 'purple' | 'violet' | 'blue' | 'teal' | 'green' | 'red' | 'gray';
export const ICON_COLORS: readonly IconColor[] = ['orange', 'purple', 'violet', 'blue', 'teal', 'green', 'red', 'gray'];
export type IconSource = 'auto' | 'manual';

export type { Today, TodayCard } from './today.js';

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
  costCents: number | null;
  /** Aufwand für die Fairness-Ansicht; leer zählt wie mittel */
  effort: Effort | null;
  /** Symbol aus der Bibliothek der Oberfläche (mdi-Name ohne Präfix); leer = Standard „Aufgabe“ */
  icon: string | null;
  /** Kachelfarbe des Symbols; leer = Auto (nach Bereich des Symbols) */
  iconColor: IconColor | null;
  /** auto = aus dem Titel erkannt (Funken-Abzeichen), manual = von Hand gewählt */
  iconSource: IconSource | null;
  /** Bestätigung: leer = Vorgabe der zuständigen Person, on = immer, off = nie */
  confirm: 'on' | 'off' | null;
  /** Das Kind hat erledigt gesagt, die Aufgabe wartet auf Bestätigung (sonst null) */
  confirmRequestedAt: string | null;
  confirmRequestedBy: string | null;
  /** Was die nächste Aufgabe übernimmt, wenn diese sich wiederholt */
  carryOver: CarryField[];
  /** offene Stupse zu dieser Aufgabe */
  openNudges: OpenNudge[];
  /** Aufgabe, aus deren Wiederholung diese entstanden ist */
  repeatedFrom: string | null;
  /** Wächter, aus dem die Aufgabe entstanden ist */
  watcherId: string | null;
  assigneeIds: string[];
  categoryIds: string[];
  checklist: { done: number; total: number };
  linkCount: number;
  commentCount: number;
  attachmentCount: number;
}

/** Aufgabe mit Termin samt Board, für Agenda und Kalender */
export interface ScheduleCard extends Card {
  boardName: string;
  boardColor: string | null;
  /** die Kategorien der Aufgabe (Name und Farbe), in der Reihenfolge der Aufgabe; Aufgaben zeigt die erste in der Zeile */
  categories: { id: string; name: string; color: string }[];
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
  /** Uhrzeit (HH:MM), die die Schnell-Eingabe nimmt, wenn nur ein Datum dasteht */
  defaultDueTime: string;
  /** Uhrzeit (HH:MM) der Tageszusammenfassung, in der App eingestellt; null = die Add-on-Option gilt */
  dailySummaryTime: string | null;
  /** Uhrzeit (HH:MM) des Nachhakens in Tagen oder Wochen ohne eigene Uhrzeit, in der App eingestellt; null = die Vorgabe gilt (18:00) */
  overdueNagTime: string | null;
}

export const DEFAULT_DUE_TIME = '09:00';

export interface OpenDueCard {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  dueAt: string;
  remindBeforeMin: number | null;
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
 * Ein Eintrag im Verlauf einer Aufgabe. Bei „due" sind from/to ISO-Zeiten, bei „moved"/„reopened" Spaltennamen,
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
  /** Summe der Kosten aller Aufgaben des Boards */
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
  /** Nachhaken der anlegenden Person (ReminderSpec); null oder fehlend: keins */
  reminder?: unknown;
  costCents?: number | null;
  effort?: unknown;
  icon?: unknown;
  iconColor?: unknown;
  iconSource?: unknown;
  carryOver?: unknown;
  assigneeIds?: string[];
  categoryIds?: string[];
}

export type CardPatch = Partial<Omit<CardInput, 'columnId'>> & {
  /** Bestätigung beim Erledigen durch ein Kind: 'on', 'off' oder leer (Vorgabe der zuständigen Person) */
  confirm?: unknown;
  /**
   * Vorbedingung gegen veraltete Schreibzugriffe: Nur wenn die Aufgabe noch in dieser Fassung (`version`) vorliegt, wird geändert, sonst
   * ConflictError. Fehlt sie, gewinnt die letzte Änderung.
   */
  expectedVersion?: unknown;
};

export type TrashType = 'board' | 'column' | 'category' | 'card';

export interface TrashItem {
  type: TrashType;
  id: string;
  title: string;
  boardId: string;
  deletedAt: string;
  purgeAt: string;
}

// ---------- Haus-Kanäle ----------

/** Welche Nachrichten ins Haus dürfen: Stups, Fälligkeit (auch Vorab-Erinnerung und Nachhaken), Aufgabe eines Wächters */
export type HouseKind = 'nudge' | 'due' | 'watcher';
export const HOUSE_KINDS: readonly HouseKind[] = ['nudge', 'due', 'watcher'];
/** Ansage über einen Lautsprecher oder eine Lampe, die aufleuchtet */
export type HouseChannelType = 'speak' | 'light';
/** Was geschieht, wenn die Person nicht zu Hause ist: verwerfen oder warten, bis sie heimkommt */
export type HouseWhenAway = 'skip' | 'wait';

export interface HouseChannel {
  id: string;
  userId: string;
  type: HouseChannelType;
  name: string;
  /** `media_player.…` (Ansage) oder `light.…` (Lampe) */
  entityId: string;
  enabled: boolean;
  kinds: HouseKind[];
  whenAway: HouseWhenAway;
  /** Wie lange eine Nachricht auf die Heimkehr wartet (nur bei `wait`) */
  waitMinutes: number;
  /** Lautstärke der Ansage in Prozent, leer = nicht anfassen */
  volume: number | null;
  createdAt: string;
}

/** Eine Nachricht, die auf die Heimkehr der Person wartet */
export interface HousePending {
  id: string;
  channelId: string;
  kind: HouseKind;
  spoken: string;
  cardId: string | null;
  nudgeId: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface StoreOptions {
  /** Wird nach dem Erledigen einer Aufgabe mit den dabei geschlossenen Stupsen aufgerufen (für die Rückmeldung) */
  onNudgesClosed?: (list: ClosedNudge[]) => void;
  now?: () => Date;
  /** IANA-Zeitzone von Home Assistant, z. B. Europe/Berlin */
  timeZone?: () => string;
}

export type Row = Record<string, any>;

/** Die Add-on-Optionen, die der erste Start in die Datenbank übernimmt (siehe importAddonOptions) */
export interface AddonOptionsImport {
  users: { name: string; notify: string[] }[];
  accessMode: AccessMode;
  dashboardPath: string;
  dailySummaryTime: string;
  overdueNagTime: string;
}

/** Die Standardwerte des Add-ons: Eine Option, die davon abweicht, wird übernommen, die übrigen nicht */
export interface AddonOptionsDefaults {
  dashboardPath: string;
  dailySummaryTime: string;
  overdueNagTime: string;
}

export interface AddonImportResult {
  /** Wie viele Personen in `users` standen */
  people: number;
  /** Der übernommene Zugriff (null: `users` war leer, es gilt die bisherige Regel für frische und bestehende Installationen) */
  accessMode: AccessMode | null;
  /** Die übernommenen Einstellungen (Schlüssel) */
  settings: string[];
  /** Die Einstellungen, deren Wert ungültig war und übersprungen wurde */
  skipped: string[];
}
