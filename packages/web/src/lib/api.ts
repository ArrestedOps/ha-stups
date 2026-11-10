import { i18n, type LanguageChoice, t } from './i18n/index.svelte';
import type { FeedbackContext, FeedbackItem, FeedbackKind, FeedbackStatus } from './feedback';
import type { Recurrence } from './recurrence';
import type { ReminderSpec } from './reminder';
import type { Permission } from './permissions';
import type { EntityHistory } from './history';
import type { AssignMode, DryRunResult, HaEntity, OrderView, SavedWatcher, WatchTrigger, WatcherActivity, WatcherInput, WatcherItem, WatcherRun, WatcherSuggestion, WatcherTemplate } from './watcher-types';

export type Priority = 'low' | 'medium' | 'high';
/** Aufwand einer Karte für die Fairness-Ansicht; leer zählt wie mittel */
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
  /** Welche Boards ein Kind sieht: alle oder nur die mit eigenen Karten */
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
  haPersons: { name: string; userId: string | null }[];
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
  /** Persönliche Erinnerungen (Nachhaken) an Karten des Boards */
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
  /** Betroffene Wächter: Zuständige jetzt (before) und danach (after); missing: niemand bleibt, der Wächter legt dann keine Karten an */
  watchers: { watcherId: string; name: string; mode: string; before: string[]; after: string[]; missing: boolean; circleEmpty: boolean; fallbackCleared: boolean }[];
  /** Wächter, die verhindern, dass das Board privat wird */
  blocking: { id: string; name: string }[];
  /** Karten, bei denen Zuständige entfernt werden */
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
  /** nur Karten mit Termin nach heute */
  isPlanned: boolean;
}
export interface Category {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: string;
}

/** Felder, die eine wiederkehrende Karte in die nächste Karte mitnimmt */
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
  /** Symbol der Karte (Name aus lib/symbols); leer = Standard „Aufgabe“ */
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
  /** Was die nächste Karte übernimmt, wenn sich diese wiederholt */
  carryOver: CarryField[];
  /** Die Karte, aus deren Wiederholung diese entstanden ist */
  repeatedFrom: string | null;
  /** Wächter, aus dem die Karte entstanden ist */
  watcherId: string | null;
  /** offene Stupse zu dieser Karte */
  openNudges: OpenNudge[];
  /** Bestätigung beim Erledigen durch ein Kind: ein, aus oder leer (Vorgabe der zuständigen Person) */
  confirm: 'on' | 'off' | null;
  /** Ein Kind hat abgehakt, die Karte wartet auf Bestätigung (seit wann, durch wen) */
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
  /** Ein Bild, das nicht zu einer Karte gehört (Rückmeldung): Adresse des Bildes; die Ansicht zeigt dann kein „Entfernen" */
  url?: string;
}
export interface CardDetail extends Card {
  /** Mein Nachhaken an dieser Karte (persönlich: die Erinnerungen anderer bekomme ich nie); null = keins */
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
  /** Uhrzeit, zu der ein Nachhaken in Tagen oder Wochen kommt, wenn nichts anderes gewählt ist */
  overdueNagTime?: string;
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
  /** die neue Karte, wenn sich die erledigte wiederholt */
  nextCardId: string | null;
  /** true: ein Kind hat abgehakt, erledigt wurde noch nichts (die Karte wartet auf Bestätigung) */
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
export type CardPatch = Partial<Omit<CardInput, 'columnId'>> & { confirm?: 'on' | 'off' | null };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** der ganze Antwortinhalt, z. B. die abgelehnten Empfänger beim Stupsen */
    readonly data?: unknown,
  ) {
    super(message);
  }
}

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
  /** Kennung des Wächters bei Mitteilungen ohne Karte (`detail` ist dann `assignees_missing` oder `shrunk`); sonst null */
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
  /** Warum diese Person dran ist; nur bei Karten vom Haus */
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
  /** ok, entity_missing, target_missing (pausiert) oder assignees_missing (legt keine Karten an, braucht neue Zuständige) */
  status: 'ok' | 'entity_missing' | 'target_missing' | 'assignees_missing';
  /** Bei target_missing: das Board ist archiviert oder gelöscht (fehlt oder null: nur die Spalte fehlt) */
  pausedBy?: 'archived' | 'deleted' | null;
  /** Aktueller Wert mit Einheit ("26 %"), null ohne Wert */
  value: string | null;
  phase: 'waiting' | 'running' | 'soon' | 'quiet';
  since: string | null;
  progress: { n: number; of: number } | null;
  /** Titel der Karte, die danach kommt */
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
  /** An wen die Karte geht */
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
  /** Karten in diesem Zeitraum, die von Wächtern kamen */
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

/** Wird aufgerufen, wenn der Server „nicht angemeldet" meldet (Sitzung abgelaufen oder beendet) */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

/** Jede ändernde Anfrage trägt diese Kopfzeile; der Server lehnt sonst Anfragen ab, die von einer fremden Seite kommen */
const clientHeaders = () => ({ 'x-stups-client': '1', 'x-stups-language': i18n.lang });

// Relative Adresse: funktioniert unter dem wechselnden Ingress-Pfad von Home Assistant.
/** Eine Anfrage an die API mit gemeinsamer Fehlerbehandlung (auch für Uploads: 401 führt zur Anmeldung) */
/** Zeitlimit je Anfrage; Uploads (Dateien) brauchen auf langsamem WLAN länger */
export const REQUEST_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

async function send<T>(path: string, init: RequestInit, timeoutMs = init.body instanceof FormData || init.body instanceof Blob ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS): Promise<T> {
  // Ohne Zeitlimit bliebe eine hängende Anfrage ewig „lädt": nach 30 Sekunden Fehler statt endlosem Warten
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  init.signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    let res: Response;
    try {
      res = await fetch(`api/${path}`, { ...init, signal: controller.signal });
    } catch {
      throw timedOut ? new ApiError(t('Zeitüberschreitung: der Server antwortet nicht'), 0) : new ApiError(t('Keine Verbindung zum Server'), 0);
    }
    return await readResponse<T>(path, res, () => timedOut);
  } finally {
    clearTimeout(timer);
  }
}

async function readResponse<T>(path: string, res: Response, timedOut: () => boolean): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => (timedOut() ? undefined : {}));
  if (data === undefined) throw new ApiError(t('Zeitüberschreitung: der Server antwortet nicht'), 0);
  if (res.status === 401 && !path.startsWith('auth/')) onUnauthorized?.();
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? t('Fehler {status}', { status: res.status }), res.status, data);
  return data as T;
}

function req<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return send<T>(path, {
    method,
    headers: body === undefined ? clientHeaders() : { ...clientHeaders(), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

const get = <T>(p: string, signal?: AbortSignal) => req<T>('GET', p, undefined, signal);
const post = <T>(p: string, b: unknown = {}, signal?: AbortSignal) => req<T>('POST', p, b, signal);
const patch = <T>(p: string, b: unknown) => req<T>('PATCH', p, b);
const put = <T>(p: string, b: unknown) => req<T>('PUT', p, b);
const del = (p: string) => req<void>('DELETE', p);

export const api = {
  capabilities: () => get<Capabilities>('capabilities'),
  /** Wahl der Person und Sprache, die das Gerät gerade zeigt (der Server braucht sie für Push) */
  setLanguage: (choice: LanguageChoice, effective: 'de' | 'en') => put<void>('me/language', { choice, effective }),
  setAccent: (hue: number | null) => put<void>('me/accent', { hue }),
  authStatus: () => get<AuthStatus>('auth/status'),
  login: (username: string, password: string) => post<AuthStatus>('auth/login', { username, password }),
  logout: () => post<void>('auth/logout'),
  setup: (b: { code: string; username: string; displayName: string; password: string }) => post<AuthStatus>('auth/setup', b),
  changePassword: (current: string, next: string) => post<void>('auth/password', { current, next }),
  beta: () => get<BetaState>('beta'),
  setBeta: (patch: Partial<BetaState>) => put<BetaState>('beta', patch),
  passkeyLoginOptions: () => post<PasskeyCeremony>('auth/passkey/options'),
  passkeyLogin: (ceremonyId: string, response: unknown) => post<AuthStatus>('auth/passkey/login', { ceremonyId, response }),
  passkeys: () => get<PasskeyInfo[]>('passkeys'),
  passkeyRegistrationOptions: () => post<PasskeyCeremony>('passkeys/options'),
  addPasskey: (b: { ceremonyId: string; response: unknown; name: string }) => post<PasskeyInfo>('passkeys', b),
  deletePasskey: (id: string) => del(`passkeys/${id}`),
  accounts: () => get<Account[]>('auth/users'),
  createAccount: (b: { username: string; displayName?: string; password: string; isAdmin?: boolean; userId?: string }) =>
    post<Account>('auth/users', b),
  updateAccount: (userId: string, b: Partial<{ password: string; isAdmin: boolean }>) => patch<Account>(`auth/users/${userId}`, b),
  deleteAccount: (userId: string) => del(`auth/users/${userId}`),
  me: () => get<Me>('me'),
  people: () => get<User[]>('people'),
  access: () => get<AccessInfo>('access'),
  fairness: (period: 'week' | 'month') => get<Fairness>(`fairness?period=${period}`),
  today: () => get<Today>('today'),
  inbox: (before?: string) => get<InboxPage>(`inbox${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  markInboxSeen: () => put<{ seenAt: string }>('me/inbox-seen', {}),
  /** Weitergeben: `to` ist die neue Person, null wenn gerade niemand sonst dran ist */
  passCard: (id: string) => post<{ to: string | null }>(`cards/${id}/pass`),
  /** Übernehmen ("Erst vorschlagen") */
  claimCard: (id: string) => post<Card>(`cards/${id}/claim`),
  home: () => get<HomeState>('home'),
  houseChannels: () => get<HouseInfo>('house/channels'),
  houseEntities: () => get<HouseEntities>('house/entities'),
  addHouseChannel: (b: { userId: string; type: HouseType; entityId: string; name?: string }) => post<HouseChannel>('house/channels', b),
  updateHouseChannel: (id: string, b: Partial<Pick<HouseChannel, 'name' | 'enabled' | 'kinds' | 'whenAway' | 'waitMinutes' | 'volume'>>) =>
    patch<HouseChannel>(`house/channels/${id}`, b),
  removeHouseChannel: (id: string) => del(`house/channels/${id}`),
  testHouseChannel: (id: string) => post<HouseResult>(`house/channels/${id}/test`),
  setHouseTts: (tts: string | null) => put<{ tts: string | null }>('house/settings', { tts }),
  setAccessMode: (mode: AccessMode) => put<{ mode: AccessMode }>('access/mode', { mode }),
  addPerson: (b: { name: string; haUserId?: string | null }) => post<User>('access/people', b),
  updatePerson: (
    id: string,
    b: Partial<{
      displayName: string;
      notifyServices: string[];
      ntfyTopic: string;
      quietStart: string;
      quietEnd: string;
      quietOff: boolean;
      weeklySummary: boolean;
      isChild: boolean;
      childScope: 'all' | 'assigned';
      confirmDefault: boolean;
      confirmers: string[];
      /** Berechtigungen ersetzen (nur Administratoren) */
      permissions: Permission[];
      /** "Wenig Zeit" bis zu diesem Tag (YYYY-MM-DD); null nimmt es zurück */
      busyUntil: string | null;
    }>,
  ) =>
    patch<User>(`access/people/${id}`, b),
  removePerson: (id: string) => del(`access/people/${id}`),
  boards: () => get<BoardSummary[]>('boards'),
  board: (id: string) => get<BoardView>(`boards/${id}`),
  /** Einzelne Karten (für den Live-Sync); gelöschte und archivierte fehlen in der Antwort */
  cardsByIds: (ids: string[]) => get<Card[]>(`cards?ids=${ids.map(encodeURIComponent).join(',')}`),
  createBoard: (name: string, template?: string, access: BoardAccessInput = {}) => post<Board>('boards', { name, ...(template ? { template } : {}), ...access }),
  templates: () => get<TemplateInfo[]>('templates'),
  saveAsTemplate: (boardId: string, name: string, withCards = true) => post<TemplateInfo>(`boards/${boardId}/save-as-template`, { name, ...(withCards ? {} : { withCards: false }) }),
  deleteTemplate: (id: string) => del(`templates/${id}`),
  updateBoard: (id: string, b: Partial<{ name: string; icon: string | null; color: string | null; archiveAfterDays: number }> & BoardAccessInput) => patch<Board>(`boards/${id}`, b),
  /** Was ein Wechsel der Sichtbarkeit oder der Mitglieder bewirken würde, ohne ihn auszuführen */
  boardAccessPreview: (id: string, q: BoardAccessInput) => {
    const p = new URLSearchParams();
    if (q.visibility) p.set('visibility', q.visibility);
    if (q.memberIds) p.set('members', q.memberIds.join(','));
    return get<BoardAccessPreview>(`boards/${id}/access-preview?${p}`);
  },
  /** Boards ohne Besitzer (nur Administratoren): nur Name und Zahl der Karten */
  orphanBoards: () => get<{ id: string; name: string; cards: number }[]>('admin/orphan-boards'),
  deleteOrphanBoard: (id: string) => del(`admin/orphan-boards/${id}`),
  deleteBoard: (id: string) => del(`boards/${id}`),
  /** Was das Löschen trifft: Aufgaben, wiederkehrende Aufgaben, Wächter, Erinnerungen; ob es gesperrt ist */
  boardDeletePreview: (id: string) => get<BoardDeletePreview>(`boards/${id}/delete-preview`),
  /** Löschen mit der Wahl je Wächter (Schlüssel: Kennung des Wächters) */
  deleteBoardWith: (id: string, watchers: Record<string, WatcherChoice>) => post<{ paused: string[]; moved: string[]; removed: string[] }>(`boards/${id}/delete`, { watchers }),
  archiveBoard: (id: string) => post<{ paused: string[] }>(`boards/${id}/archive-board`),
  unarchiveBoard: (id: string) => post<{ resumed: string[] }>(`boards/${id}/unarchive`),
  archivedBoards: () => get<BoardSummary[]>('boards/archived'),
  /** Reihenfolge der Boards (gilt für alle): genau die Boards, die die Person sieht */
  reorderBoards: (ids: string[]) => post<void>('boards/order', { ids }),
  duplicateBoard: (id: string, input: BoardDuplicateInput) => post<Board>(`boards/${id}/duplicate`, input),
  archived: (boardId: string) => get<Card[]>(`boards/${boardId}/archive`),

  addColumn: (boardId: string, name: string) => post<Column>(`boards/${boardId}/columns`, { name }),
  updateColumn: (id: string, b: Partial<{ name: string; isDone: boolean; isPlanned: boolean }>) =>
    patch<Column>(`columns/${id}`, b),
  moveColumn: (id: string, afterId: string | null) => post<Column>(`columns/${id}/move`, { afterId }),
  deleteColumn: (id: string, moveTo?: string) => del(`columns/${id}${moveTo ? `?moveTo=${moveTo}` : ''}`),

  addCategory: (boardId: string, name: string, color: string) => post<Category>(`boards/${boardId}/categories`, { name, color }),
  updateCategory: (id: string, b: Partial<{ name: string; color: string }>) => patch<Category>(`categories/${id}`, b),
  deleteCategory: (id: string) => del(`categories/${id}`),

  createCard: (boardId: string, input: CardInput) => post<CardDetail>(`boards/${boardId}/cards`, input),
  card: (id: string) => get<CardDetail>(`cards/${id}`),
  updateCard: (id: string, p: CardPatch) => patch<CardDetail>(`cards/${id}`, p),
  deleteCard: (id: string) => del(`cards/${id}`),
  moveCard: (id: string, columnId: string, afterId?: string | null) =>
    post<CardDetail>(`cards/${id}/move`, afterId === undefined ? { columnId } : { columnId, afterId }),
  complete: (id: string) => post<CompleteResult>(`cards/${id}/complete`),
  /** Ein Bestätiger sagt „Bestätigen" (erledigt die Karte) oder „Nochmal" (nimmt die Anfrage zurück) */
  confirmCard: (id: string) => post<CompleteResult>(`cards/${id}/confirm`),
  rejectCard: (id: string) => post<CardDetail>(`cards/${id}/reject`),
  duplicateCard: (id: string) => post<CardDetail>(`cards/${id}/duplicate`),
  /** Symbole aus Titeln erkennen (Administrator): Karten ohne Symbol holen, erkannte Symbole zurückgeben */
  iconCandidates: () => get<{ id: string; title: string }[]>('icons/candidates'),
  applyIcons: (items: { id: string; icon: string }[]) => post<{ updated: number; skipped: number }>('icons/apply', { items }),
  undo: (completionId: string) => post<CardDetail>(`completions/${completionId}/undo`),
  restoreArchived: (id: string, columnId: string) => post<CardDetail>(`cards/${id}/restore-archived`, { columnId }),

  addChecklist: (cardId: string, text: string) => post<ChecklistItem>(`cards/${cardId}/checklist`, { text }),
  updateChecklist: (id: string, b: Partial<{ text: string; done: boolean }>) => patch<ChecklistItem>(`checklist/${id}`, b),
  deleteChecklist: (id: string) => del(`checklist/${id}`),

  addLink: (cardId: string, url: string, title?: string) => post<CardLink>(`cards/${cardId}/links`, { url, title }),
  updateLink: (id: string, b: Partial<{ url: string; title: string | null }>) => patch<CardLink>(`links/${id}`, b),
  deleteLink: (id: string) => del(`links/${id}`),

  /** Eigenes Personenbild (oder als Administrator das einer anderen Person) hochladen: die Bytes selbst, nicht als Formular */
  uploadAvatar: (personId: string, image: Blob): Promise<User> =>
    send<User>(`people/${encodeURIComponent(personId)}/avatar`, {
      method: 'PUT',
      headers: { ...clientHeaders(), 'content-type': image.type || 'image/webp' },
      body: image,
    }),
  removeAvatar: (personId: string) => del(`people/${encodeURIComponent(personId)}/avatar`),

  uploadAttachment: (cardId: string, file: Blob, filename: string, thumb: Blob | null): Promise<Attachment> => {
    const form = new FormData();
    form.append('file', file, filename);
    if (thumb) form.append('thumb', thumb, 'vorschau.jpg');
    return send<Attachment>(`cards/${cardId}/attachments`, { method: 'POST', headers: clientHeaders(), body: form });
  },
  deleteAttachment: (id: string) => del(`attachments/${id}`),

  /** Rückmeldung senden: ohne Bild als JSON, mit Bild als Formular (die Bilder sind schon verkleinert, siehe prepareUpload) */
  sendFeedback: (f: { kind: FeedbackKind; message: string; context: FeedbackContext; image?: { file: Blob; filename: string; thumb: Blob | null } | null }): Promise<{ id: string }> => {
    if (!f.image) return post<{ id: string }>('feedback', { kind: f.kind, message: f.message, context: f.context });
    const form = new FormData();
    form.append('kind', f.kind);
    form.append('message', f.message);
    form.append('context', JSON.stringify(f.context));
    form.append('image', f.image.file, f.image.filename);
    if (f.image.thumb) form.append('thumb', f.image.thumb, 'vorschau.jpg');
    return send<{ id: string }>('feedback', { method: 'POST', headers: clientHeaders(), body: form });
  },
  /** Verwaltung (nur Administratoren) */
  feedback: () => get<{ items: FeedbackItem[]; newCount: number }>('feedback'),
  feedbackSummary: () => get<{ newCount: number }>('feedback/summary'),
  setFeedbackStatus: (id: string, status: FeedbackStatus) => patch<FeedbackItem>(`feedback/${id}`, { status }),
  deleteFeedback: (id: string) => del(`feedback/${id}`),

  comments: (cardId: string) => get<Comment[]>(`cards/${cardId}/comments`),
  addComment: (cardId: string, text: string) => post<Comment>(`cards/${cardId}/comments`, { text }),
  deleteComment: (id: string) => del(`comments/${id}`),

  trash: () => get<TrashItem[]>('trash'),
  restore: (type: TrashItem['type'], id: string) => post<void>(`trash/${type}/${id}/restore`),

  settings: () => get<Settings>('settings'),
  saveSettings: (b: Partial<{ dashboardPath: string | null; panelPath: string | null; defaultDueTime: string | null; dailySummaryTime: string | null }>) => put<Settings>('settings', b),
  haDashboards: () => get<HaDashboards>('ha/dashboards'),
  saveDashboard: (path: string | null) => put<void>('me/dashboard', { path }),
  testPush: (person: string) => post<{ sent: string[] }>('spike/test-push', { person }),
  /** Test-Nachricht an die eigenen Geräte über den Push-Weg der Betriebsart (Container) */
  testPushOwn: (b?: { kind: 'onboarding'; cardTitle?: string; personId?: string }) => post<{ sent: boolean }>('push/test', b),
  /** Einrichtung beim ersten Start: „fertig" oder „übersprungen" setzen, nochmal durchgehen (löschen), Schritt und Auswahl merken */
  setOnboarding: (status: 'done' | 'skipped') => put<void>('me/onboarding', { status }),
  resetOnboarding: () => del('me/onboarding'),
  saveOnboardingProgress: (step: string, selection?: Record<string, unknown>) => put<void>('me/onboarding/progress', { step, ...(selection ? { selection } : {}) }),
  pushStatus: () => get<PushStatus>('notifications/status'),

  schedule: (q: { from?: string; to?: string; boards?: string[]; done?: boolean; undated?: boolean }) => {
    const p = new URLSearchParams();
    if (q.from) p.set('from', q.from);
    if (q.to) p.set('to', q.to);
    if (q.boards?.length) p.set('boards', q.boards.join(','));
    if (q.done) p.set('done', '1');
    /** nur offene Karten ohne Termin (Filter „Ohne Termin") */
    if (q.undated) p.set('undated', '1');
    return get<ScheduleCard[]>(`schedule${p.size ? `?${p}` : ''}`);
  },

  watchers: () => get<{ available: boolean; items: WatcherItem[] }>('watchers'),
  watcherActivity: () => get<WatcherActivity[]>('watchers/activity'),
  /** Antwort nach Anlegen und Ändern: mit `metNow`, wenn die Bedingung schon erfüllt ist und nichts von selbst auslöst (dann fragt die App) */
  createWatcher: (b: WatcherInput) => post<SavedWatcher>('watchers', b),
  updateWatcher: (id: string, b: Partial<WatcherInput>) => patch<SavedWatcher>(`watchers/${id}`, b),
  /** „Ja, Karte erstellen“ auf diese Rückfrage (409, wenn die Bedingung nicht mehr gilt oder schon eine Karte offen ist) */
  fireWatcherNow: (id: string) => post<WatcherItem>(`watchers/${id}/fire-now`),
  deleteWatcher: (id: string) => del(`watchers/${id}`),
  testWatcher: (id: string) => post<WatcherItem>(`watchers/${id}/test`),
  /** Sammelknopf: Wächter mit Vorlagennamen bekommen das Gerät im Namen (nur Administratoren) */
  suggestWatcherCategories: () => post<{ updated: number }>('watchers/suggest-categories'),
  resetWatcherCounter: (id: string) => post<WatcherItem>(`watchers/${id}/reset-counter`),
  watcherRuns: (id: string) => get<WatcherRun[]>(`watchers/${id}/runs`),
  watcherTemplates: () => get<WatcherTemplate[]>('watchers/templates'),
  /** Was in Home Assistant zu einer Vorlage passt (ohne Entitäten, die schon ein Wächter beobachtet) */
  watcherSuggestions: () => get<{ items: WatcherSuggestion[]; hidden: WatcherSuggestion[] }>('watchers/suggestions'),
  /** Einen Treffer von „Gefunden" ausblenden (nie wieder vorschlagen) oder wieder einblenden */
  hideSuggestion: (templateId: string, entityId: string) => post<void>('watchers/suggestions/hide', { templateId, entityId }),
  unhideSuggestion: (templateId: string, entityId: string) => post<void>('watchers/suggestions/unhide', { templateId, entityId }),
  /** Probelauf: die Regel auf die Historie der letzten 7 Tage anwenden, ohne zu speichern */
  dryRun: (b: { trigger: WatcherInput['trigger']; cooldownMin: number }, signal?: AbortSignal) => post<DryRunResult>('watchers/dry-run', b, signal),
  /** Verlauf einer Entität (letzte Stunden) mit den Stellen, an denen die Regel ausgelöst hätte; nie ein Fehler: der Status sagt, wenn es keinen gibt */
  entityHistory: (q: { entityId: string; hours?: number; kind?: string; value?: string; to?: string; forMin?: string; count?: string; cooldownMin?: string }) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
    return get<EntityHistory>(`watchers/history?${p}`);
  },
  /** Die Reihenfolge für „An wen": für einen gespeicherten Wächter (`watcherId`) oder einen Entwurf */
  watcherOrder: (q: { watcherId?: string; boardId?: string; mode?: string; personIds?: string[]; fallback?: string; fallbackPersonId?: string }) => {
    const p = new URLSearchParams();
    if (q.watcherId) p.set('watcherId', q.watcherId);
    if (q.boardId) p.set('boardId', q.boardId);
    if (q.mode) p.set('mode', q.mode);
    if (q.personIds) p.set('personIds', q.personIds.join(','));
    if (q.fallback) p.set('fallback', q.fallback);
    if (q.fallbackPersonId) p.set('fallbackPersonId', q.fallbackPersonId);
    return get<OrderView>(`watchers/order?${p}`);
  },
  haEntities: (q: string, domain?: string, signal?: AbortSignal) =>
    get<HaEntity[]>(`ha/entities?q=${encodeURIComponent(q)}${domain ? `&domain=${encodeURIComponent(domain)}` : ''}`, signal),
  exportData: () => post<{ dir: string; bytes: number; files: boolean }>('admin/export'),

  nudgeInfo: (cardId: string) => get<NudgeInfo>(`cards/${cardId}/nudges`),
  nudge: (cardId: string, b: { to: string[]; template?: NudgeTemplate; text?: string }) =>
    post<NudgeResult>(`cards/${cardId}/nudge`, b),
};

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

/** Karte mit Termin samt Board (Antwort von /api/schedule) */
export interface ScheduleCard extends Card {
  boardName: string;
  boardColor: string | null;
  /** die Kategorien der Karte (Name und Farbe); Aufgaben zeigt die erste in der Zeile */
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

export type { HaEntity, SavedWatcher, WatcherActivity, WatcherInput, WatcherItem, WatcherRun } from './watcher-types';

export interface NudgeResult {
  sent: { nudgeId: string; to: string; status: 'sent' | 'queued'; deliverAt: string }[];
  skipped: { to: string; reason: 'self' | 'no_person' | 'no_device' | 'rate'; retryAt: string | null }[];
}
