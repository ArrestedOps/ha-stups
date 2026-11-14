import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { type HaState } from '../ha.js';
import { DRY_RUN_DAYS, dryRun } from '../dry-run.js';
import { clampHours, historyOf, unavailableHistory } from '../entity-history.js';
import { categoryOfEntity, categoryOfTemplate, cleanCategory } from '../watcher-categories.js';
import { hasPermission, requirePermission } from '../permissions.js';
import { detectSuggestions, suggestionKey, watcherTemplates } from '../watcher-templates.js';
import { applyBulkPatch, commonFamily, parseBulkPatch } from '../watcher-bulk.js';
import type { Watcher } from '../watcher-data.js';
import { MODES, parseTrigger, parseWatcher, type AssignRule, type WatchTrigger, type WatcherConfig } from '../watcher-types.js';
import { type ApiKit, type Params } from './kit.js';
import { t } from '../i18n/index.js';

/** Wie lange der Verlauf auf Home Assistant wartet, bevor die Oberfläche „kein Verlauf“ zeigt */
const HISTORY_TIMEOUT_MS = 8_000;

/** Query-Werte, die mehrfach vorkommen (Listen), gelten als nicht angegeben: so bleibt jede Eingabe ein Text */
const single = (query: object): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(query).map(([k, v]) => [k, typeof v === 'string' ? v : undefined]));

/** Hat sich geändert, was der Wächter beobachtet (Entität, Art, Zielzustand, Wert)? Wartezeit und Zähler gehören nicht dazu. */
const conditionChanged = (a: WatchTrigger, b: WatchTrigger): boolean => a.entityId !== b.entityId || a.kind !== b.kind || a.to !== b.to || a.value !== b.value;

/** So viele Wächter oder Treffer erlaubt eine Sammel-Anfrage höchstens */
const MAX_BULK = 500;

/** Die Kennungen einer Sammel-Anfrage: eine Liste eindeutiger Texte, 1 bis 500 */
function idList(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BULK || raw.some((x) => typeof x !== 'string' || x === '') || new Set(raw).size !== raw.length) {
    throw new ValidationError(t('Die Auswahl der Wächter fehlt oder ist ungültig (1 bis {max}, ohne Doppelte)', { max: MAX_BULK }));
  }
  return raw as string[];
}

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
  // ----- Wächter: alle sehen sie, ändern dürfen Administratoren und wer das Recht „watchers“ hat -----
  const watcherEngine = () => {
    if (!deps.watchers || !deps.watcherData) throw new ConflictError(t('Wächter brauchen die Verbindung zu Home Assistant'));
    return { engine: deps.watchers, data: deps.watcherData };
  };
  /**
   * Board, Spalte, Kategorien und Personen müssen es geben (sonst entstünde nie eine Karte). Das Board darf nicht privat sein (ein
   * Wächter legt Karten für andere an) und muss für die Person sichtbar sein, die es wählt (ein unverändertes Board nicht: wer nur
   * umbenennt, muss es nicht sehen). Zuständige kommen nur aus den Personen, die das Board sehen.
   */
  function checkWatcherTargets(req: FastifyRequest, c: WatcherConfig, unchangedBoard: string | null = null): void {
    let view;
    try {
      view = store.getBoardView(c.card.boardId);
    } catch {
      throw new ValidationError(t('Das Board gibt es nicht'));
    }
    if (view.board.visibility === 'private') throw new ValidationError(t('Private Boards sind für Wächter nicht wählbar: ein Wächter legt Karten für andere an'));
    if (c.card.boardId !== unchangedBoard && !store.canSeeBoard(req.user?.id ?? null, c.card.boardId)) throw new ValidationError(t('Das Board gibt es nicht'));
    if (!view.columns.some((x) => x.id === c.card.columnId)) throw new ValidationError(t('Die Spalte gehört nicht zu diesem Board'));
    const cats = new Set(view.categories.map((x) => x.id));
    if (c.card.categoryIds.some((id) => !cats.has(id))) throw new ValidationError(t('Eine Kategorie gehört nicht zu diesem Board'));
    const people = new Set(store.people().map((p) => p.id));
    const ids = [...c.assign.personIds, ...(c.assign.fallbackPersonId ? [c.assign.fallbackPersonId] : [])];
    if (ids.some((id) => !people.has(id))) throw new ValidationError(t('Eine gewählte Person gibt es in Stups nicht'));
    const seeing = new Set(store.boardPeopleIds(c.card.boardId));
    if (ids.some((id) => !seeing.has(id))) throw new ValidationError(t('Zur Auswahl stehen nur Personen aus dem Board'));
  }

  /**
   * Die geänderte Konfiguration eines vorhandenen Wächters prüfen: das Einzelspeichern und die Sammelbearbeitung gehen beide hierdurch.
   * `raw` ist der ganze Wächter mit den Änderungen, `assignGiven` sagt, ob die Zuteilung bewusst neu gesetzt wurde.
   */
  function prepareUpdate(req: FastifyRequest, current: Watcher, raw: Record<string, unknown>, assignGiven: boolean): { config: WatcherConfig; clearMissing: boolean } {
    // Ein Wächter ohne Zuständige (feste Person weg) lässt sich ändern, ohne dass die leere Liste erst gefüllt sein muss
    const keepAssign = current.status === 'assignees_missing' && !assignGiven;
    const config = parseWatcher({ ...raw, ...(keepAssign ? { assign: { ...current.assign, mode: 'none' } } : {}) });
    if (keepAssign) config.assign = current.assign;
    checkWatcherTargets(req, config, current.card.boardId);
    // „Braucht neue Zuständige" fällt erst weg, wenn Zuständige gewählt sind (ein leerer Kreis hieße „alle im Board": dahin fällt der Wächter nie zurück)
    const clearMissing = config.assign.mode === 'none' || config.assign.personIds.length > 0;
    return { config, clearMissing };
  }
  /** Speichert eine geprüfte Konfiguration; das Stupsen der offenen Karte folgt der neuen Regel */
  function saveUpdate(id: string, config: WatcherConfig, clearMissing: boolean): void {
    deps.watcherData!.update(id, config, clearMissing);
    const open = store.openCardOfWatcher(id);
    if (open) store.syncWatcherNudge(open.id, config.nudge ? { anchor: 'created', ...config.nudge, atTime: null } : null);
  }

  /** Karten aus Boards, die die Person nicht sieht, tauchen im Wächter nicht auf (die offene Karte wird weggelassen) */
  function hideCards<T extends { openCard: { boardId: string } | null }>(req: FastifyRequest, items: T[]): T[] {
    const me = req.user?.id ?? null;
    return items.map((w) => (w.openCard && !store.canSeeBoard(me, w.openCard.boardId) ? { ...w, openCard: null } : w));
  }
  const watcherView = (id: string) => deps.watchers!.view().find((w) => w.id === id);
  app.get('/api/watchers', async (req) => ({ available: !!deps.watchers, items: hideCards(req, deps.watchers?.view() ?? []) }));
  /** Letzte Aktivität über alle Wächter (Reiter „Wächter") */
  app.get('/api/watchers/activity', async () => (deps.watchers ? deps.watchers.activity(20) : []));
  // ----- Vorlagen, Gefunden (Erkennung) und Probelauf: Administratoren und Recht „watchers“, nichts davon speichert -----
  app.get('/api/watchers/templates', async (req) => {
    requirePermission(req, 'watchers');
    // dazu die Kategorie, die der Assistent vorbelegt (Vorlagen ohne Wächter haben keine)
    return watcherTemplates().map((tpl) => ({ ...tpl, category: categoryOfTemplate(tpl.id) }));
  });
  /** Was in Home Assistant zu einer Vorlage passt, ohne Entitäten, die schon ein Wächter beobachtet */
  app.get('/api/watchers/suggestions', async (req) => {
    requirePermission(req, 'watchers');
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
      hidden: detectSuggestions(states, watched, new Set(), Infinity).filter((s) => hidden.has(suggestionKey(s.templateId, s.entityId))),
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
    requirePermission(req, 'watchers');
    const { data } = watcherEngine();
    const hit = hitOf(req);
    data.hide(hit.templateId, hit.entityId);
    return noContent(reply);
  });
  app.post('/api/watchers/suggestions/unhide', async (req, reply) => {
    requirePermission(req, 'watchers');
    const { data } = watcherEngine();
    const hit = hitOf(req);
    data.unhide(hit.templateId, hit.entityId);
    return noContent(reply);
  });
  /** Probelauf: die Regel auf die Historie der letzten 7 Tage anwenden (höchstens 20 000 Zustände), ohne zu speichern */
  app.post('/api/watchers/dry-run', async (req) => {
    requirePermission(req, 'watchers');
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
   * denen die Regel (Query: kind, value, to, forMin, count, cooldownMin) ausgelöst hätte. Administratoren und Mitglieder mit dem Recht „watchers“ fragen jede Entität ab, andere Mitglieder
   * nur die, die ein Wächter beobachtet. **Kind: verboten** (Erlaubnisliste in child-guard.ts). Ohne Verbindung oder ohne Recorder gibt es
   * einen Verlauf mit Status `unavailable` oder `no_data`, nie einen Fehler.
   */
  app.get<{ Querystring: Record<string, string | undefined> }>('/api/watchers/history', async (req) => {
    const q = single(req.query);
    const entityId = q.entityId ?? '';
    if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(entityId)) throw new ValidationError(t('Die Entität muss die Form domain.name haben'));
    if (!hasPermission(req.access, 'watchers')) {
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
    return deps.watchers.order(rule, saved?.id ?? null, q.boardId || null);
  });
  app.get<{ Params: Params }>('/api/watchers/:id/runs', async (req) => {
    const { data } = watcherEngine();
    data.get(req.params.id);
    return data.runs(req.params.id);
  });
  /**
   * Sammelknopf: Wächter ohne Kategorie bekommen den Vorschlag (aus Entität, Geräteklasse und Name, siehe watcher-categories.ts).
   * Vorhandene Kategorien bleiben immer. Antwort: bei wie vielen Wächtern eine Kategorie gesetzt wurde. Die Oberfläche fragt vorher nach.
   */
  app.post('/api/watchers/suggest-categories', async (req) => {
    requirePermission(req, 'watchers');
    const { engine, data } = watcherEngine();
    let updated = 0;
    for (const v of engine.view()) {
      if (v.category) continue;
      data.setCategory(v.id, v.suggestedCategory);
      updated += 1;
    }
    return { updated };
  });
  app.post('/api/watchers', async (req, reply) => {
    requirePermission(req, 'watchers');
    const { engine, data } = watcherEngine();
    const raw = body(req);
    // Ohne Angabe gilt der Wert des Boards (ein Board, das nicht zählt, nimmt seine Wächter mit)
    if (raw.countsForFairness === undefined && typeof raw.card?.boardId === 'string') {
      try {
        const board = store.getBoard(raw.card.boardId);
        raw.countsForFairness = board.visibility !== 'private' && board.countsForFairness;
      } catch {
        /* unbekanntes Board: die Prüfung unten meldet es */
      }
    }
    const config = parseWatcher(raw);
    checkWatcherTargets(req, config);
    const created = data.create(config);
    // `metNow`: die Bedingung gilt schon und es löst nichts von selbst aus, die Oberfläche fragt, ob die Karte jetzt entstehen soll
    const metNow = await engine.onSaved(created.id);
    return reply.code(201).send({ ...watcherView(created.id), metNow });
  });
  app.patch<{ Params: Params }>('/api/watchers/:id', async (req) => {
    requirePermission(req, 'watchers');
    const { engine, data } = watcherEngine();
    const current = data.get(req.params.id);
    const b = body(req);
    if (Object.keys(b).length > 0 && Object.keys(b).every((k) => k === 'category')) {
      // nur die Kategorie: nichts wird neu angemeldet, kein Status zurückgesetzt
      data.setCategory(current.id, cleanCategory(b.category));
      return watcherView(current.id);
    }
    if (Object.keys(b).every((k) => k === 'active')) {
      // nur pausieren oder wieder einschalten
      data.setActive(current.id, b.active === true);
      if (b.active === true) await engine.onSaved(current.id);
      else engine.syncSubscriptions();
      return watcherView(current.id);
    }
    const { id: _id, ...rest } = current;
    const { config, clearMissing } = prepareUpdate(req, current, { ...rest, ...b }, 'assign' in b);
    saveUpdate(current.id, config, clearMissing);
    const metNow = await engine.onSaved(current.id);
    // gefragt wird nur, wenn sich Entität oder Bedingung geändert haben (nicht beim Umbenennen und Co.)
    return { ...watcherView(current.id), metNow: conditionChanged(current.trigger, config.trigger) ? metNow : null };
  });
  /**
   * Mehrere Wächter auf einmal ändern: `{ ids, patch }`. Der Patch fasst nur an, was er nennt (nie Entität, Name oder Kartentitel);
   * Auslöser-Felder gehen nur, wenn alle Wächter dieselbe Auslöser-Art (und bei Schwellwerten dieselbe Einheit) haben. Jeder Wächter
   * läuft durch dieselbe Prüfung wie das Einzelspeichern; erst wenn alle gültig sind, wird in einer Transaktion gespeichert.
   */
  app.post('/api/watchers/bulk', async (req) => {
    requirePermission(req, 'watchers');
    const { engine, data } = watcherEngine();
    const b = body(req);
    const ids = idList(b.ids);
    const current = ids.map((id) => data.get(id)); // 404 bei einer unbekannten Kennung, bevor etwas geschieht
    const units = new Map(engine.view().map((v) => [v.id, v.entityUnit]));
    const patch = parseBulkPatch(b.patch, commonFamily(current.map((w) => ({ trigger: w.trigger, unit: units.get(w.id) ?? null }))));
    const keys = Object.keys(patch);
    if (keys.length === 0) throw new ValidationError(t('Die Änderung ist leer'));
    if (keys.every((k) => k === 'category')) {
      // nur die Kategorie: nichts wird neu angemeldet, kein Status zurückgesetzt
      store.transaction(() => current.forEach((w) => data.setCategory(w.id, cleanCategory(patch.category))));
    } else if (keys.every((k) => k === 'active')) {
      // nur pausieren oder wieder einschalten
      store.transaction(() => current.forEach((w) => data.setActive(w.id, patch.active === true)));
      if (patch.active === true) for (const w of current) await engine.onSaved(w.id);
      else engine.syncSubscriptions();
    } else {
      const prepared = current.map((w) => ({ w, ...prepareUpdate(req, w, applyBulkPatch(w, patch) as unknown as Record<string, unknown>, patch.assign !== undefined) }));
      store.transaction(() => prepared.forEach((p) => saveUpdate(p.w.id, p.config, p.clearMissing)));
      for (const p of prepared) await engine.onSaved(p.w.id);
    }
    return { items: hideCards(req, ids.map((id) => watcherView(id)!)) };
  });
  app.delete<{ Params: Params }>('/api/watchers/:id', async (req, reply) => {
    requirePermission(req, 'watchers');
    const { engine, data } = watcherEngine();
    data.remove(req.params.id);
    engine.syncSubscriptions();
    return noContent(reply);
  });
  app.post<{ Params: Params }>('/api/watchers/:id/test', async (req) => {
    requirePermission(req, 'watchers');
    const { engine, data } = watcherEngine();
    data.get(req.params.id);
    try {
      await engine.test(req.params.id);
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : t('Test fehlgeschlagen'));
    }
    return watcherView(req.params.id);
  });
  /** „Ja, Karte erstellen" auf die Rückfrage nach dem Speichern: nur wenn die Bedingung weiterhin gilt und keine Karte des Wächters offen ist (sonst 409) */
  app.post<{ Params: Params }>('/api/watchers/:id/fire-now', async (req) => {
    requirePermission(req, 'watchers');
    const { engine, data } = watcherEngine();
    data.get(req.params.id);
    await engine.fireNow(req.params.id);
    return watcherView(req.params.id);
  });
  app.post<{ Params: Params }>('/api/watchers/:id/reset-counter', async (req) => {
    requirePermission(req, 'watchers');
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
    requirePermission(req, 'watchers');
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
        /** Vorschlag für die Kategorie des neuen Wächters */
        category: categoryOfEntity({
          entityId: s.entity_id,
          deviceClass: typeof s.attributes?.device_class === 'string' ? s.attributes.device_class : undefined,
          unit: typeof s.attributes?.unit_of_measurement === 'string' ? s.attributes.unit_of_measurement : undefined,
          name: name(s),
        }),
      }));
  });
}
