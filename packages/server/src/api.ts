import { randomUUID } from 'node:crypto';
import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createAccess, type Access, type AccessResult } from './access.js';
import type { Directory } from './directory.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors.js';
import type { EventBus } from './events.js';
import { cleanFilename, extensionFor, MAX_FILE_BYTES, MAX_THUMB_BYTES, sniffMime, type FileStore } from './files.js';
import { fetchPageTitle, normalizeUrl, resolveMapsLink as resolveShortMapsLink } from './links.js';
import { ensureWebsocket } from './ws.js';
import { NUDGE_TEMPLATES, NUDGE_TEXT_MAX, type Store, type TrashType, type User } from './store.js';
import type { HaState, WatcherProbe } from './ha.js';
import type { ExportResult } from './transfer.js';
import type { AutomationEntry } from './automation-cards.js';
import type { WatcherData } from './watcher-data.js';
import { parseWatcher, type WatcherConfig } from './watcher-types.js';
import type { Watchers } from './watchers.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    /** Rolle und Zugriff des angemeldeten Home-Assistant-Benutzers */
    access: AccessResult | null;
  }
}

/** Auch ohne Zugriff erreichbar: damit die Oberfläche erklären kann, warum nichts angezeigt wird */
const OPEN_PATHS = new Set(['/api/me']);

export interface ApiDeps {
  store: Store;
  /** Looks up the <title> of a page. Injected so tests need no network. */
  fetchTitle?: (url: string) => Promise<string | null>;
  /** Löst Google-Kurzlinks auf; null = nichts zu tun */
  resolveMapsLink?: (url: string) => Promise<{ url: string; title: string | null } | null>;
  /** Meldet Änderungen an alle verbundenen Geräte (Live-Sync). */
  bus?: EventBus;
  /** Räumt Push-Nachrichten auf, wenn eine Karte in der App erledigt wurde; tick stellt neue Stupse sofort zu. */
  notifier?: { clearFor(cardId: string): Promise<void>; tick?(): Promise<number> };
  ha?: {
    listDashboards(): Promise<{ title: string; path: string }[]>;
    listNotifyServices?(): Promise<string[]>;
    probeWatchers?(entityId?: string): Promise<WatcherProbe>;
    getStates?(): Promise<HaState[]>;
  };
  /** Wächter (nur mit Verbindung zu Home Assistant) */
  watchers?: Pick<Watchers, 'view' | 'onSaved' | 'test' | 'resetCounter' | 'syncSubscriptions'>;
  watcherData?: WatcherData;
  /** Letzte Ereignisse stups_create_card mit Ergebnis (für die Diagnose) */
  automationLog?: () => AutomationEntry[];
  /** Personen und Administratoren aus Home Assistant; ohne sie gelten Personen als Administratoren */
  directory?: Directory;
  /** Zugriffsregeln; Vorgabe ergibt sich aus Store und Verzeichnis */
  access?: Access;
  /** Vorgabe aus den Add-on-Optionen */
  defaultDashboardPath?: string;
  /** Ablage für Anhänge, ohne sie gibt es keine Uploads */
  files?: FileStore;
  /** Schreibt Datenbank und Anhänge für den Umzug in eine andere App nach /share */
  exportData?: () => ExportResult;
}

type Params = { id: string };

function body(req: FastifyRequest): Record<string, any> {
  const b = req.body;
  if (b === undefined || b === null) return {};
  if (typeof b !== 'object' || Array.isArray(b)) throw new ValidationError('Der Inhalt der Anfrage muss ein Objekt sein');
  return b as Record<string, any>;
}

export async function apiRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const { store } = deps;
  const fetchTitle = deps.fetchTitle ?? ((url: string) => fetchPageTitle(url));
  const resolveMapsLink = deps.resolveMapsLink ?? ((url: string) => resolveShortMapsLink(url));

  const access = deps.access ?? createAccess({ store, directory: deps.directory });
  app.decorateRequest('user', null);
  app.decorateRequest('access', null);

  const requireAdmin = (req: FastifyRequest) => {
    if (!req.access?.isAdmin) throw new ForbiddenError('Das dürfen nur Administratoren von Home Assistant');
  };

  app.setErrorHandler((err: Error & { statusCode?: number }, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Interner Fehler' });
  });

  app.addHook('preHandler', async (req) => {
    const u = req.haUser;
    if (!u) return;
    const result = await access.evaluate({ id: u.id, name: u.name, displayName: u.displayName });
    req.user = result.user;
    req.access = result;
    if (!result.allowed && !OPEN_PATHS.has(req.url.split('?')[0] ?? '')) {
      throw new ForbiddenError('Kein Zugriff: Bitte einen Administrator, dich freizugeben');
    }
  });

  // Jede erfolgreiche Änderung wird allen Geräten gemeldet, die sie dann nachladen.
  app.addHook('onResponse', async (req, reply) => {
    if (req.method !== 'GET' && reply.statusCode < 400) deps.bus?.emit({ by: req.user?.id ?? null });
  });

  await ensureWebsocket(app);
  app.get('/api/events', { websocket: true }, (socket) => {
    const bus = deps.bus;
    socket.send(JSON.stringify({ type: 'hello', seq: bus?.seq ?? 0 }));
    const off = bus?.subscribe((e) => socket.send(JSON.stringify({ type: 'changed', seq: e.seq, by: e.by })));
    const ping = setInterval(() => socket.ping(), 25_000);
    socket.on('close', () => {
      off?.();
      clearInterval(ping);
    });
  });

  const noContent = (reply: FastifyReply) => reply.code(204).send();

  // ----- Einstellungen -----
  const effectiveSettings = () => {
    const s = store.getSettings();
    const fallback = deps.defaultDashboardPath ?? '/';
    return { ...s, defaultDashboardPath: fallback, effectiveDashboardPath: s.dashboardPath ?? fallback };
  };
  app.get('/api/settings', async () => effectiveSettings());
  app.put('/api/settings', async (req) => {
    const b = body(req);
    // Der Panel-Pfad kommt von jedem Gerät, das Dashboard gilt für alle
    if (b.dashboardPath !== undefined) requireAdmin(req);
    store.setSettings({ dashboardPath: b.dashboardPath, panelPath: b.panelPath });
    return effectiveSettings();
  });
  // Zeigt, warum (k)eine Push-Nachricht ankommt: Dienste je Person und das Sendeprotokoll
  app.get('/api/notifications/status', async () => {
    const services = await deps.ha?.listNotifyServices?.().catch(() => null);
    const people = store.people();
    const byId = new Map(people.map((p) => [p.id, p]));
    const now = Date.now();
    // Offene Karten mit Termin: wer bekommt dafür eine Nachricht?
    const upcoming = store
      .openDueCards()
      .filter((c) => Date.parse(c.dueAt) > now - 12 * 3600_000)
      .slice(0, 10)
      .map((c) => {
        const who = c.assigneeIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
        return {
          title: c.title,
          dueAt: c.dueAt,
          assignees: who.map((p) => p.name),
          note:
            who.length === 0
              ? 'Niemand zuständig, deshalb keine Nachricht'
              : who.some((p) => p.notifyServices.length > 0)
                ? null
                : 'Kein Push-Gerät eingetragen (Einstellungen › Personen & Zugriff)',
        };
      });
    return {
      upcoming,
      people: people.map((p) => ({
        name: p.name,
        services: p.notifyServices.map((service) => ({ service, exists: services ? services.includes(service) : null })),
      })),
      recent: store.recentNotifications(15),
      nudges: store.recentNudges(10),
    };
  });
  app.get('/api/dashboards', async () => {
    try {
      return (await deps.ha?.listDashboards()) ?? [];
    } catch (err) {
      app.log.warn(`Dashboards konnten nicht gelesen werden: ${String(err)}`);
      return [];
    }
  });

  // ----- identity -----
  app.get('/api/me', async (req) => {
    const allowed = req.access?.allowed ?? false;
    return {
      user: req.user,
      people: allowed ? store.people() : [],
      isAdmin: req.access?.isAdmin ?? false,
      allowed,
      accessMode: store.getAccessMode(),
    };
  });
  app.get('/api/people', async () => store.people());

  // ----- Personen & Zugriff -----
  app.get('/api/access', async (req) => {
    const isAdmin = req.access?.isAdmin ?? false;
    const [haPersons, notifyServices] = await Promise.all([
      isAdmin ? deps.directory?.persons().catch(() => null) : null,
      deps.ha?.listNotifyServices?.().catch(() => null),
    ]);
    const people = store.people();
    const withRole = await Promise.all(
      people.map(async (p) => ({ ...p, isAdmin: p.haUserId ? ((await deps.directory?.isAdmin(p.haUserId)) ?? false) : false })),
    );
    // Wer als Administrator ohnehin hinein darf, wartet auf nichts
    const pending = isAdmin
      ? (
          await Promise.all(
            store.pendingUsers().map(async (u) => ((u.haUserId ? await deps.directory?.isAdmin(u.haUserId) : false) ? null : u)),
          )
        ).filter((u): u is NonNullable<typeof u> => u !== null)
      : [];
    const added = new Set(people.map((p) => p.haUserId).filter((id): id is string => !!id));
    const addedNames = new Set(people.map((p) => p.name.toLowerCase()));
    return {
      mode: store.getAccessMode(),
      managed: store.isManaged(),
      isAdmin,
      people: withRole,
      pending,
      // Personen aus Home Assistant, die noch nicht dabei sind
      haPersons: (haPersons ?? []).filter((p) => (p.userId ? !added.has(p.userId) : !addedNames.has(p.name.toLowerCase()))),
      services: notifyServices ? notifyServices.filter((s) => s.startsWith('mobile_app_')) : null,
      directoryAvailable: isAdmin ? haPersons !== null && haPersons !== undefined : null,
    };
  });
  // Steht eine Personenliste in der Add-on-Konfiguration, gilt sie: Personen, Geräte und Zugriff sind in der App gesperrt
  const notManaged = () => {
    if (store.isManaged()) {
      throw new ConflictError('Das wird in der Add-on-Konfiguration von Home Assistant verwaltet (Einstellungen › Apps › Stups › Konfiguration)');
    }
  };
  app.put('/api/access/mode', async (req) => {
    requireAdmin(req);
    notManaged();
    return { mode: store.setAccessMode(body(req).mode) };
  });
  app.post('/api/access/people', async (req, reply) => {
    requireAdmin(req);
    notManaged();
    const b = body(req);
    return reply.code(201).send(store.addPerson({ haUserId: typeof b.haUserId === 'string' ? b.haUserId : null, name: b.name }));
  });
  app.patch<{ Params: Params }>('/api/access/people/:id', async (req) => {
    const b = body(req);
    // Die eigenen Push-Geräte wählt jeder selbst, alles andere nur ein Administrator
    const own = req.user?.id === req.params.id;
    if (b.displayName !== undefined || !own) requireAdmin(req);
    let person = store.userById(req.params.id);
    if (!person) throw new NotFoundError('Person nicht gefunden');
    if (b.notifyServices !== undefined) notManaged();
    if (b.displayName !== undefined) person = store.renamePerson(person.id, b.displayName);
    if (b.notifyServices !== undefined) person = store.setNotifyServices(person.id, b.notifyServices);
    if (b.quietStart !== undefined || b.quietEnd !== undefined || b.quietOff !== undefined) {
      person = store.setNudgeQuiet(person.id, { start: b.quietStart, end: b.quietEnd, off: b.quietOff });
    }
    return person;
  });
  app.delete<{ Params: Params }>('/api/access/people/:id', async (req, reply) => {
    requireAdmin(req);
    notManaged();
    store.removePerson(req.params.id);
    return noContent(reply);
  });

  // ----- boards -----
  app.get('/api/boards', async () => store.listBoards());
  app.post('/api/boards', async (req, reply) => {
    const b = body(req);
    // Neue Boards bekommen die Spalte „Geplant", außer es wird ausdrücklich abgelehnt
    return reply
      .code(201)
      .send(store.createBoard({ name: b.name, icon: b.icon, color: b.color, withPlanned: b.withPlanned !== false }));
  });
  app.get<{ Params: Params }>('/api/boards/:id', async (req) => store.getBoardView(req.params.id));
  app.patch<{ Params: Params }>('/api/boards/:id', async (req) => {
    const b = body(req);
    return store.updateBoard(req.params.id, {
      name: b.name,
      icon: b.icon,
      color: b.color,
      archiveAfterDays: b.archiveAfterDays,
    });
  });
  app.delete<{ Params: Params }>('/api/boards/:id', async (req, reply) => {
    store.deleteBoard(req.params.id);
    return noContent(reply);
  });
  app.get<{ Params: Params }>('/api/boards/:id/archive', async (req) => store.listArchived(req.params.id));

  // ----- columns -----
  app.post<{ Params: Params }>('/api/boards/:id/columns', async (req, reply) => {
    const b = body(req);
    return reply.code(201).send(store.addColumn(req.params.id, { name: b.name, isDone: b.isDone, isPlanned: b.isPlanned }));
  });
  app.patch<{ Params: Params }>('/api/columns/:id', async (req) => {
    const b = body(req);
    return store.updateColumn(req.params.id, { name: b.name, isDone: b.isDone, isPlanned: b.isPlanned });
  });
  app.post<{ Params: Params }>('/api/columns/:id/move', async (req) => {
    const b = body(req);
    return store.moveColumn(req.params.id, b.afterId ?? null);
  });
  app.delete<{ Params: Params; Querystring: { moveTo?: string } }>('/api/columns/:id', async (req, reply) => {
    store.deleteColumn(req.params.id, req.query.moveTo);
    return noContent(reply);
  });

  // ----- categories -----
  app.post<{ Params: Params }>('/api/boards/:id/categories', async (req, reply) => {
    const b = body(req);
    return reply.code(201).send(store.addCategory(req.params.id, { name: b.name, color: b.color }));
  });
  app.patch<{ Params: Params }>('/api/categories/:id', async (req) => {
    const b = body(req);
    return store.updateCategory(req.params.id, { name: b.name, color: b.color });
  });
  app.delete<{ Params: Params }>('/api/categories/:id', async (req, reply) => {
    store.deleteCategory(req.params.id);
    return noContent(reply);
  });

  // ----- cards -----
  app.post<{ Params: Params }>('/api/boards/:id/cards', async (req, reply) => {
    const b = body(req);
    const card = store.createCard(
      req.params.id,
      {
        columnId: b.columnId,
        title: b.title,
        description: b.description,
        priority: b.priority,
        dueAt: b.dueAt,
        recurrence: b.recurrence,
        remindBeforeMin: b.remindBeforeMin,
        overdueNag: b.overdueNag,
        costCents: b.costCents,
        carryOver: b.carryOver,
        assigneeIds: b.assigneeIds,
        categoryIds: b.categoryIds,
      },
      req.user?.id ?? null,
    );
    return reply.code(201).send(card);
  });
  app.get<{ Params: Params }>('/api/cards/:id', async (req) => store.getCard(req.params.id));
  app.patch<{ Params: Params }>('/api/cards/:id', async (req) => {
    const b = body(req);
    const patch: Record<string, unknown> = {};
    for (const key of [
      'title',
      'description',
      'priority',
      'dueAt',
      'recurrence',
      'remindBeforeMin',
      'overdueNag',
      'costCents',
      'carryOver',
      'assigneeIds',
      'categoryIds',
    ]) {
      if (key in b) patch[key] = b[key];
    }
    return store.updateCard(req.params.id, patch, req.user?.id ?? null);
  });
  app.delete<{ Params: Params }>('/api/cards/:id', async (req, reply) => {
    store.deleteCard(req.params.id);
    return noContent(reply);
  });
  app.post<{ Params: Params }>('/api/cards/:id/move', async (req) => {
    const b = body(req);
    const before = store.getCard(req.params.id);
    const after = store.moveCard(req.params.id, { columnId: b.columnId, afterId: b.afterId }, req.user?.id ?? null);
    // Durch das Ablegen in "Erledigt" kann eine Karte erledigt worden sein: offene Pushes aufräumen.
    if (after.completedAt !== before.completedAt || after.dueAt !== before.dueAt) {
      void deps.notifier?.clearFor(after.id);
    }
    return after;
  });
  // ----- Termine über alle Boards (Agenda, Kalender) -----
  app.get<{ Querystring: { from?: string; to?: string; boards?: string; done?: string } }>('/api/schedule', async (req) => {
    const q = req.query;
    const time = (v: string | undefined, what: string): string | undefined => {
      if (v === undefined || v === '') return undefined;
      if (!/^\d{4}-\d{2}-\d{2}T/.test(v) || Number.isNaN(Date.parse(v))) throw new ValidationError(`„${what}" braucht Datum und Uhrzeit`);
      return new Date(v).toISOString();
    };
    const boardIds = q.boards ? q.boards.split(',').filter(Boolean) : undefined;
    return store
      .listSchedule({ from: time(q.from, 'from'), to: time(q.to, 'to'), boardIds, includeDone: q.done === '1' })
      .slice(0, 2000);
  });

  // ----- Stupsen -----
  app.get<{ Params: Params }>('/api/cards/:id/nudges', async (req) => {
    const me = req.user;
    const canNudge = !!me?.isPerson;
    return {
      canNudge,
      maxText: NUDGE_TEXT_MAX,
      templates: NUDGE_TEMPLATES,
      people: canNudge ? store.nudgeTargets(req.params.id, me!.id) : [],
    };
  });
  app.post<{ Params: Params }>('/api/cards/:id/nudge', async (req, reply) => {
    const b = body(req);
    const r = store.createNudges(req.params.id, req.user!.id, { to: b.to, template: b.template, text: b.text });
    if (r.sent.length === 0) {
      return reply.code(409).send({ error: 'Es ließ sich niemand stupsen (Sperrzeit oder kein Push-Gerät)', ...r });
    }
    // Sofort zustellen, statt auf den nächsten 30-Sekunden-Takt zu warten
    setImmediate(() => void deps.notifier?.tick?.().catch(() => undefined));
    return reply.code(201).send(r);
  });
  // ----- Wächter-Test für die Diagnose-Seite (nur Administratoren, nur lesend) -----
  app.post('/api/admin/watcher-probe', async (req) => {
    requireAdmin(req);
    if (!deps.ha?.probeWatchers) throw new ValidationError('Nicht verfügbar (keine Verbindung zu Home Assistant)');
    const entityId = body(req).entityId;
    if (entityId !== undefined && (typeof entityId !== 'string' || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(entityId))) {
      throw new ValidationError('Die Entität muss die Form domain.name haben');
    }
    try {
      return await deps.ha.probeWatchers(entityId);
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : 'Test fehlgeschlagen');
    }
  });

  // ----- Wächter: alle sehen sie, nur Administratoren ändern sie -----
  const watcherEngine = () => {
    if (!deps.watchers || !deps.watcherData) throw new ConflictError('Wächter brauchen die Verbindung zu Home Assistant');
    return { engine: deps.watchers, data: deps.watcherData };
  };

  /** Board, Spalte, Kategorien und Personen müssen es geben (sonst entstünde nie eine Karte) */
  function checkWatcherTargets(c: WatcherConfig): void {
    let view;
    try {
      view = store.getBoardView(c.card.boardId);
    } catch {
      throw new ValidationError('Das Board gibt es nicht');
    }
    if (!view.columns.some((x) => x.id === c.card.columnId)) throw new ValidationError('Die Spalte gehört nicht zu diesem Board');
    const cats = new Set(view.categories.map((x) => x.id));
    if (c.card.categoryIds.some((id) => !cats.has(id))) throw new ValidationError('Eine Kategorie gehört nicht zu diesem Board');
    const people = new Set(store.people().map((p) => p.id));
    const ids = [...c.assign.personIds, ...(c.assign.fallbackPersonId ? [c.assign.fallbackPersonId] : [])];
    if (ids.some((id) => !people.has(id))) throw new ValidationError('Eine gewählte Person gibt es in Stups nicht');
  }

  const watcherView = (id: string) => deps.watchers!.view().find((w) => w.id === id);

  app.get('/api/watchers', async () => ({ available: !!deps.watchers, items: deps.watchers?.view() ?? [] }));

  app.get<{ Params: Params }>('/api/watchers/:id/runs', async (req) => {
    const { data } = watcherEngine();
    data.get(req.params.id);
    return data.runs(req.params.id);
  });

  app.post('/api/watchers', async (req, reply) => {
    requireAdmin(req);
    const { engine, data } = watcherEngine();
    const config = parseWatcher(body(req));
    checkWatcherTargets(config);
    const created = data.create(config);
    await engine.onSaved(created.id);
    return reply.code(201).send(watcherView(created.id));
  });

  app.patch<{ Params: Params }>('/api/watchers/:id', async (req) => {
    requireAdmin(req);
    const { engine, data } = watcherEngine();
    const current = data.get(req.params.id);
    const b = body(req);
    if (Object.keys(b).every((k) => k === 'active')) {
      // nur pausieren oder wieder einschalten
      data.setActive(current.id, b.active === true);
      if (b.active === true) await engine.onSaved(current.id);
      else engine.syncSubscriptions();
      return watcherView(current.id);
    }
    const { id: _id, ...rest } = current;
    const config = parseWatcher({ ...rest, ...b });
    checkWatcherTargets(config);
    data.update(current.id, config);
    await engine.onSaved(current.id);
    return watcherView(current.id);
  });

  app.delete<{ Params: Params }>('/api/watchers/:id', async (req, reply) => {
    requireAdmin(req);
    const { engine, data } = watcherEngine();
    data.remove(req.params.id);
    engine.syncSubscriptions();
    return noContent(reply);
  });

  app.post<{ Params: Params }>('/api/watchers/:id/test', async (req) => {
    requireAdmin(req);
    const { engine, data } = watcherEngine();
    data.get(req.params.id);
    try {
      await engine.test(req.params.id);
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : 'Test fehlgeschlagen');
    }
    return watcherView(req.params.id);
  });

  app.post<{ Params: Params }>('/api/watchers/:id/reset-counter', async (req) => {
    requireAdmin(req);
    const { engine } = watcherEngine();
    engine.resetCounter(req.params.id);
    return watcherView(req.params.id);
  });

  app.get('/api/admin/automation-log', async (req) => {
    requireAdmin(req);
    return deps.automationLog?.() ?? [];
  });

  /** Suche in den Entitäten von Home Assistant, für das Anlegen eines Wächters */
  app.get<{ Querystring: { q?: string; domain?: string } }>('/api/ha/entities', async (req) => {
    requireAdmin(req);
    if (!deps.ha?.getStates) throw new ConflictError('Keine Verbindung zu Home Assistant');
    const q = (req.query.q ?? '').trim().toLowerCase();
    const domains = (req.query.domain ?? '').split(',').filter(Boolean);
    let states: HaState[];
    try {
      states = await deps.ha.getStates();
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : 'Home Assistant antwortet nicht');
    }
    const name = (s: HaState) => String(s.attributes?.friendly_name ?? s.entity_id);
    const words = q.split(/\s+/).filter(Boolean);
    const score = (s: HaState): number => {
      const hay = `${s.entity_id} ${name(s)}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return -1;
      return (name(s).toLowerCase().startsWith(q) ? 2 : 0) + (s.entity_id.toLowerCase().includes(q) ? 1 : 0);
    };
    return states
      .filter((s) => domains.length === 0 || domains.includes(s.entity_id.split('.')[0]!))
      .map((s) => ({ s, score: words.length ? score(s) : 0 }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score || name(a.s).localeCompare(name(b.s), 'de'))
      .slice(0, 30)
      .map(({ s }) => ({
        entityId: s.entity_id,
        name: name(s),
        state: s.state,
        unit: typeof s.attributes?.unit_of_measurement === 'string' ? s.attributes.unit_of_measurement : null,
        domain: s.entity_id.split('.')[0]!,
      }));
  });

  // ----- Umzug in eine andere App (nur Administratoren) -----
  app.post('/api/admin/export', async (req) => {
    requireAdmin(req);
    if (!deps.exportData) throw new ValidationError('Der Export ist hier nicht verfügbar');
    try {
      return deps.exportData();
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : 'Export fehlgeschlagen');
    }
  });
  app.post<{ Params: Params }>('/api/cards/:id/complete', async (req) => {
    const res = store.completeCard(req.params.id, { by: req.user?.id ?? null, source: 'app' });
    if (res.completionId) void deps.notifier?.clearFor(res.card.id);
    return res;
  });
  app.post<{ Params: Params }>('/api/completions/:id/undo', async (req) => store.undoCompletion(req.params.id));
  app.get<{ Params: Params }>('/api/cards/:id/completions', async (req) => store.listCompletions(req.params.id));
  app.post<{ Params: Params }>('/api/cards/:id/restore-archived', async (req) =>
    store.restoreArchived(req.params.id, body(req).columnId, req.user?.id ?? null),
  );
  app.post<{ Params: Params }>('/api/cards/:id/duplicate', async (req, reply) =>
    reply.code(201).send(store.duplicateCard(req.params.id, req.user?.id ?? null)),
  );
  app.post<{ Params: Params }>('/api/cards/:id/archive', async (req, reply) => {
    store.setArchived(req.params.id, body(req).archived !== false);
    return noContent(reply);
  });

  // ----- attachments -----
  await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 2, fields: 5 } });

  app.post<{ Params: Params }>('/api/cards/:id/attachments', async (req, reply) => {
    const files = deps.files;
    if (!files) throw new AppError('Die Dateiablage ist nicht verfügbar', 501);
    store.getCard(req.params.id); // unbekannte Karte: sofort 404

    let file: { name: string; data: Buffer } | null = null;
    let thumb: Buffer | null = null;
    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      const data = await part.toBuffer(); // wirft 413, wenn die Datei zu groß ist
      if (part.fieldname === 'file') file = { name: part.filename, data };
      else if (part.fieldname === 'thumb') thumb = data;
    }
    if (!file) throw new ValidationError('Es fehlt die Datei');

    const mime = sniffMime(file.data);
    if (!mime) throw new ValidationError('Dieser Dateityp ist nicht erlaubt. Erlaubt sind Bilder und PDF');
    const thumbMime = thumb ? sniffMime(thumb) : null;
    if (thumb && (!thumbMime || !thumbMime.startsWith('image/') || thumb.length > MAX_THUMB_BYTES)) {
      throw new ValidationError('Das Vorschaubild ist ungültig');
    }

    const id = randomUUID();
    const fileName = `${id}.${extensionFor(mime)}`;
    const thumbName = thumb && thumbMime ? `${id}.thumb.${extensionFor(thumbMime)}` : null;
    files.write(fileName, file.data);
    if (thumb && thumbName) files.write(thumbName, thumb);
    try {
      const att = store.addAttachment(
        req.params.id,
        { id, filename: cleanFilename(file.name), mime, size: file.data.length, file: fileName, thumb: thumbName },
        req.user?.id ?? null,
      );
      return reply.code(201).send(att);
    } catch (err) {
      files.remove(fileName);
      if (thumbName) files.remove(thumbName);
      throw err;
    }
  });

  function sendFile(reply: FastifyReply, data: Buffer, filename: string) {
    return reply
      .header('content-type', sniffMime(data) ?? 'application/octet-stream')
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`)
      .header('cache-control', 'private, max-age=86400')
      .send(data);
  }

  app.get<{ Params: Params }>('/api/attachments/:id', async (req, reply) => {
    const a = store.getAttachment(req.params.id);
    return sendFile(reply, deps.files!.read(a.file), a.filename);
  });
  app.get<{ Params: Params }>('/api/attachments/:id/thumb', async (req, reply) => {
    const a = store.getAttachment(req.params.id);
    if (!a.thumb) return reply.code(404).send({ error: 'Kein Vorschaubild vorhanden' });
    return sendFile(reply, deps.files!.read(a.thumb), a.filename);
  });
  app.delete<{ Params: Params }>('/api/attachments/:id', async (req, reply) => {
    const { file, thumb } = store.deleteAttachment(req.params.id);
    if (file) deps.files?.remove(file);
    if (thumb) deps.files?.remove(thumb);
    return noContent(reply);
  });

  // ----- comments -----
  app.get<{ Params: Params }>('/api/cards/:id/comments', async (req) => store.listComments(req.params.id));
  app.post<{ Params: Params }>('/api/cards/:id/comments', async (req, reply) =>
    reply.code(201).send(store.addComment(req.params.id, req.user?.id ?? null, body(req).text)),
  );
  app.patch<{ Params: Params }>('/api/comments/:id', async (req) => store.updateComment(req.params.id, body(req).text));
  app.delete<{ Params: Params }>('/api/comments/:id', async (req, reply) => {
    store.deleteComment(req.params.id);
    return noContent(reply);
  });

  // ----- checklist -----
  app.post<{ Params: Params }>('/api/cards/:id/checklist', async (req, reply) =>
    reply.code(201).send(store.addChecklistItem(req.params.id, body(req).text)),
  );
  app.patch<{ Params: Params }>('/api/checklist/:id', async (req) => {
    const b = body(req);
    return store.updateChecklistItem(req.params.id, { text: b.text, done: b.done });
  });
  app.delete<{ Params: Params }>('/api/checklist/:id', async (req, reply) => {
    store.deleteChecklistItem(req.params.id);
    return noContent(reply);
  });

  // ----- links -----
  app.post<{ Params: Params }>('/api/cards/:id/links', async (req, reply) => {
    const b = body(req);
    // Zuerst prüfen, damit nie etwas Ungültiges abgerufen wird
    const normalized = normalizeUrl(typeof b.url === 'string' ? b.url : '');
    // Google-Kurzlinks werden durch die Maps-URL ersetzt, die die Maps-App aus der Companion App öffnet
    const resolved = await resolveMapsLink(normalized);
    const url = resolved?.url ?? normalized;
    const title: string | null | undefined = b.title?.trim() ? b.title : resolved?.title;
    if (!title?.trim()) {
      const probe = store.addLink(req.params.id, { url });
      const fetched = await fetchTitle(probe.url);
      return reply.code(201).send(fetched ? store.updateLink(probe.id, { title: fetched }) : probe);
    }
    return reply.code(201).send(store.addLink(req.params.id, { url, title }));
  });
  app.patch<{ Params: Params }>('/api/links/:id', async (req) => {
    const b = body(req);
    return store.updateLink(req.params.id, { url: b.url, title: b.title });
  });
  app.delete<{ Params: Params }>('/api/links/:id', async (req, reply) => {
    store.deleteLink(req.params.id);
    return noContent(reply);
  });

  // ----- trash -----
  app.get('/api/trash', async () => store.listTrash());
  app.post<{ Params: { type: string; id: string } }>('/api/trash/:type/:id/restore', async (req, reply) => {
    const { type, id } = req.params;
    if (!['board', 'column', 'category', 'card'].includes(type)) throw new ValidationError('Unbekannter Typ');
    store.restoreFromTrash(type as TrashType, id);
    return noContent(reply);
  });
}
