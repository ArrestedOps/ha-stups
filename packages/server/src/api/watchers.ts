import type { FastifyInstance } from 'fastify';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { type HaState } from '../ha.js';
import { DRY_RUN_DAYS, dryRun } from '../dry-run.js';
import { clampHours, historyOf, unavailableHistory } from '../entity-history.js';
import { detectSuggestions, suggestionKey, watcherTemplates } from '../watcher-templates.js';
import { MODES, parseTrigger, parseWatcher, type AssignRule, type WatchTrigger, type WatcherConfig } from '../watcher-types.js';
import { type ApiKit, type Params } from './kit.js';
import { t } from '../i18n/index.js';

/** Wie lange der Verlauf auf Home Assistant wartet, bevor die Oberfläche „kein Verlauf“ zeigt */
const HISTORY_TIMEOUT_MS = 8_000;

/** Query-Werte, die mehrfach vorkommen (Listen), gelten als nicht angegeben: so bleibt jede Eingabe ein Text */
const single = (query: object): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(query).map(([k, v]) => [k, typeof v === 'string' ? v : undefined]));

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
  // ----- Vorlagen, Gefunden (Erkennung) und Probelauf: nur Administratoren, nichts davon speichert -----
  app.get('/api/watchers/templates', async (req) => {
    requireAdmin(req);
    return watcherTemplates();
  });
  /** Was in Home Assistant zu einer Vorlage passt, ohne Entitäten, die schon ein Wächter beobachtet */
  app.get('/api/watchers/suggestions', async (req) => {
    requireAdmin(req);
    if (!deps.ha?.getStates) throw new ConflictError(t('Keine Verbindung zu Home Assistant'));
    let states: HaState[];
    try {
      states = await deps.ha.getStates();
    } catch (err) {
      throw new ConflictError(err instanceof Error ? err.message : t('Home Assistant antwortet nicht'));
    }
    const watched = new Set((deps.watcherData?.list() ?? []).flatMap((w) => [w.trigger.entityId, ...(w.done ? [w.done.entityId] : [])]));
    const hidden = new Set((deps.watcherData?.hidden() ?? []).map((h) => suggestionKey(h.templateId, h.entityId)));
    return {
      items: detectSuggestions(states, watched, hidden),
      /** Ausgeblendet, aber noch in Home Assistant da: zum Zurückholen */
      hidden: detectSuggestions(states, watched).filter((s) => hidden.has(suggestionKey(s.templateId, s.entityId))),
    };
  });
  /** Einen Treffer ausblenden (er wird nie wieder vorgeschlagen) oder wieder einblenden */
  const hitOf = (req: Parameters<typeof body>[0]): { templateId: string; entityId: string } => {
    const b = body(req);
    if (typeof b.templateId !== 'string' || !watcherTemplates().some((x) => x.id === b.templateId)) throw new ValidationError(t('Diese Vorlage gibt es nicht'));
    if (typeof b.entityId !== 'string' || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(b.entityId)) throw new ValidationError(t('Die Entität muss die Form domain.name haben'));
    return { templateId: b.templateId, entityId: b.entityId };
  };
  app.post('/api/watchers/suggestions/hide', async (req, reply) => {
    requireAdmin(req);
    const { data } = watcherEngine();
    const hit = hitOf(req);
    data.hide(hit.templateId, hit.entityId);
    return noContent(reply);
  });
  app.post('/api/watchers/suggestions/unhide', async (req, reply) => {
    requireAdmin(req);
    const { data } = watcherEngine();
    const hit = hitOf(req);
    data.unhide(hit.templateId, hit.entityId);
    return noContent(reply);
  });
  /** Probelauf: die Regel auf die Historie der letzten 7 Tage anwenden (höchstens 20 000 Zustände), ohne zu speichern */
  app.post('/api/watchers/dry-run', async (req) => {
    requireAdmin(req);
    if (!deps.ha?.getHistory) throw new ConflictError(t('Keine Verbindung zu Home Assistant'));
    const b = body(req);
    const trigger = parseTrigger(b.trigger);
    if (trigger.kind !== 'state' && trigger.kind !== 'above' && trigger.kind !== 'below') {
      throw new ValidationError(t('Einen Probelauf gibt es nur für Zahlen und Zustände'));
    }
    const cooldownMin = typeof b.cooldownMin === 'number' && Number.isFinite(b.cooldownMin) ? Math.min(1440, Math.max(0, Math.round(b.cooldownMin))) : 10;
    const nowMs = (deps.now?.() ?? new Date()).getTime();
    let history;
    try {
      history = await deps.ha.getHistory(trigger.entityId, new Date(nowMs - DRY_RUN_DAYS * 86_400_000).toISOString(), new Date(nowMs).toISOString());
    } catch (err) {
      throw new ConflictError(err instanceof Error ? err.message : t('Home Assistant antwortet nicht'));
    }
    return dryRun({ trigger, cooldownMin }, history, nowMs);
  });
  /**
   * Verlauf einer Entität (Standard: letzte 3 Stunden) für den Wächter-Editor, verdichtet auf Zahlen und Zeitpunkte, mit den Stellen, an
   * denen die Regel (Query: kind, value, to, forMin, count, cooldownMin) ausgelöst hätte. Administratoren fragen jede Entität ab, Mitglieder
   * nur die, die ein Wächter beobachtet. **Kind: verboten** (Erlaubnisliste in child-guard.ts). Ohne Verbindung oder ohne Recorder gibt es
   * einen Verlauf mit Status `unavailable` oder `no_data`, nie einen Fehler.
   */
  app.get<{ Querystring: Record<string, string | undefined> }>('/api/watchers/history', async (req) => {
    const q = single(req.query);
    const entityId = q.entityId ?? '';
    if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(entityId)) throw new ValidationError(t('Die Entität muss die Form domain.name haben'));
    if (!req.access?.isAdmin) {
      const watched = (deps.watcherData?.list() ?? []).some((w) => w.trigger.entityId === entityId || w.done?.entityId === entityId);
      if (!watched) throw new ForbiddenError(t('Das dürfen nur Administratoren'));
    }
    const hours = clampHours(q.hours);
    const nowMs = (deps.now?.() ?? new Date()).getTime();
    if (!deps.ha?.getHistory) return unavailableHistory(nowMs, hours);
    let trigger: WatchTrigger | null = null;
    try {
      if (q.kind) trigger = parseTrigger({ entityId, kind: q.kind, to: q.to ?? null, value: q.value === undefined || q.value === '' ? null : Number(q.value), forMin: q.forMin === undefined ? undefined : Number(q.forMin), count: q.count === undefined ? undefined : Number(q.count) });
    } catch {
      trigger = null; // eine unfertige Regel zeichnet den Verlauf trotzdem, nur ohne Auslösepunkte
    }
    const cooldownMin = q.cooldownMin !== undefined && Number.isFinite(Number(q.cooldownMin)) ? Math.min(1440, Math.max(0, Math.round(Number(q.cooldownMin)))) : 10;
    try {
      const from = new Date(nowMs - hours * 3_600_000).toISOString();
      const history = await Promise.race([
        deps.ha.getHistory(entityId, from, new Date(nowMs).toISOString()),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Zeitlimit')), HISTORY_TIMEOUT_MS).unref()),
      ]);
      return historyOf({ history, nowMs, hours, trigger, cooldownMin });
    } catch {
      return unavailableHistory(nowMs, hours);
    }
  });
  /**
   * Die Reihenfolge für „An wen": Kreis, wer als Nächstes dran ist, wer zu Hause ist. Für einen gespeicherten Wächter (`watcherId`) oder
   * einen Entwurf (`mode`, `personIds`, `fallback`, `fallbackPersonId`). Schaltet nichts weiter. **Kind: verboten.**
   */
  app.get<{ Querystring: Record<string, string | undefined> }>('/api/watchers/order', async (req) => {
    if (!deps.watchers) throw new ConflictError(t('Wächter brauchen die Verbindung zu Home Assistant'));
    const q = single(req.query);
    const saved = q.watcherId ? deps.watcherData?.list().find((w) => w.id === q.watcherId) : undefined;
    if (q.watcherId && !saved) throw new NotFoundError(t('Wächter nicht gefunden'));
    const mode = (q.mode ?? saved?.assign.mode) as AssignRule['mode'] | undefined;
    if (!mode || !MODES.includes(mode)) throw new ValidationError(t('Die Art der Zuweisung ist unbekannt'));
    const personIds = q.personIds !== undefined ? q.personIds.split(',').filter(Boolean).slice(0, 50) : (saved?.assign.personIds ?? []);
    const fallback = (q.fallback ?? saved?.assign.fallback ?? 'next') as AssignRule['fallback'];
    const rule: AssignRule = {
      mode,
      personIds,
      fallback: ['next', 'all', 'none', 'fixed'].includes(fallback) ? fallback : 'next',
      waitFallback: saved?.assign.waitFallback ?? 'none',
      fallbackPersonId: q.fallbackPersonId || saved?.assign.fallbackPersonId || null,
    };
    return deps.watchers.order(rule, saved?.id ?? null);
  });
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
