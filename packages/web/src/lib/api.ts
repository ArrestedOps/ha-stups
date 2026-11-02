import type { Recurrence } from './recurrence';
import type { HaEntity, WatcherActivity, WatcherInput, WatcherItem, WatcherRun } from './watcher-types';

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
  /** Hat ein ntfy-Thema (das Thema selbst sehen nur die Person und Administratoren, siehe AccessInfo) */
  ntfy: boolean;
  /** Ruhezeit für Stupse */
  nudgeQuiet: { start: string; end: string; off: boolean };
}

export type AccessMode = 'everyone' | 'selected';

export interface Me {
  user: User;
  people: User[];
  /** Administrator in Home Assistant: darf Personen, Zugriff und Dashboard ändern */
  isAdmin: boolean;
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
}

export interface CardInput {
  columnId: string;
  title: string;
  description?: string | null;
  priority?: Priority | null;
  dueAt?: string | null;
  recurrence?: Recurrence | null;
  remindBeforeMin?: number | null;
  overdueNag?: boolean;
  costCents?: number | null;
  carryOver?: CarryField[];
  assigneeIds?: string[];
  categoryIds?: string[];
}
export type CardPatch = Partial<Omit<CardInput, 'columnId'>>;

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
export interface Capabilities {
  mode: 'addon' | 'standalone-ha' | 'standalone';
  /** normale App oder Beta */
  channel: 'stable' | 'beta';
  /** ingress: Anmeldung über Home Assistant; session: eigenes Konto mit Passwort */
  auth: 'ingress' | 'session';
  ha: boolean;
  watchers: boolean;
  sensors: boolean;
  push: string[];
  publicUrl: string | null;
  /** Anmeldung mit Passkey ist eingerichtet (eigene Konten, STUPS_PUBLIC_URL mit HTTPS) */
  passkeys: boolean;
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
const CLIENT = { 'x-stups-client': '1' };

// Relative Adresse: funktioniert unter dem wechselnden Ingress-Pfad von Home Assistant.
async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`api/${path}`, {
      method,
      headers: body === undefined ? CLIENT : { ...CLIENT, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Keine Verbindung zum Server', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('auth/')) onUnauthorized?.();
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Fehler ${res.status}`, res.status, data);
  return data as T;
}

const get = <T>(p: string) => req<T>('GET', p);
const post = <T>(p: string, b: unknown = {}) => req<T>('POST', p, b);
const patch = <T>(p: string, b: unknown) => req<T>('PATCH', p, b);
const put = <T>(p: string, b: unknown) => req<T>('PUT', p, b);
const del = (p: string) => req<void>('DELETE', p);

export const api = {
  capabilities: () => get<Capabilities>('capabilities'),
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
  setAccessMode: (mode: AccessMode) => put<{ mode: AccessMode }>('access/mode', { mode }),
  addPerson: (b: { name: string; haUserId?: string | null }) => post<User>('access/people', b),
  updatePerson: (
    id: string,
    b: Partial<{ displayName: string; notifyServices: string[]; ntfyTopic: string; quietStart: string; quietEnd: string; quietOff: boolean }>,
  ) =>
    patch<User>(`access/people/${id}`, b),
  removePerson: (id: string) => del(`access/people/${id}`),
  boards: () => get<BoardSummary[]>('boards'),
  board: (id: string) => get<BoardView>(`boards/${id}`),
  createBoard: (name: string) => post<Board>('boards', { name }),
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
  duplicateCard: (id: string) => post<CardDetail>(`cards/${id}/duplicate`),
  undo: (completionId: string) => post<CardDetail>(`completions/${completionId}/undo`),
  restoreArchived: (id: string, columnId: string) => post<CardDetail>(`cards/${id}/restore-archived`, { columnId }),

  addChecklist: (cardId: string, text: string) => post<ChecklistItem>(`cards/${cardId}/checklist`, { text }),
  updateChecklist: (id: string, b: Partial<{ text: string; done: boolean }>) => patch<ChecklistItem>(`checklist/${id}`, b),
  deleteChecklist: (id: string) => del(`checklist/${id}`),

  addLink: (cardId: string, url: string, title?: string) => post<CardLink>(`cards/${cardId}/links`, { url, title }),
  updateLink: (id: string, b: Partial<{ url: string; title: string | null }>) => patch<CardLink>(`links/${id}`, b),
  deleteLink: (id: string) => del(`links/${id}`),

  uploadAttachment: async (cardId: string, file: Blob, filename: string, thumb: Blob | null): Promise<Attachment> => {
    const form = new FormData();
    form.append('file', file, filename);
    if (thumb) form.append('thumb', thumb, 'vorschau.jpg');
    let res: Response;
    try {
      res = await fetch(`api/cards/${cardId}/attachments`, { method: 'POST', headers: CLIENT, body: form });
    } catch {
      throw new ApiError('Keine Verbindung zum Server', 0);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Fehler ${res.status}`, res.status);
    return data as Attachment;
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
