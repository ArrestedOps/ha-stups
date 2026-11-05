import type { FastifyInstance } from 'fastify';
import { isDashboardPath } from '../dashboard-path.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { TEST_ACTION } from '../push.js';
import { type Capabilities } from '../runtime.js';
import { type ApiKit } from './kit.js';
import { t } from '../i18n/index.js';
import { requirePermission } from '../permissions.js';

/** Einstellungen, Beta, Push-Übersicht, Fähigkeiten, Dashboards und Umzug */
export function registerSettingsRoutes(app: FastifyInstance, k: ApiKit): void {
  const { deps, store, body, requireAdmin } = k;

  // ----- Einstellungen -----
  const effectiveSettings = () => {
    const s = store.getSettings();
    const fallback = deps.defaultDashboardPath ?? '/';
    const summary = deps.defaultDailySummaryTime ?? '08:00';
    return {
      ...s,
      defaultDashboardPath: fallback,
      effectiveDashboardPath: s.dashboardPath ?? fallback,
      defaultDailySummaryTime: summary,
      effectiveDailySummaryTime: s.dailySummaryTime ?? summary,
    };
  };
  app.get('/api/settings', async () => effectiveSettings());
  app.put('/api/settings', async (req) => {
    const b = body(req);
    // Dashboard und Panel-Pfad gelten für alle (der Panel-Pfad steckt in jeder Push-Adresse): nur Administratoren, nie delegierbar.
    // Die Zeiten (Fälligkeit, Tageszusammenfassung) ändert auch, wer das Recht „settings“ hat. Ein verbotenes Feld macht die ganze Anfrage unzulässig.
    if (b.dashboardPath !== undefined || b.panelPath !== undefined) requireAdmin(req);
    if (b.defaultDueTime !== undefined || b.dailySummaryTime !== undefined) requirePermission(req, 'settings');
    store.setSettings({ dashboardPath: b.dashboardPath, panelPath: b.panelPath, defaultDueTime: b.defaultDueTime, dailySummaryTime: b.dailySummaryTime });
    return effectiveSettings();
  });
  // Beta: Push und Wächter sind zunächst aus (siehe beta-gate.ts). Jeder sieht den Stand, Administratoren ändern ihn.
  app.get('/api/beta', async () => {
    if (!deps.betaGate?.enabled) throw new NotFoundError(t('Gibt es nur in der Beta'));
    return deps.betaGate.state();
  });
  app.put('/api/beta', async (req) => {
    if (!deps.betaGate?.enabled) throw new NotFoundError(t('Gibt es nur in der Beta'));
    requireAdmin(req);
    const b = body(req);
    return deps.betaGate.set({ push: b.push, watchers: b.watchers });
  });
  // Zeigt, warum (k)eine Push-Nachricht ankommt: Dienste je Person und das Sendeprotokoll
  app.get('/api/notifications/status', async (req) => {
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
              : who.some((p) => (deps.push ? deps.push.canReach(p.id, 'due') : p.notifyServices.length > 0))
                ? null
                : 'Kein Push-Gerät eingetragen (Einstellungen › Personen & Zugriff)',
        };
      });
    return {
      upcoming,
      people: people.map((p) => ({
        name: p.name,
        services: p.notifyServices.map((service) => ({ service, exists: services ? services.includes(service) : null })),
        ...(deps.ntfy ? { ntfy: p.ntfy } : {}),
      })),
      ntfy: deps.ntfy
        ? { url: deps.ntfy.url, buttons: deps.capabilities?.publicUrl != null, roundTrip: req.user ? deps.ntfy.roundTrip(req.user.id) : null }
        : null,
      // Haus-Kanäle (Ansage, Lampe) mit dem letzten Ergebnis; null ohne Home Assistant
      house: deps.house
        ? store.houseChannels().map((c) => ({
            person: byId.get(c.userId)?.name ?? '',
            name: c.name,
            type: c.type,
            enabled: c.enabled,
            kinds: c.kinds,
            status: deps.house!.push.status(c.id),
          }))
        : null,
      recent: store.recentNotifications(15),
      nudges: store.recentNudges(10),
    };
  });
  // Test-Nachricht an die eigenen Geräte über den Push-Weg der Betriebsart (mit ntfy zusätzlich ein Knopf, der den Rückweg prüft)
  app.post('/api/push/test', async (req) => {
    const me = req.user;
    if (!me || !deps.push) throw new ForbiddenError(t('Push ist hier nicht eingerichtet'));
    if (!deps.push.canReach(me.id)) throw new ConflictError(t('Für dich ist noch kein Push-Weg eingetragen (Einstellungen › Personen & Zugriff)'));
    const sent = await deps.push.send(me.id, {
      title: 'Stups: Test',
      body: deps.ntfy ? 'Das Handy ist erreichbar. Tippe auf den Knopf, um den Rückweg zu prüfen.' : 'Das Handy ist erreichbar.',
      tag: 'stups-test',
      group: 'stups',
      open: {},
      actions: deps.ntfy ? [{ id: TEST_ACTION, title: 'Rückweg prüfen' }] : undefined,
    });
    if (!sent) throw new ConflictError(t('Die Nachricht ist nicht angekommen. Mehr steht im Protokoll.'));
    return { sent: true };
  });
  app.get('/api/capabilities', async (): Promise<Capabilities> => {
    return (
      deps.capabilities ?? {
        mode: 'standalone',
        channel: 'stable',
        auth: 'ingress',
        ha: deps.ha !== undefined,
        watchers: deps.watchers !== undefined,
        sensors: false,
        house: false,
        push: [],
        publicUrl: null,
        passkeys: false,
      }
    );
  });
  // Die Dashboards, zu denen der Home-Knopf führen kann (Einstellungen › Home Assistant › Dashboard). Kind: verboten.
  // Ohne Verbindung zu Home Assistant, bei Fehler oder Zeitüberschreitung: nur „Standard" und die Option der App, nie ein 500.
  app.get('/api/ha/dashboards', async () => {
    const addonPath = effectiveSettings().effectiveDashboardPath;
    const standard = { path: '/', title: t('Standard von Home Assistant') };
    const fallback = [standard, ...(addonPath !== '/' ? [{ path: addonPath, title: t('Option der App: {path}', { path: addonPath }) }] : [])];
    if (!deps.ha) return { items: fallback, addonPath, connected: false };
    try {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Zeitüberschreitung')), deps.dashboardsTimeoutMs ?? 6000).unref?.();
      });
      const list = await Promise.race([deps.ha.listDashboards(), timeout]);
      const seen = new Set(['/', '/lovelace']);
      const items = [standard, { path: '/lovelace', title: t('Übersicht') }];
      // Nur, was sich als Pfad öffnen lässt: gültiger Pfad mit genau einem Teil (Dashboard-Kennung), ohne Doppelte
      for (const d of list) {
        if (!isDashboardPath(d.path) || d.path.indexOf('/', 1) !== -1 || seen.has(d.path)) continue;
        seen.add(d.path);
        items.push({ path: d.path, title: d.title || d.path.slice(1) });
      }
      return { items, addonPath, connected: true };
    } catch (err) {
      app.log.warn(`Dashboards konnten nicht gelesen werden: ${String(err)}`);
      return { items: fallback, addonPath, connected: false };
    }
  });
  // ----- Umzug in eine andere App (nur Administratoren) -----
  app.post('/api/admin/export', async (req) => {
    requireAdmin(req);
    if (!deps.exportData) throw new ValidationError(t('Der Export ist hier nicht verfügbar'));
    try {
      return deps.exportData();
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : t('Export fehlgeschlagen'));
    }
  });
}
