import { i18n, type LanguageChoice, t } from './i18n/index.svelte';
import type { Recurrence } from './recurrence';
import type { EntityHistory } from './history';
import type { DryRunResult, HaEntity, OrderView, WatcherActivity, WatcherInput, WatcherItem, WatcherRun, WatcherSuggestion, WatcherTemplate } from './watcher-types';

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
  /** false: Home Assistant kennt den Benutzer, Stups lässt ihn aber (noch) nicht hinein */
  allowed: boolean;
  accessMode: AccessMode;
}

export interface AccessInfo {
  mode: AccessMode;
  /** Personen, Geräte und Zugriff kommen aus der Add-on-Konfiguration und sind in der App gesperrt */
  managed: boolean;
  isAdmin: boolean;
  people: (User & { isAdmin: boolean; ntfyTopic?: string | null })[];
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
  overdueNag: boolean;
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
}
export interface CardDetail extends Card {
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
  overdueNag?: boolean;
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
  phase: 'waiting' | 'running' | 'soon' | 'quiet';
  since: string | null;
  progress: { n: number; of: number } | null;
  /** Titel der Karte, die danach kommt */
  nextCard: string;
  entityMissing: boolean;
  openCard: { id: string; title: string; boardId: string; assigneeIds: string[]; createdAt: string } | null;
  nextEvent: { title: string; at: string } | null;
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
async function send<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`api/${path}`, init);
  } catch {
    throw new ApiError(t('Keine Verbindung zum Server'), 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('auth/')) onUnauthorized?.();
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? t('Fehler {status}', { status: res.status }), res.status, data);
  return data as T;
}

function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  return send<T>(path, {
    method,
    headers: body === undefined ? clientHeaders() : { ...clientHeaders(), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const get = <T>(p: string) => req<T>('GET', p);
const post = <T>(p: string, b: unknown = {}) => req<T>('POST', p, b);
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
  createBoard: (name: string, template?: string) => post<Board>('boards', template ? { name, template } : { name }),
  templates: () => get<TemplateInfo[]>('templates'),
  saveAsTemplate: (boardId: string, name: string) => post<TemplateInfo>(`boards/${boardId}/save-as-template`, { name }),
  deleteTemplate: (id: string) => del(`templates/${id}`),
  updateBoard: (id: string, b: Partial<{ name: string; archiveAfterDays: number }>) => patch<Board>(`boards/${id}`, b),
  deleteBoard: (id: string) => del(`boards/${id}`),
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

  comments: (cardId: string) => get<Comment[]>(`cards/${cardId}/comments`),
  addComment: (cardId: string, text: string) => post<Comment>(`cards/${cardId}/comments`, { text }),
  deleteComment: (id: string) => del(`comments/${id}`),

  trash: () => get<TrashItem[]>('trash'),
  restore: (type: TrashItem['type'], id: string) => post<void>(`trash/${type}/${id}/restore`),

  settings: () => get<Settings>('settings'),
  saveSettings: (b: Partial<{ dashboardPath: string | null; panelPath: string | null; defaultDueTime: string | null }>) => put<Settings>('settings', b),
  dashboards: () => get<{ title: string; path: string }[]>('dashboards'),
  testPush: (person: string) => post<{ sent: string[] }>('spike/test-push', { person }),
  /** Test-Nachricht an die eigenen Geräte über den Push-Weg der Betriebsart (Container) */
  testPushOwn: () => post<{ sent: boolean }>('push/test'),
  pushStatus: () => get<PushStatus>('notifications/status'),

  schedule: (q: { from?: string; to?: string; boards?: string[]; done?: boolean }) => {
    const p = new URLSearchParams();
    if (q.from) p.set('from', q.from);
    if (q.to) p.set('to', q.to);
    if (q.boards?.length) p.set('boards', q.boards.join(','));
    if (q.done) p.set('done', '1');
    return get<ScheduleCard[]>(`schedule${p.size ? `?${p}` : ''}`);
  },

  watchers: () => get<{ available: boolean; items: WatcherItem[] }>('watchers'),
  watcherActivity: () => get<WatcherActivity[]>('watchers/activity'),
  createWatcher: (b: WatcherInput) => post<WatcherItem>('watchers', b),
  updateWatcher: (id: string, b: Partial<WatcherInput>) => patch<WatcherItem>(`watchers/${id}`, b),
  deleteWatcher: (id: string) => del(`watchers/${id}`),
  testWatcher: (id: string) => post<WatcherItem>(`watchers/${id}/test`),
  resetWatcherCounter: (id: string) => post<WatcherItem>(`watchers/${id}/reset-counter`),
  watcherRuns: (id: string) => get<WatcherRun[]>(`watchers/${id}/runs`),
  watcherTemplates: () => get<WatcherTemplate[]>('watchers/templates'),
  /** Was in Home Assistant zu einer Vorlage passt (ohne Entitäten, die schon ein Wächter beobachtet) */
  watcherSuggestions: () => get<{ items: WatcherSuggestion[]; hidden: WatcherSuggestion[] }>('watchers/suggestions'),
  /** Einen Treffer von „Gefunden" ausblenden (nie wieder vorschlagen) oder wieder einblenden */
  hideSuggestion: (templateId: string, entityId: string) => post<void>('watchers/suggestions/hide', { templateId, entityId }),
  unhideSuggestion: (templateId: string, entityId: string) => post<void>('watchers/suggestions/unhide', { templateId, entityId }),
  /** Probelauf: die Regel auf die Historie der letzten 7 Tage anwenden, ohne zu speichern */
  dryRun: (b: { trigger: WatcherInput['trigger']; cooldownMin: number }) => post<DryRunResult>('watchers/dry-run', b),
  /** Verlauf einer Entität (letzte Stunden) mit den Stellen, an denen die Regel ausgelöst hätte; nie ein Fehler: der Status sagt, wenn es keinen gibt */
  entityHistory: (q: { entityId: string; hours?: number; kind?: string; value?: string; to?: string; forMin?: string; count?: string; cooldownMin?: string }) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
    return get<EntityHistory>(`watchers/history?${p}`);
  },
  /** Die Reihenfolge für „An wen": für einen gespeicherten Wächter (`watcherId`) oder einen Entwurf */
  watcherOrder: (q: { watcherId?: string; mode?: string; personIds?: string[]; fallback?: string; fallbackPersonId?: string }) => {
    const p = new URLSearchParams();
    if (q.watcherId) p.set('watcherId', q.watcherId);
    if (q.mode) p.set('mode', q.mode);
    if (q.personIds) p.set('personIds', q.personIds.join(','));
    if (q.fallback) p.set('fallback', q.fallback);
    if (q.fallbackPersonId) p.set('fallbackPersonId', q.fallbackPersonId);
    return get<OrderView>(`watchers/order?${p}`);
  },
  haEntities: (q: string, domain?: string) =>
    get<HaEntity[]>(`ha/entities?q=${encodeURIComponent(q)}${domain ? `&domain=${encodeURIComponent(domain)}` : ''}`),
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

export type { HaEntity, WatcherActivity, WatcherInput, WatcherItem, WatcherRun } from './watcher-types';

export interface NudgeResult {
  sent: { nudgeId: string; to: string; status: 'sent' | 'queued'; deliverAt: string }[];
  skipped: { to: string; reason: 'self' | 'no_person' | 'no_device' | 'rate'; retryAt: string | null }[];
}
