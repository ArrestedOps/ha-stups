import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { apiRoutes } from './api.js';
import type { Options } from './config.js';
import { resolveRuntime, type Capabilities } from './runtime.js';
import { createHaNotifyPush } from './push.js';
import { openDb } from './db.js';
import { exportData, importTransfer } from './transfer.js';
import { createEventBus } from './events.js';
import { createFileStore } from './files.js';
import { HaClient } from './ha.js';
import { createAccess } from './access.js';
import { createAccounts } from './accounts.js';
import { createDirectory, createLocalDirectory, createStaticDirectory } from './directory.js';
import { identityAuth } from './identity.js';
import { ingressAuth } from './ingress.js';
import { authRoutes, clientGuard, createLoginLimiter, createSessionIdentity, createSetup, type Setup } from './session-auth.js';
import { repairShortMapsLinks } from './linkRepair.js';
import { createNotifier } from './notifications.js';
import { createAutomationCards } from './automation-cards.js';
import { createWatcherData } from './watcher-data.js';
import { createWatchers } from './watchers.js';
import { createSensors } from './sensors.js';
import { spikeRoutes } from './spike.js';
import { createStore, type ClosedNudge } from './store.js';
import { ensureWebsocket } from './ws.js';

const runtime = resolveRuntime(process.env);
const { dataDir, shareDir, port, options } = runtime;

const app = Fastify({ logger: { level: options.logLevel } });
if (runtime.mode === 'standalone-ha') {
  // Die Verbindung eines eigenständigen Containers zu Home Assistant folgt in einer späteren Version
  app.log.warn('HA_URL und HA_TOKEN werden in dieser Version noch nicht genutzt: Stups läuft ohne Home Assistant');
  runtime.mode = 'standalone';
  runtime.ha = null;
}

const dbPath = `${dataDir}/stups.sqlite`;
// Neue App ohne eigene Daten: Datenbank und Anhänge aus einem Export der alten App übernehmen (Einstellungen › Umzug)
if (importTransfer(dbPath, `${dataDir}/files`, shareDir)) app.log.info('Daten aus dem Umzug (/share/stups-umzug) übernommen');
const db = openDb(dbPath, { backupDir: `${dataDir}/backups` });
// Wird nach dem Start von Home Assistant übernommen, bis dahin gilt dieser Wert.
let timeZone = runtime.timeZone;
// Der Store meldet geschlossene Stupse, der Notifier (weiter unten gebaut) schickt die Rückmeldung an die Absender
let nudgesClosed: ((list: ClosedNudge[]) => void) | null = null;
const store = createStore(db, { timeZone: () => timeZone, onNudgesClosed: (list) => nudgesClosed?.(list) });
// Eigene Konten mit Passwort, wenn Stups nicht als Add-on hinter Ingress läuft
const accounts = runtime.identity.kind === 'session' ? createAccounts(db, store) : undefined;
// Personen und Push-Geräte stehen seit 0.11 in der Datenbank und werden in der App gepflegt.
// Die Add-on-Optionen werden nur einmal übernommen.
if (options.users.some((u) => u.name !== '')) {
  // Ist in der Konfiguration von Home Assistant eine Personenliste eingetragen, gilt sie (Personen, Push-Geräte, Zugriff)
  store.applyManagedPeople(options.users, options.accessMode);
  app.log.info(`Personen und Zugriff aus der Konfiguration übernommen (${options.users.length}), Zugriff: ${options.accessMode}`);
} else {
  store.clearManaged();
  if (store.importLegacyPeople(options.users)) app.log.info(`Zugriff: ${store.getAccessMode()}`);
}
store.ensureDefaultBoard();
store.ensurePlannedColumns();

const bus = createEventBus();
const files = createFileStore(`${dataDir}/files`);
// Verbindung zu Home Assistant: im Add-on über den Supervisor, sonst nur mit Adresse und Long-Lived-Token
const token = runtime.ha?.token ?? '';
const ha = new HaClient({
  baseUrl: runtime.ha?.baseUrl ?? 'http://supervisor/core',
  token,
  wsUrl: runtime.ha?.wsUrl,
});
const log = { info: (m: string) => app.log.info(m), warn: (m: string) => app.log.warn(m) };

const push = createHaNotifyPush({
  ha,
  servicesFor: (userId) => store.userById(userId)?.notifyServices ?? [],
  panelPath: () => store.getSettings().panelPath ?? '/',
  log,
});
const notifier = createNotifier({
  store,
  push,
  options,
  now: () => new Date(),
  timeZone: () => timeZone,
  onChange: () => bus.emit({ by: null }),
  log,
});
nudgesClosed = (list) => void notifier.nudgesClosed(list);

// Wächter: Karten automatisch aus Zuständen in Home Assistant (nur mit Verbindung dorthin)
const watcherData = createWatcherData(db);
const watchers = token
  ? createWatchers({
      store,
      data: watcherData,
      ha,
      now: () => new Date(),
      timeZone: () => timeZone,
      onAssigned: (card, ids) => void notifier.notifyAssigned(card, ids).catch((err) => app.log.warn(err, 'Push zur neuen Karte fehlgeschlagen')),
      onNudge: (card, ids) => void notifier.notifyStillOpen(card, ids).catch((err) => app.log.warn(err, 'Erinnerung zur offenen Karte fehlgeschlagen')),
      onChange: () => bus.emit({ by: null }),
      log,
    })
  : undefined;
// Eigene Automationen in Home Assistant: das Ereignis stups_create_card legt eine Karte an
const automation = watchers
  ? createAutomationCards({
      store,
      ha,
      now: () => new Date(),
      presentPersonIds: () => watchers.presentPersonIds(),
      onAssigned: (card, ids) => void notifier.notifyAssigned(card, ids).catch((err) => app.log.warn(err, 'Push zur neuen Karte fehlgeschlagen')),
      onChange: () => bus.emit({ by: null }),
    })
  : undefined;
const sensors = createSensors({ store, ha, options, now: () => new Date(), timeZone: () => timeZone, log });

function housekeeping() {
  const purged = store.purgeTrash();
  if (purged > 0) app.log.info(`${purged} Einträge aus dem Papierkorb endgültig gelöscht`);
  const archived = store.archiveDone();
  if (archived > 0) {
    app.log.info(`${archived} erledigte Karten archiviert`);
    bus.emit({ by: null });
  }
  // Dateien gelöschter Karten wegräumen; eine Stunde Schonfrist für Uploads, die gerade ankommen
  const removed = files.cleanup(store.referencedFiles(), 60 * 60 * 1000);
  if (removed > 0) app.log.info(`${removed} verwaiste Dateien entfernt`);
}
housekeeping();
setInterval(housekeeping, 60 * 60 * 1000).unref();

// Karten, deren Termin heute dran ist, rücken von „Geplant" nach „Offen" (kurz nach Mitternacht)
function syncPlanned() {
  const moved = store.syncPlanned();
  if (moved > 0) {
    app.log.info(`${moved} Karten zwischen „Geplant" und „Offen" verschoben`);
    bus.emit({ by: null });
  }
}
syncPlanned();
setInterval(syncPlanned, 5 * 60 * 1000).unref();

// Alte Google-Kurzlinks im Hintergrund durch die Maps-URL ersetzen (braucht Netz, darum nicht blockierend)
void repairShortMapsLinks(store, undefined, log).catch((err) => app.log.warn(err, 'Maps-Links: Reparatur fehlgeschlagen'));

await ensureWebsocket(app); // einmal für den ganzen Server, nicht je Routen-Gruppe
// Anmeldung: im Add-on über Ingress, sonst mit eigenem Konto (Sitzungs-Cookie)
let setup: Setup | undefined;
if (accounts) {
  setup = createSetup({ accounts, log, bootstrap: runtime.identity.bootstrap, publicUrl: runtime.publicUrl });
  await setup.init();
  await app.register(clientGuard);
  await app.register(identityAuth, { identity: createSessionIdentity({ accounts }) });
  await app.register(authRoutes, {
    accounts,
    limiter: createLoginLimiter(),
    setup,
    secureCookie: runtime.publicUrl?.startsWith('https://') ?? false,
  });
  setInterval(() => accounts.purgeSessions(), 60 * 60 * 1000).unref();
} else {
  await app.register(ingressAuth, {
    enforceIp: runtime.identity.enforceIngressIp,
    devUser: runtime.identity.devUser,
  });
}

// Ohne Verbindung zu Home Assistant (lokale Entwicklung, Tests) gibt es kein Verzeichnis: Personen gelten als Administratoren.
// Nur dort lässt sich mit DEV_ADMINS (Kennungen, durch Komma getrennt) eine feste Administratorenliste vorgeben.
const directory = accounts
  ? createLocalDirectory(accounts)
  : runtime.ha
    ? createDirectory({ ha })
    : runtime.identity.devAdmins
      ? createStaticDirectory(runtime.identity.devAdmins)
      : undefined;
const access = createAccess({ store, directory });
const capabilities: Capabilities = {
  mode: runtime.mode,
  auth: accounts ? 'session' : 'ingress',
  ha: runtime.ha !== null,
  watchers: watchers !== undefined,
  sensors: runtime.ha !== null,
  push: runtime.ha ? ['ha-notify'] : [],
  publicUrl: runtime.publicUrl,
};
// Die Diagnose-Seite liegt außerhalb der API-Routen und braucht dieselbe Sperre
app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/api/spike') || !req.principal) return;
  const r = await access.evaluate({ id: req.principal.id, name: req.principal.name, displayName: req.principal.displayName });
  if (!r.allowed) return reply.code(403).send({ error: 'Kein Zugriff' });
});

app.get('/healthz', async () => ({ ok: true }));
// Die Diagnose-Seite liest die Personen aus der Datenbank, nicht aus den (nur einmal übernommenen) Optionen
const liveOptions = Object.create(options, {
  users: { enumerable: true, get: () => store.people().map((p) => ({ name: p.name, notify: p.notifyServices })) },
}) as Options;
await app.register(spikeRoutes, { options: liveOptions, ha, now: () => new Date() });
await app.register(apiRoutes, {
  store,
  bus,
  notifier,
  ha,
  directory,
  access,
  defaultDashboardPath: options.dashboardPath,
  accounts,
  capabilities,
  files,
  watchers,
  watcherData: watchers ? watcherData : undefined,
  automationLog: automation ? () => automation.log() : undefined,
  exportData: () => exportData(db, dataDir, shareDir),
});
const here = dirname(fileURLToPath(import.meta.url));
await app.register(fastifyStatic, {
  // zuerst die gebaute Oberfläche, dann die Diagnose-Seite
  root: [join(here, '..', 'web'), join(here, '..', 'public')],
});

if (token) {
  ha.connect();
  watchers?.start();
  automation?.start();
  ha.onNotificationAction((a) => {
    notifier.handleAction(a).catch((err) => app.log.error(err, 'Push-Aktion fehlgeschlagen'));
  });

  const loadTimeZone = () =>
    ha
      .getConfig()
      .then((c) => {
        timeZone = c.time_zone;
        app.log.info(`Zeitzone aus Home Assistant: ${timeZone}`);
      })
      .catch(() => setTimeout(loadTimeZone, 30_000).unref());
  void loadTimeZone();

  // Erinnerungen: alle 30 Sekunden und gleich beim Start (verpasste nachholen)
  const tick = () => notifier.tick().catch((err) => app.log.error(err, 'Erinnerungen fehlgeschlagen'));
  void tick();
  setInterval(tick, 30_000).unref();
  if (watchers) setInterval(() => void watchers.tick(), 30_000).unref();

  // Sensoren: beim Start, bei Änderungen (gebündelt) und alle 5 Minuten (HA vergisst sie bei einem eigenen Neustart)
  void sensors.publish();
  bus.subscribe(() => sensors.publishSoon());
  setInterval(() => void sensors.publish(), 5 * 60 * 1000).unref();

  let lastLogged: string | null = null;
  setInterval(() => {
    const { lastError, connected, subscribed } = ha.status();
    if (lastError !== lastLogged) {
      lastLogged = lastError;
      if (lastError) app.log.warn({ connected, subscribed }, lastError);
    }
  }, 5000).unref();
} else {
  app.log.warn('Keine Verbindung zu Home Assistant konfiguriert (SUPERVISOR_TOKEN oder HA_URL und HA_TOKEN fehlen): Verbindung ist deaktiviert');
}

await app.listen({ host: '0.0.0.0', port });
app.log.info(`Stups läuft auf Port ${port}`);
app.log.info(`Betriebsart: ${runtime.mode}`);

const shutdown = async () => {
  ha.close();
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
