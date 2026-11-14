import type { LanguageChoice } from '../i18n/index.svelte';
import { clientHeaders, del, get, getList, patch, post, put, send } from './http';
import { fetchAllPages } from '../paging';

/** So viele Aufgaben holt eine Seite von `GET /api/schedule` höchstens (der Höchstwert des Servers) */
const SCHEDULE_PAGE = 2000;
import type { FeedbackContext, FeedbackItem, FeedbackKind, FeedbackStatus } from '../feedback';
import type { Permission } from '../permissions';
import type { EntityHistory } from '../history';
import type { DryRunResult, HaEntity, OrderView, SavedWatcher, WatcherActivity, WatcherInput, WatcherItem, WatcherRun, WatcherSuggestion, WatcherTemplate } from '../watcher-types';
import type { User, AccessMode, Me, AccessInfo, Board, BoardDeletePreview, WatcherChoice, BoardDuplicateInput, BoardAccessPreview, BoardAccessInput, BoardSummary, Column, Category, Card, ChecklistItem, CardLink, Attachment, CardDetail, Comment, BoardView, Settings, TrashItem, CompleteResult, CardInput, CardPatch, TemplateInfo, InboxPage, HaDashboards, Today, HomeState, Fairness, HouseType, HouseResult, HouseChannel, HouseInfo, HouseEntities, Capabilities, BetaState, PasskeyInfo, PasskeyCeremony, AuthStatus, Account, PushStatus, ScheduleCard, NudgeTemplate, NudgeInfo, NudgeResult } from './types';

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
  today: (signal?: AbortSignal) => get<Today>('today', signal),
  inbox: (before?: string, signal?: AbortSignal) => get<InboxPage>(`inbox${before ? `?before=${encodeURIComponent(before)}` : ''}`, signal),
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
  /** Einzelne Aufgaben (für den Live-Sync); gelöschte und archivierte fehlen in der Antwort */
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
  /** Boards ohne Besitzer (nur Administratoren): nur Name und Zahl der Aufgaben */
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
  /** Ein Bestätiger sagt „Bestätigen" (erledigt die Aufgabe) oder „Nochmal" (nimmt die Anfrage zurück) */
  confirmCard: (id: string) => post<CompleteResult>(`cards/${id}/confirm`),
  rejectCard: (id: string) => post<CardDetail>(`cards/${id}/reject`),
  duplicateCard: (id: string) => post<CardDetail>(`cards/${id}/duplicate`),
  /** Symbole aus Titeln erkennen (Administrator): Aufgaben ohne Symbol holen, erkannte Symbole zurückgeben */
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
  saveSettings: (b: Partial<{ dashboardPath: string | null; panelPath: string | null; defaultDueTime: string | null; dailySummaryTime: string | null; overdueNagTime: string | null }>) => put<Settings>('settings', b),
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

  /**
   * Alle passenden Aufgaben: Der Server liefert höchstens SCHEDULE_PAGE je Antwort und nennt die Gesamtzahl, hier wird weitergeblättert,
   * bis alles da ist (ein Fehler bei einer Seite ist ein Fehler für das Ganze, nie eine stillschweigend unvollständige Liste).
   */
  schedule: (q: { from?: string; to?: string; boards?: string[]; done?: boolean; undated?: boolean; completedSince?: string }, signal?: AbortSignal) => {
    const p = new URLSearchParams();
    if (q.from) p.set('from', q.from);
    if (q.to) p.set('to', q.to);
    if (q.boards?.length) p.set('boards', q.boards.join(','));
    if (q.done) p.set('done', '1');
    /** nur offene Aufgaben ohne Termin (Filter „Ohne Termin") */
    if (q.undated) p.set('undated', '1');
    /** nur Aufgaben, die seit diesem Zeitpunkt erledigt wurden („Zuletzt erledigt"), unabhängig von ihrer Fälligkeit */
    if (q.completedSince) p.set('completedSince', q.completedSince);
    p.set('limit', String(SCHEDULE_PAGE));
    return fetchAllPages<ScheduleCard>(async (offset) => {
      const pp = new URLSearchParams(p);
      pp.set('offset', String(offset));
      return getList<ScheduleCard>(`schedule?${pp}`, signal);
    }, SCHEDULE_PAGE);
  },

  watchers: () => get<{ available: boolean; items: WatcherItem[] }>('watchers'),
  watcherActivity: () => get<WatcherActivity[]>('watchers/activity'),
  /** Antwort nach Anlegen und Ändern: mit `metNow`, wenn die Bedingung schon erfüllt ist und nichts von selbst auslöst (dann fragt die App) */
  createWatcher: (b: WatcherInput) => post<SavedWatcher>('watchers', b),
  updateWatcher: (id: string, b: Partial<WatcherInput>) => patch<SavedWatcher>(`watchers/${id}`, b),
  /** „Ja, Aufgabe erstellen“ auf diese Rückfrage (409, wenn die Bedingung nicht mehr gilt oder schon eine Aufgabe offen ist) */
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
  /** Antwort auf einen Stups an mich: erledigt, mach ich, später */
  nudgeReply: (nudgeId: string, action: 'done' | 'ack' | 'later') => post<{ outcome: string }>(`nudges/${nudgeId}/reply`, { action }),
  nudge: (cardId: string, b: { to: string[]; template?: NudgeTemplate; text?: string }) =>
    post<NudgeResult>(`cards/${cardId}/nudge`, b),
};

export * from './types';
export { ApiError, REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS, setUnauthorizedHandler } from './http';
