import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { apiRoutes } from './api.js';
import { createBetaGate } from './beta-gate.js';
import { channelNames, withChannel } from './channel.js';
import type { Options } from './config.js';
import { resolveRuntime, type Capabilities } from './runtime.js';
import { combinePush, createHaNotifyPush, type PushGateway } from './push.js';
import { createActionTokens, createNtfyPush } from './ntfy.js';
import { createRoundTrips, pushActionRoutes } from './push-action.js';
import { openDb } from './db.js';
import { exportData, importTransfer, transferStatus } from './transfer.js';
import { createEventBus } from './events.js';
import { createAvatars } from './avatars.js';
import { createFileStore } from './files.js';
import { HaClient } from './ha.js';
import { createAccess } from './access.js';
import { createAccounts } from './accounts.js';
import { createDirectory, createLocalDirectory, createStaticDirectory } from './directory.js';
import { identityAuth } from './identity.js';
import { registerLanguageHook } from './i18n/hook.js';
import { setDefaultLanguage } from './i18n/index.js';
import { ingressAuth } from './ingress.js';
import { createPasskeys, passkeyConfigFrom, type Passkeys } from './passkeys.js';
import { authRoutes, clientGuard, createLoginLimiter, createSessionIdentity, createSetup, type Setup } from './session-auth.js';
import { repairShortMapsLinks } from './linkRepair.js';
import { createNotifier } from './notifications.js';
import { createAutomationCards } from './automation-cards.js';
import { createWatcherData } from './watcher-data.js';
import { createWatchers } from './watchers.js';
import { createHousePush, createHouseSubscription } from './house.js';
import { createHouseDrivers } from './house-drivers.js';
import { createPresence } from './presence.js';
import { createSensors } from './sensors.js';
import { spikeRoutes } from './spike.js';
import { createStore, type ClosedNudge } from './store.js';
import { ensureWebsocket } from './ws.js';

const runtime = resolveRuntime(process.env);
const { dataDir, shareDir, port, options } = runtime;

const app = Fastify({ logger: { level: options.logLevel } });
// Sprache der Meldungen: je Anfrage aus den Kopfzeilen (die App sendet X-Stups-Language), sonst Englisch
setDefaultLanguage('en');
registerLanguageHook(app);

const dbPath = `${dataDir}/stups.sqlite`;
// Neue App ohne eigene Daten: Datenbank und Anhänge aus einem Export der alten App übernehmen (Einstellungen › Umzug)
const transfer = transferStatus(dbPath, shareDir);
if (importTransfer(dbPath, `${dataDir}/files`, shareDir, `${dataDir}/avatars`)) app.log.info('Daten aus dem Umzug (/share/stups-umzug) übernommen');
else if (transfer.state === 'none') app.log.info(transfer.text);
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
// Das erste Board entsteht mit der ersten Anfrage der App, in der Sprache dieser Person (der Haken läuft nach dem Sprachhaken von oben)
app.addHook('onRequest', (req, _reply, done) => {
  if (req.method === 'GET' && (req.url.startsWith('/api/boards') || req.url.startsWith('/api/me'))) store.ensureDefaultBoard();
  done();
});
store.ensurePlannedColumns();

const bus = createEventBus({ changes: () => store.takeChanges() });
const files = createFileStore(`${dataDir}/files`);
// Verbindung zu Home Assistant: im Add-on über den Supervisor, sonst nur mit Adresse und Long-Lived-Token
const token = runtime.ha?.token ?? '';
const ha = new HaClient({
  baseUrl: runtime.ha?.baseUrl ?? 'http://supervisor/core',
  token,
  wsUrl: runtime.ha?.wsUrl,
});
const log = { info: (m: string) => app.log.info(m), warn: (m: string) => app.log.warn(m) };
// Bilder der Personen: Upload, und im Add-on (oder mit Verbindung zu Home Assistant) das Bild der zugeordneten HA-Person
const avatars = createAvatars({ dir: `${dataDir}/avatars`, store, ha: runtime.ha ? ha : undefined, log });

// Normale App oder Beta: die Beta hat eigene Namen für alles Sichtbare und startet mit ausgeschaltetem Push und ausgeschalteten Wächtern
const names = channelNames(runtime.channel);
const betaGate = createBetaGate({
  enabled: names.channel === 'beta',
  settings: { get: (key) => store.rawSetting(key), put: (key, value) => store.putRawSetting(key, value) },
  people: () => store.people().map((p) => p.id),
});
if (betaGate.enabled) {
  const s = betaGate.state();
  app.log.info('Kanal: Beta (Push: ' + (s.push.mode === 'off' ? 'aus' : s.push.mode === 'all' ? 'an' : 'nur eine Person') + ', Wächter: ' + (s.watchers ? 'an' : 'aus') + ')');
}

// Push-Wege: Companion App über Home Assistant, ntfy (Standalone), oder beides nebeneinander
const actionTokens = createActionTokens({ secret: () => store.pushSecret() });
const roundTrips = createRoundTrips();
// Haus-Kanäle (Ansage über einen Lautsprecher, Lampe): ein dritter Weg, nur mit Verbindung zu Home Assistant
const houseDrivers = createHouseDrivers({
  ha,
  setTimer: (fn, ms) => setTimeout(fn, ms).unref(),
  clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
  log,
});
const presence = createPresence({ ha, people: () => store.people(), now: () => new Date() });
const house = runtime.ha
  ? createHousePush({ store, drivers: houseDrivers, presence, now: () => new Date(), timeZone: () => timeZone, allowed: (userId) => betaGate.pushAllowed(userId), log })
  : null;
const houseSubscription = house ? createHouseSubscription({ ha, presence, store, house, log }) : null;
const gateways = [
  runtime.ha
    ? createHaNotifyPush({
        ha,
        servicesFor: (userId) => store.userById(userId)?.notifyServices ?? [],
        panelPath: () => store.getSettings().panelPath ?? '/',
        publicUrl: runtime.publicUrl,
        log,
      })
    : null,
  runtime.ntfy
    ? createNtfyPush({ config: runtime.ntfy, topicFor: (userId) => store.ntfyTopic(userId), publicUrl: runtime.publicUrl, tokens: actionTokens, log })
    : null,
  house,
].filter((g): g is PushGateway => g !== null);
const push = withChannel(betaGate.gatePush(combinePush(gateways)), names);
const notifier = createNotifier({
  store,
  push,
  options,
  now: () => new Date(),
  timeZone: () => timeZone,
  actionPrefix: names.actionPrefix,
  onChange: () => bus.emit({ by: null }),
  log,
});
nudgesClosed = (list) => void notifier.nudgesClosed(list);

// Wächter: Karten automatisch aus Zuständen in Home Assistant (nur mit Verbindung dorthin)
const watcherData = createWatcherData(db, undefined, () => store.markAllChanged());
const watchers = token
  ? createWatchers({
      store,
      data: watcherData,
      ha,
      now: () => new Date(),
      timeZone: () => timeZone,
      enabled: () => betaGate.watchersEnabled(),
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
      eventType: names.eventType,
      onAssigned: (card, ids) => void notifier.notifyAssigned(card, ids).catch((err) => app.log.warn(err, 'Push zur neuen Karte fehlgeschlagen')),
      onChange: () => bus.emit({ by: null }),
    })
  : undefined;
const sensors = createSensors({ store, ha, options, now: () => new Date(), timeZone: () => timeZone, log, names });
// Wer die Wächter in der Beta einschaltet, bekommt sofort den aktuellen Stand abgeglichen
betaGate.onWatchers((on) => {
  if (on) void watchers?.snapshot();
});

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
let passkeys: Passkeys | undefined;
if (accounts) {
  setup = createSetup({ accounts, log, bootstrap: runtime.identity.bootstrap, publicUrl: runtime.publicUrl });
  await setup.init();
  await app.register(clientGuard);
  await app.register(identityAuth, { identity: createSessionIdentity({ accounts }) });
  const passkeyConfig = passkeyConfigFrom(runtime.publicUrl);
  if (passkeyConfig) passkeys = createPasskeys({ db, accounts, config: passkeyConfig });
  else if (runtime.publicUrl) app.log.info('Passkeys sind aus: STUPS_PUBLIC_URL braucht dafür HTTPS und einen Namen statt einer IP-Adresse');
  await app.register(authRoutes, {
    accounts,
    limiter: createLoginLimiter(),
    setup,
    secureCookie: runtime.publicUrl?.startsWith('https://') ?? false,
    passkeys,
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
  ? // Mit Home Assistant daneben: seine Personen als Vorschläge (Administrator ist, wer es im Konto ist)
    createLocalDirectory(accounts, runtime.ha ? createDirectory({ ha }).persons : undefined)
  : runtime.ha
    ? createDirectory({ ha })
    : runtime.identity.devAdmins
      ? createStaticDirectory(runtime.identity.devAdmins)
      : undefined;
const access = createAccess({ store, directory });
const capabilities: Capabilities = {
  mode: runtime.mode,
  channel: runtime.channel,
  auth: accounts ? 'session' : 'ingress',
  ha: runtime.ha !== null,
  watchers: watchers !== undefined,
  sensors: runtime.ha !== null,
  house: house !== null,
  push: [...(runtime.ha ? (['ha-notify'] as const) : []), ...(runtime.ntfy ? (['ntfy'] as const) : [])],
  publicUrl: runtime.publicUrl,
  passkeys: passkeys !== undefined,
};
// Knöpfe in ntfy-Nachrichten melden sich ohne Sitzung zurück; erlaubt ist nur, was das signierte Token trägt
if (runtime.ntfy) {
  await app.register(pushActionRoutes, { tokens: actionTokens, notifier, store, roundTrips, log });
}
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
  // Ohne Verbindung zu Home Assistant gibt es keinen Client: sonst wartet jede Anfrage, die ihn fragt (Personen & Zugriff,
  // Dashboards), auf die Namensauflösung von „supervisor" und braucht dafür je nach Rechner Sekunden
  ha: runtime.ha ? ha : undefined,
  directory,
  access,
  defaultDashboardPath: options.dashboardPath,
  accounts,
  passkeys,
  betaGate,
  capabilities,
  push,
  house: house && houseSubscription ? { push: house, sync: () => houseSubscription.sync(), entityOwners: () => presence.entityOwners() } : undefined,
  ntfy: runtime.ntfy ? { url: runtime.ntfy.url, roundTrip: (personId) => roundTrips.last(personId) } : undefined,
  files,
  avatars,
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
  if (runtime.mode === 'standalone-ha') app.log.info(`Verbindung zu Home Assistant: ${runtime.ha!.baseUrl}`);
  ha.connect();
  watchers?.start();
  avatars.start();
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

  if (watchers) setInterval(() => void watchers.tick(), 30_000).unref();

  // Haus-Kanäle: Szenen aufräumen (nach einem Neustart mitten im Leuchten), auf die Heimkehr abonnieren, wartende Nachrichten ausliefern
  if (house && houseSubscription) {
    const warn = (what: string) => (err: unknown) => app.log.warn(`Haus: ${what}: ${String(err)}`);
    let cleaned = false;
    ha.onConnected(() => {
      if (!cleaned) {
        cleaned = true;
        void houseDrivers.cleanup().then((n) => n > 0 && app.log.info(`Haus: ${n} übrig gebliebene Szene(n) aufgeräumt`));
      }
      void houseSubscription.sync().catch(warn('Abonnement'));
    });
    setInterval(() => void house.tick().catch(warn('Takt')), 30_000).unref();
    setInterval(() => void houseSubscription.sync().catch(warn('Abonnement')), 5 * 60_000).unref();
  }

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

// Erinnerungen: alle 30 Sekunden und gleich beim Start (verpasste nachholen), sobald es einen Push-Weg gibt
if (gateways.length > 0) {
  const tick = () => notifier.tick().catch((err) => app.log.error(err, 'Erinnerungen fehlgeschlagen'));
  void tick();
  setInterval(tick, 30_000).unref();
  if (runtime.ntfy) app.log.info(`Push über ntfy: ${runtime.ntfy.url}${runtime.publicUrl ? '' : ' (ohne STUPS_PUBLIC_URL kommen die Nachrichten ohne Link und Knöpfe)'}`);
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
