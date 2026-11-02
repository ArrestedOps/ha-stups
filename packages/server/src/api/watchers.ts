import type { FastifyInstance } from 'fastify';
import { ConflictError, ValidationError } from '../errors.js';
import { type HaState } from '../ha.js';
import { parseWatcher, type WatcherConfig } from '../watcher-types.js';
import { type ApiKit, type Params } from './kit.js';
import { t } from '../i18n/index.js';

/** Wächter und Diagnose */
export function registerWatcherRoutes(app: FastifyInstance, k: ApiKit): void {
  const { deps, store, body, requireAdmin, noContent } = k;

  // ----- Wächter-Test für die Diagnose-Seite (nur Administratoren, nur lesend) -----
  app.post('/api/admin/watcher-probe', async (req) => {
    requireAdmin(req);
    if (!deps.ha?.probeWatchers) throw new ValidationError(t('Nicht verfügbar (keine Verbindung zu Home Assistant)'));
    const entityId = body(req).entityId;
    if (entityId !== undefined && (typeof entityId !== 'string' || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(entityId))) {
      throw new ValidationError(t('Die Entität muss die Form domain.name haben'));
    }
    try {
      return await deps.ha.probeWatchers(entityId);
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : t('Test fehlgeschlagen'));
    }
  });
  // ----- Wächter: alle sehen sie, nur Administratoren ändern sie -----
  const watcherEngine = () => {
    if (!deps.watchers || !deps.watcherData) throw new ConflictError(t('Wächter brauchen die Verbindung zu Home Assistant'));
    return { engine: deps.watchers, data: deps.watcherData };
  };
  /** Board, Spalte, Kategorien und Personen müssen es geben (sonst entstünde nie eine Karte) */
  function checkWatcherTargets(c: WatcherConfig): void {
    let view;
    try {
      view = store.getBoardView(c.card.boardId);
    } catch {
      throw new ValidationError(t('Das Board gibt es nicht'));
    }
    if (!view.columns.some((x) => x.id === c.card.columnId)) throw new ValidationError(t('Die Spalte gehört nicht zu diesem Board'));
    const cats = new Set(view.categories.map((x) => x.id));
    if (c.card.categoryIds.some((id) => !cats.has(id))) throw new ValidationError(t('Eine Kategorie gehört nicht zu diesem Board'));
    const people = new Set(store.people().map((p) => p.id));
    const ids = [...c.assign.personIds, ...(c.assign.fallbackPersonId ? [c.assign.fallbackPersonId] : [])];
    if (ids.some((id) => !people.has(id))) throw new ValidationError(t('Eine gewählte Person gibt es in Stups nicht'));
  }
  const watcherView = (id: string) => deps.watchers!.view().find((w) => w.id === id);
  app.get('/api/watchers', async () => ({ available: !!deps.watchers, items: deps.watchers?.view() ?? [] }));
  /** Letzte Aktivität über alle Wächter (Reiter „Wächter") */
  app.get('/api/watchers/activity', async () => (deps.watchers ? deps.watchers.activity(20) : []));
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
      throw new ValidationError(err instanceof Error ? err.message : t('Test fehlgeschlagen'));
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
    if (!deps.ha?.getStates) throw new ConflictError(t('Keine Verbindung zu Home Assistant'));
    const q = (req.query.q ?? '').trim().toLowerCase();
    const domains = (req.query.domain ?? '').split(',').filter(Boolean);
    let states: HaState[];
    try {
      states = await deps.ha.getStates();
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : t('Home Assistant antwortet nicht'));
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
}
