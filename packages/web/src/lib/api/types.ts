import type { LanguageChoice } from '../i18n/index.svelte';
import type { Recurrence } from '../recurrence';
import type { ReminderSpec } from '../reminder';
import type { Permission } from '../permissions';
import type { AssignMode, WatchTrigger } from '../watcher-types';

export type Priority = 'low' | 'medium' | 'high';
/** Aufwand einer Aufgabe für die Fairness-Ansicht; leer zählt wie mittel */
export type Effort = 'small' | 'medium' | 'large';

export interface User {
  id: string;
  haUserId: string | null;
  name: string;
  displayName: string;
  isPerson: boolean;
  color: string | null;
  /** Notify-Dienste der Companion App, ohne „notify." davor */
  notifyServices: string[];
  /** Hat ein ntfy-Thema (das Thema selbst sehen nur die Person und Administratoren, siehe AccessInfo) */
  ntfy: boolean;
  /** Ruhezeit für Stupse */
  nudgeQuiet: { start: string; end: string; off: boolean };
  /** Feste Wahl der Sprache; „auto" folgt dem Gerät */
  languageChoice: LanguageChoice;
  /** Die Sprache, die der Server zuletzt von einem Gerät der Person gemeldet bekam (null: noch keine) */
  language: 'de' | 'en' | null;
  /** Eigener Farbton der Oberfläche (0–359); null: das Orange der App */
  accentHue: number | null;
  /** Das Dashboard, zu dem der Home-Knopf diese Person führt (Pfad in Home Assistant); null: Standard */
  dashboardPath: string | null;
  /** Sonntags-Zusammenfassung als Push (aus, bis die Person sie einschaltet) */
  weeklySummary: boolean;
  /** Rolle „Kind": eingeschränkte Rechte, der Administrator legt sie fest */
  isChild: boolean;
  /** Welche Boards ein Kind sieht: alle oder nur die mit eigenen Aufgaben */
  childScope: 'all' | 'assigned';
  /** „Erledigt" des Kindes braucht standardmäßig eine Bestätigung */
  confirmDefault: boolean;
  /** Personen, die für das Kind bestätigen dürfen (Administratoren immer; ohne Auswahl alle Erwachsenen) */
  confirmers: string[];
  /** Fassung des Personenbilds (null = kein Bild, dann gilt die Initiale) */
  avatarRev: number | null;
  /** Woher das Bild kommt (null: keins) */
  avatarSource: 'ha' | 'upload' | null;
  /** „Wenig Zeit" bis zu diesem Tag (YYYY-MM-DD, einschließlich) */
  busyUntil: string | null;
}

export type AccessMode = 'everyone' | 'selected';

export interface Me {
  user: User;
  people: User[];
  /** Administrator in Home Assistant: darf Personen, Zugriff und Dashboard ändern */
  isAdmin: boolean;
  /** Hat die eingeschränkten Rechte eines Kindes */
  isChild: boolean;
  /** Was diese Person zusätzlich darf (Administrator: alles, Kind: nichts, Mitglied: was ein Administrator ihm gegeben hat) */
  permissions: Permission[];
  /** false: Home Assistant kennt den Benutzer, Stups lässt ihn aber (noch) nicht hinein */
  allowed: boolean;
  accessMode: AccessMode;
  /** Einrichtung beim ersten Start: Status dieser Person, der gemerkte Schritt mit Auswahl, und ob sie jetzt erscheint (der Server entscheidet) */
  onboarding: 'done' | 'skipped' | null;
  onboardingProgress: OnboardingProgress | null;
  needsOnboarding: boolean;
}

export interface OnboardingProgress {
  step: string;
  selection?: Record<string, unknown>;
}

export interface AccessInfo {
  mode: AccessMode;
  /** Personen, Geräte und Zugriff kommen aus der Add-on-Konfiguration und sind in der App gesperrt */
  managed: boolean;
  isAdmin: boolean;
  /** je Person ihre Berechtigungen (nur für Administratoren, sonst fehlt das Feld) */
  people: (User & { isAdmin: boolean; ntfyTopic?: string | null; permissions?: Permission[] })[];
  /** Push über ntfy: Adresse des Servers (für die Anleitung) und ob Knöpfe in den Nachrichten möglich sind; null ohne ntfy */
  ntfy: { url: string; buttons: boolean } | null;
  /** Benutzer, die die App geöffnet haben, aber keine Person sind (nur für Administratoren) */
  pending: User[];
  /** Personen aus Home Assistant, die noch nicht dabei sind (nur für Administratoren) */
  haPersons: { name: string; userId: string | null; /** Geräte (`device_tracker.…`), die Home Assistant der Person zuordnet */ deviceTrackers?: string[] }[];
  /** vorhandene Push-Dienste der Companion App, null wenn Home Assistant sie nicht liefert */
  services: string[] | null;
  directoryAvailable: boolean | null;
}

export interface Board {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  position: string;
  archiveAfterDays: number;
  /** Wer das Board sieht: alle, nur der Besitzer, oder der Besitzer und die gewählten Mitglieder */
  visibility: 'all' | 'private' | 'selected';
  /** Wer es angelegt hat und Sichtbarkeit und Fairness ändern darf (null: Bestandsboard, dann ein Administrator) */
  ownerId: string | null;
  /** Zählt zur Fairness der Woche (ein privates Board nie, egal was hier steht) */
  countsForFairness: boolean;
  /** Die gewählten Mitglieder bei "ausgewählte Personen", ohne den Besitzer */
  memberIds: string[];
  /** Seit wann archiviert (null oder fehlt: nicht archiviert) */
  archivedAt?: string | null;
}
/** Was das Löschen eines Boards trifft (Antwort für den Bestätigungsdialog); `lock` sperrt es, `mayManage` sagt, ob die Person es verwalten darf */
export interface BoardDeletePreview {
  cards: { total: number; open: number };
  recurring: { id: string; title: string; recurrence: Recurrence }[];
  watchers: { id: string; name: string; active: boolean }[];
  /** Persönliche Erinnerungen (Nachhaken) an Aufgaben des Boards */
  reminders: number;
  lock: null | 'last';
  mayManage: boolean;
  /** Besitzer des Boards, wenn die Person es nicht verwalten darf (sonst null) */
  ownerName: string | null;
}
/** Was mit einem Wächter geschieht, dessen Board gelöscht wird */
export type WatcherChoice = { action: 'pause' } | { action: 'move'; boardId: string } | { action: 'delete' };
export interface BoardDuplicateInput {
  name?: string;
  /** Spalten und Kategorien kopieren (Standard: ja) */
  structure?: boolean;
  /** Offene Aufgaben kopieren (Standard: nein) */
  openCards?: boolean;
  /** Sichtbarkeit wie das Original (Standard: ja, sonst „Alle") */
  keepVisibility?: boolean;
}
/** Wer und was von einem Wechsel der Sichtbarkeit oder der Mitglieder betroffen wäre (Vorschau für den Bestätigungsdialog) */
export interface BoardAccessPreview {
  /** Personen, die das Board danach nicht mehr sehen */
  removedIds: string[];
  /** Betroffene Wächter: Zuständige jetzt (before) und danach (after); missing: niemand bleibt, der Wächter legt dann keine Aufgaben an */
  watchers: { watcherId: string; name: string; mode: string; before: string[]; after: string[]; missing: boolean; circleEmpty: boolean; fallbackCleared: boolean }[];
  /** Wächter, die verhindern, dass das Board privat wird */
  blocking: { id: string; name: string }[];
  /** Aufgaben, bei denen Zuständige entfernt werden */
  assigneeCards: number;
}
export interface BoardAccessInput {
  visibility?: 'all' | 'private' | 'selected';
  countsForFairness?: boolean;
  memberIds?: string[];
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
  /** nur Aufgaben mit Termin nach heute */
  isPlanned: boolean;
}
export interface Category {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: string;
}

/** Felder, die eine wiederkehrende Aufgabe in die nächste Aufgabe mitnimmt */
export type CarryField = 'description' | 'checklist' | 'links' | 'cost' | 'attachments' | 'comments';

export interface Card {
  id: string;
  boardId: string;
  columnId: string;
  position: string;
  title: string;
  description: string | null;
  priority: Priority | null;
  effort: Effort | null;
  /** Symbol der Aufgabe (Name aus lib/symbols); leer = Standard „Aufgabe“ */
  icon: string | null;
  /** feste Kachelfarbe; leer = Auto (nach Bereich des Symbols) */
  iconColor: string | null;
  /** auto = aus dem Titel erkannt (Funken-Abzeichen), manual = von Hand gewählt */
  iconSource: 'auto' | 'manual' | null;
  dueAt: string | null;
  recurrence: Recurrence | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  remindBeforeMin: number | null;
  costCents: number | null;
  /** Was die nächste Aufgabe übernimmt, wenn sich diese wiederholt */
  carryOver: CarryField[];
  /** Die Aufgabe, aus deren Wiederholung diese entstanden ist */
  repeatedFrom: string | null;
  /** Wächter, aus dem die Aufgabe entstanden ist */
  watcherId: string | null;
  /** offene Stupse zu dieser Aufgabe */
  openNudges: OpenNudge[];
  /** Bestätigung beim Erledigen durch ein Kind: ein, aus oder leer (Vorgabe der zuständigen Person) */
  confirm: 'on' | 'off' | null;
  /** Ein Kind hat abgehakt, die Aufgabe wartet auf Bestätigung (seit wann, durch wen) */
  confirmRequestedAt: string | null;
  confirmRequestedBy: string | null;
  assigneeIds: string[];
  categoryIds: string[];
  checklist: { done: number; total: number };
  linkCount: number;
  commentCount: number;
  attachmentCount: number;
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
  kind: 'web' | 'maps';
  position: string;
}
export interface Completion {
  id: string;
  cardId: string;
  completedBy: string | null;
  completedByName: string | null;
  completedAt: string;
  dueAt: string | null;
  source: 'app' | 'push';
}
export interface ActivityEntry {
  id: string;
  kind: 'created' | 'repeated' | 'completed' | 'moved' | 'reopened' | 'due' | 'nudged' | 'nudge_reply' | 'watcher';
  at: string;
  byName: string | null;
  /** bei „nudged" die Nachricht, bei „nudge_reply" die Antwort */
  text?: string;
  source?: 'app' | 'push';
  /** bei „due" ISO-Zeiten, bei „moved" Spaltennamen */
  from?: string | null;
  to?: string | null;
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
  /** Ein Bild, das nicht zu einer Aufgabe gehört (Rückmeldung): Adresse des Bildes; die Ansicht zeigt dann kein „Entfernen" */
  url?: string;
}
export interface CardDetail extends Card {
  /** Mein Nachhaken an dieser Aufgabe (persönlich: die Erinnerungen anderer bekomme ich nie); null = keins */
  reminder: ReminderSpec | null;
  checklistItems: ChecklistItem[];
  links: CardLink[];
  history: Completion[];
  activity: ActivityEntry[];
  attachments: Attachment[];
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
export interface BoardView {
  board: Board;
  columns: Column[];
  categories: Category[];
  cards: Card[];
  costTotalCents: number;
}
export interface Settings {
  dashboardPath: string | null;
  panelPath: string | null;
  defaultDashboardPath: string;
  effectiveDashboardPath: string;
  /** Uhrzeit (HH:MM), die die Schnell-Eingabe nimmt, wenn nur ein Datum dasteht */
  defaultDueTime: string;
  /** Uhrzeit der Tageszusammenfassung, in der App eingestellt; null: die Add-on-Option gilt */
  dailySummaryTime: string | null;
  defaultDailySummaryTime: string;
  effectiveDailySummaryTime: string;
  /** Uhrzeit des Nachhakens in Tagen oder Wochen ohne eigene Uhrzeit, in der App eingestellt; null: die Standard-Uhrzeit gilt */
  overdueNagTime: string | null;
  defaultOverdueNagTime: string;
  effectiveOverdueNagTime: string;
}
export interface TrashItem {
  type: 'board' | 'column' | 'category' | 'card';
  id: string;
  title: string;
  boardId: string;
  deletedAt: string;
  purgeAt: string;
}
export interface CompleteResult {
  card: CardDetail;
  completionId: string | null;
  nextDueAt: string | null;
  /** die neue Aufgabe, wenn sich die erledigte wiederholt */
  nextCardId: string | null;
  /** true: ein Kind hat abgehakt, erledigt wurde noch nichts (die Aufgabe wartet auf Bestätigung) */
  awaitingConfirmation?: boolean;
}

export interface CardInput {
  columnId: string;
  title: string;
  description?: string | null;
  priority?: Priority | null;
  effort?: Effort | null;
  icon?: string | null;
  iconColor?: string | null;
  iconSource?: 'auto' | 'manual' | null;
  dueAt?: string | null;
  recurrence?: Recurrence | null;
  remindBeforeMin?: number | null;
  /** Nachhaken der eigenen Person (persönlich); null = aus */
  reminder?: ReminderSpec | null;
  costCents?: number | null;
  carryOver?: CarryField[];
  assigneeIds?: string[];
  categoryIds?: string[];
}
export type CardPatch = Partial<Omit<CardInput, 'columnId'>> & {
  confirm?: 'on' | 'off' | null;
  /** nur ändern, wenn die Aufgabe noch in dieser Fassung vorliegt (sonst 409: jemand war schneller) */
  expectedVersion?: number;
};

/** Was die Betriebsart bietet (GET api/capabilities) */
/** Eine Board-Vorlage (eingebaut oder eigen) mit Zahlen für die Vorschau */
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  columns: number;
  categories: number;
  cards: number;
  createdBy: string | null;
}

// ---------- Heute ----------

/** Ein Eintrag im Posteingang (Glocke); der Server liefert Art und Daten, den Satz bildet lib/inbox.ts in der Sprache der Person */
export type InboxKind = 'nudge' | 'reply' | 'watcher' | 'done' | 'comment' | 'reminder' | 'change' | 'confirm';
export interface InboxEntry {
  id: string;
  kind: InboxKind;
  at: string;
  cardId: string;
  cardTitle: string;
  boardId: string;
  actorId: string | null;
  text: string | null;
  detail: string | null;
  watcherName: string | null;
  assigned: boolean;
  dueAt: string | null;
  /** Kennung des Wächters bei Mitteilungen ohne Aufgabe (`detail` ist dann `assignees_missing` oder `shrunk`); sonst null */
  watcherId: string | null;
  /** Die Angaben zu "braucht neue Zuständige" und "läuft weiter mit ..." (sonst null) */
  notice: { boardName: string; removedNames: string[]; remainingNames: string[] } | null;
}
export interface InboxPage {
  items: InboxEntry[];
  seenAt: string | null;
  hasMore: boolean;
}
export interface HaDashboards {
  items: { path: string; title: string }[];
  addonPath: string;
  connected: boolean;
}

export interface TodayCard {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  dueAt: string | null;
  assigneeIds: string[];
  watcherId: string | null;
  watcherName: string | null;
  createdAt: string;
  /** Warum diese Person dran ist; nur bei Aufgaben vom Haus */
  why: string | null;
}

export interface Today {
  house: TodayCard[];
  mine: TodayCard[];
  others: { personId: string; open: number }[];
}

// ---------- Zuhause ----------

export interface HomeItem {
  watcherId: string;
  name: string;
  /** Friendly Name der beobachteten Entität (ohne Namen die Entitäts-ID): steht in der Liste immer unter dem Namen */
  subject: string;
  /** Friendly Name der beobachteten Entität (ohne Namen die Entitäts-ID) */
  entity: string;
  /** ok, entity_missing, target_missing (pausiert) oder assignees_missing (legt keine Aufgaben an, braucht neue Zuständige) */
  status: 'ok' | 'entity_missing' | 'target_missing' | 'assignees_missing';
  /** Bei target_missing: das Board ist archiviert oder gelöscht (fehlt oder null: nur die Spalte fehlt) */
  pausedBy?: 'archived' | 'deleted' | null;
  /** Aktueller Wert mit Einheit ("26 %"), null ohne Wert */
  value: string | null;
  phase: 'waiting' | 'running' | 'soon' | 'quiet';
  since: string | null;
  progress: { n: number; of: number } | null;
  /** Titel der Aufgabe, die danach kommt */
  nextCard: string;
  entityMissing: boolean;
  openCard: { id: string; title: string; boardId: string; assigneeIds: string[]; createdAt: string } | null;
  nextEvent: { title: string; at: string } | null;
  /** Eingeschaltet (aus: löst nichts aus, bleibt aber in der Liste) */
  active: boolean;
  /** Kategorie zum Gruppieren (null = „Ohne Kategorie") */
  category: string | null;
  /** Die Bedingung (für den kurzen Satz der Tabelle) und die Einheit der Entität */
  trigger: WatchTrigger;
  entityUnit: string | null;
  /** Zuletzt ausgelöst (null: noch nie) und für wen */
  lastFiredAt: string | null;
  lastAssigneeIds: string[];
  /** An wen die Aufgabe geht */
  assign: { mode: AssignMode; personIds: string[] };
}

export interface HomeState {
  available: boolean;
  lostSince: string | null;
  items: HomeItem[];
}

// ---------- Fairness ----------

export interface FairnessCounts {
  done: number;
  effort: number;
  created: number;
  nudgesAnswered: number;
  watcherCards: number;
}

export interface Fairness {
  period: 'week' | 'month';
  from: string;
  to: string;
  /** In der Reihenfolge der Personenliste, nicht nach Wert sortiert */
  people: (FairnessCounts & { id: string; name: string; color: string | null; busyUntil: string | null })[];
  total: FairnessCounts;
  /** Aufgaben in diesem Zeitraum, die von Wächtern kamen */
  houseCards: number;
  /** Bestätigungen von Kindern, die die angemeldete Person geben darf */
  waitingForYou: { cardId: string; title: string; boardId: string; childId: string | null; requestedAt: string }[];
}

// ---------- Haus-Kanäle ----------

export type HouseKind = 'nudge' | 'due' | 'watcher';
export type HouseType = 'speak' | 'light';

export interface HouseResult {
  at: string;
  result: 'delivered' | 'queued' | 'skipped_away' | 'skipped_quiet' | 'error';
  error?: { code: 'no_tts' | 'ha_error'; detail: string; message: string };
}

export interface HouseChannel {
  id: string;
  userId: string;
  type: HouseType;
  name: string;
  entityId: string;
  enabled: boolean;
  kinds: HouseKind[];
  whenAway: 'skip' | 'wait';
  waitMinutes: number;
  volume: number | null;
  createdAt: string;
  status: HouseResult | null;
}

export interface HouseInfo {
  channels: HouseChannel[];
  /** Der Sprachdienst für alle Ansagen */
  tts: string | null;
  /** Personen mit Kanal, denen sich keine Person in Home Assistant zuordnen lässt */
  unmatched: string[];
}

export interface HouseEntity {
  entityId: string;
  name: string;
}

export interface HouseEntities {
  speakers: HouseEntity[];
  lights: HouseEntity[];
  tts: HouseEntity[];
}

export interface Capabilities {
  mode: 'addon' | 'standalone-ha' | 'standalone';
  /** normale App oder Beta */
  channel: 'stable' | 'beta';
  /** ingress: Anmeldung über Home Assistant; session: eigenes Konto mit Passwort */
  auth: 'ingress' | 'session';
  ha: boolean;
  watchers: boolean;
  sensors: boolean;
  /** Haus-Kanäle (Ansage, Lampe): nur mit Verbindung zu Home Assistant */
  house: boolean;
  push: string[];
  publicUrl: string | null;
  /** Anmeldung mit Passkey ist eingerichtet (eigene Konten, STUPS_PUBLIC_URL mit HTTPS) */
  passkeys: boolean;
  /** Version der App (null, wenn unbekannt) */
  version?: string | null;
}

/** Beta: Push und Wächter sind zunächst aus, ein Administrator schaltet sie ein */
export type BetaPush = { mode: 'off' } | { mode: 'only'; personId: string } | { mode: 'all' };
export interface BetaState {
  push: BetaPush;
  watchers: boolean;
}

export interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Herausforderung für ein Gerät; options geht unverändert an den Browser */
export interface PasskeyCeremony {
  ceremonyId: string;
  options: any;
}

export interface AuthStatus {
  authenticated: boolean;
  /** true: es gibt noch kein Konto, der erste Administrator wird eingerichtet */
  setupRequired: boolean;
  user: { username: string; displayName: string; isAdmin: boolean } | null;
}

/** Konto einer Person (eigene Anmeldung) */
export interface Account {
  userId: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface PushStatus {
  upcoming: { title: string; dueAt: string; assignees: string[]; note: string | null }[];
  people: { name: string; services: { service: string; exists: boolean | null }[]; ntfy?: boolean }[];
  /** nur mit ntfy: wann der Testknopf zuletzt zurückgemeldet hat (null = noch nie seit dem Start) */
  ntfy: { url: string; buttons: boolean; roundTrip: string | null } | null;
  /** Haus-Kanäle mit dem letzten Ergebnis; null ohne Home Assistant */
  house: { person: string; name: string; type: HouseType; enabled: boolean; kinds: HouseKind[]; status: HouseResult | null }[] | null;
  recent: { kind: 'due' | 'reminder' | 'nag' | 'summary'; status: 'sent' | 'skipped' | 'failed'; at: string; title: string; user: string }[];
  nudges: { title: string; from: string; to: string; at: string; deliverAt: string; state: 'wartet' | 'offen' | 'beantwortet' | 'geschlossen' }[];
}

/** Aufgabe mit Termin samt Board (Antwort von /api/schedule) */
export interface ScheduleCard extends Card {
  boardName: string;
  boardColor: string | null;
  /** die Kategorien der Aufgabe (Name und Farbe); Aufgaben zeigt die erste in der Zeile */
  categories: { id: string; name: string; color: string }[];
}

export type NudgeTemplate = 'think' | 'today' | 'help' | 'thanks';

export interface OpenNudge {
  id: string;
  fromId: string;
  toId: string;
  /** schon als Push zugestellt */
  delivered: boolean;
}

export interface NudgeTarget {
  id: string;
  name: string;
  color: string | null;
  selectable: boolean;
  reason: 'no_device' | 'rate' | null;
  retryAt: string | null;
  deliverAt: string | null;
  preselected: boolean;
}

export interface NudgeInfo {
  canNudge: boolean;
  maxText: number;
  templates: Record<NudgeTemplate, string>;
  people: NudgeTarget[];
}

export type { HaEntity, SavedWatcher, WatcherActivity, WatcherInput, WatcherItem, WatcherRun } from '../watcher-types';

export interface NudgeResult {
  sent: { nudgeId: string; to: string; status: 'sent' | 'queued'; deliverAt: string }[];
  skipped: { to: string; reason: 'self' | 'no_person' | 'no_device' | 'rate'; retryAt: string | null }[];
}
