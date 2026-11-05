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
  /** Welche Boards ein Kind sieht: alle oder nur die mit eigenen (zugewiesenen) Karten */
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
  /** true, wenn ein Kind abgehakt hat und die Karte auf Bestätigung wartet (erledigt wurde nichts) */
  awaitingConfirmation?: boolean;
}

/** Felder, die eine wiederkehrende Karte auf Wunsch in die nächste Karte mitnimmt */
export type CarryField = 'description' | 'checklist' | 'links' | 'cost' | 'attachments' | 'comments';

export const CARRY_FIELDS: readonly CarryField[] = ['description', 'checklist', 'links', 'cost', 'attachments', 'comments'];

/** Ohne eigene Auswahl: Fotos und Kommentare gehören meist zu genau einem Durchgang und bleiben bei der erledigten Karte */
export const DEFAULT_CARRY: readonly CarryField[] = ['description', 'checklist', 'links', 'cost'];

/** Aufwand einer Karte: klein, mittel oder groß */
export type Effort = 'small' | 'medium' | 'large';
export const EFFORTS: readonly Effort[] = ['small', 'medium', 'large'];

/** Die acht Kachelfarben der Oberfläche (Symbol an der Karte) */
export type IconColor = 'orange' | 'purple' | 'violet' | 'blue' | 'teal' | 'green' | 'red' | 'gray';
export const ICON_COLORS: readonly IconColor[] = ['orange', 'purple', 'violet', 'blue', 'teal', 'green', 'red', 'gray'];
export type IconSource = 'auto' | 'manual';
/** Gewichte für die Fairness-Ansicht; eine Karte ohne Angabe zählt wie mittel */
export const EFFORT_WEIGHT: Record<Effort, number> = { small: 1, medium: 2, large: 3 };

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
  /** täglich nachhaken, solange überfällig */
  overdueNag: boolean;
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
  /** Das Kind hat erledigt gesagt, die Karte wartet auf Bestätigung (sonst null) */
  confirmRequestedAt: string | null;
  confirmRequestedBy: string | null;
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
  /** die Kategorien der Karte (Name und Farbe), in der Reihenfolge der Karte; Aufgaben zeigt die erste in der Zeile */
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
}

export const DEFAULT_DUE_TIME = '09:00';

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

/** Welche Nachrichten ins Haus dürfen: Stups, Fälligkeit (auch Vorab-Erinnerung und Nachhaken), Karte eines Wächters */
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
  /** Wird nach dem Erledigen einer Karte mit den dabei geschlossenen Stupsen aufgerufen (für die Rückmeldung) */
  onNudgesClosed?: (list: ClosedNudge[]) => void;
  now?: () => Date;
  /** IANA-Zeitzone von Home Assistant, z. B. Europe/Berlin */
  timeZone?: () => string;
}

export type Row = Record<string, any>;
