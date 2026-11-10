import { readFileSync } from 'node:fs';
import { channelFromEnv, type Channel } from './channel.js';
import { parseOptions, type Options } from './config.js';

/**
 * - addon: läuft als Home-Assistant-Add-on (Supervisor-Token), Anmeldung über Ingress
 * - standalone-ha: eigener Container mit Verbindung zu Home Assistant (Adresse und Long-Lived-Token)
 * - standalone: eigener Container ohne Home Assistant
 */
export type Mode = 'addon' | 'standalone-ha' | 'standalone';

export interface HaConnection {
  baseUrl: string;
  token: string;
  /** Websocket-Adresse, wenn sie nicht aus der Basisadresse folgt (direkter Zugang: /api/websocket) */
  wsUrl?: string;
}

/** Ein ntfy-Server (selbst betrieben oder ntfy.sh), über den Push-Nachrichten gehen */
export interface NtfyConfig {
  /** Adresse des Servers ohne Pfad, zum Beispiel https://ntfy.example.org */
  url: string;
  /** Zugriffstoken (Bearer) oder Benutzer und Passwort (Basic), wenn der Server Anmeldung verlangt */
  token?: string;
  username?: string;
  password?: string;
}

export interface Runtime {
  mode: Mode;
  /** Normale App oder Beta (kommt mit dem Image, siehe channel.ts) */
  channel: Channel;
  dataDir: string;
  shareDir: string;
  port: number;
  timeZone: string;
  /** Adresse, unter der Handys Stups erreichen (für Push-Aktionen ohne Home Assistant) */
  publicUrl: string | null;
  options: Options;
  /** Add-on: Optionen mit ungültiger Uhrzeit (sie fielen auf den Standard zurück); sonst leer. In Docker bricht eine ungültige Uhrzeit den Start ab. */
  invalidOptions: string[];
  ha: HaConnection | null;
  /** Push über ntfy; im Add-on immer null (dort läuft Push über die Companion App) */
  ntfy: NtfyConfig | null;
  /**
   * Hinter einem Reverse Proxy: welcher Weiterleitung (X-Forwarded-For) Fastify glauben darf, damit die Sperre bei der Anmeldung
   * die echte Adresse sieht (STUPS_TRUST_PROXY: Anzahl der Proxys, Adressen/Netze oder true). Standard: false (nur die Verbindung zählt).
   */
  trustProxy: boolean | number | string[];
  identity: {
    /** Wie sich Benutzer anmelden: über Ingress (Add-on, Entwicklung) oder mit eigenem Konto (Sitzungs-Cookie) */
    kind: 'ingress' | 'session';
    /** Erster Administrator aus STUPS_ADMIN_USER und STUPS_ADMIN_PASSWORD (nur bei eigener Anmeldung) */
    bootstrap?: { username: string; password: string };
    /** Nur den Ingress-Proxy von Home Assistant zulassen */
    enforceIngressIp: boolean;
    /** Nur für Entwicklung und Tests */
    devUser?: { id: string; name: string; displayName: string };
    devAdmins?: string[];
    /** Nur für Browser-Tests: die Einrichtung beim ersten Start erscheint nie (DEV_NO_ONBOARDING, nur ohne IP-Prüfung) */
    devNoOnboarding: boolean;
  };
}

type Env = Record<string, string | undefined>;

/** STUPS_TRUST_PROXY: leer/false = aus, true = jedem Proxy glauben (nur wenn Stups sonst nicht erreichbar ist), Zahl = so viele Proxys, sonst Liste von Adressen oder Netzen */
export function parseTrustProxy(raw: string | undefined): boolean | number | string[] {
  const v = raw?.trim();
  if (!v || /^(false|0|no|off)$/i.test(v)) return false;
  if (/^(true|yes|on)$/i.test(v)) return true;
  if (/^[1-9]\d?$/.test(v)) return Number(v);
  const list = v.split(',').map((x) => x.trim()).filter(Boolean);
  if (list.every((x) => /^[0-9a-f:.]+(\/\d{1,3})?$/i.test(x) || /^(loopback|linklocal|uniquelocal)$/i.test(x))) return list;
  throw new Error('STUPS_TRUST_PROXY muss die Anzahl der Proxys (zum Beispiel 1), eine Liste von Adressen oder Netzen (172.18.0.0/16) oder true sein');
}

const set = (v: string | undefined): string | undefined => (v !== undefined && v.trim() !== '' ? v.trim() : undefined);

/** Einstellungen aus Umgebungsvariablen, in der Form der Datei options.json */
function optionsFromEnv(env: Env): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  const pairs: [string, string][] = [
    ['STUPS_DAILY_SUMMARY_TIME', 'daily_summary_time'],
    ['STUPS_OVERDUE_NAG_TIME', 'overdue_nag_time'],
    ['STUPS_DASHBOARD_PATH', 'dashboard_path'],
    ['STUPS_LOG_LEVEL', 'log_level'],
    ['STUPS_ACCESS_MODE', 'access_mode'],
  ];
  for (const [variable, key] of pairs) {
    const v = set(env[variable]);
    if (v !== undefined) raw[key] = v;
  }
  const users = set(env.STUPS_USERS);
  if (users !== undefined) {
    try {
      raw.users = JSON.parse(users);
    } catch {
      throw new Error('STUPS_USERS muss eine JSON-Liste sein, etwa [{"name":"Rene","notify":["mobile_app_iphone"]}]');
    }
  }
  return raw;
}

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

function ntfyFromEnv(own: (name: string) => string | undefined): NtfyConfig | null {
  const raw = own('NTFY_URL');
  const token = own('NTFY_TOKEN');
  const username = own('NTFY_USER');
  const password = own('NTFY_PASSWORD');
  if (raw === undefined) {
    if (token !== undefined || username !== undefined || password !== undefined) {
      throw new Error('STUPS_NTFY_TOKEN, STUPS_NTFY_USER und STUPS_NTFY_PASSWORD brauchen STUPS_NTFY_URL');
    }
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`STUPS_NTFY_URL ist keine Adresse: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('STUPS_NTFY_URL muss mit http:// oder https:// beginnen');
  if ((username === undefined) !== (password === undefined)) {
    throw new Error('STUPS_NTFY_USER und STUPS_NTFY_PASSWORD gehören zusammen: bitte beide setzen oder beide weglassen');
  }
  if (token !== undefined && username !== undefined) {
    throw new Error('STUPS_NTFY_TOKEN oder STUPS_NTFY_USER mit STUPS_NTFY_PASSWORD: bitte nur eines von beiden');
  }
  // Pfad, Suchteil und Raute fallen weg; ein Server unter einem Unterpfad (https://host/ntfy) bleibt erhalten
  const base = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  return { url: base, token, username, password };
}

/**
 * Stellt aus Umgebung und Dateien zusammen, wie Stups läuft.
 * Im Add-on gelten wie bisher nur options.json und die alten Variablen; die Variablen STUPS_* werden dort ignoriert,
 * damit nichts versehentlich greift. Außerhalb gilt: Umgebungsvariablen vor Datei.
 */
export function resolveRuntime(env: Env, readFile: (path: string) => Record<string, unknown> = readJson): Runtime {
  const supervisorToken = set(env.SUPERVISOR_TOKEN);
  const directUrl = set(env.HA_URL);
  const directToken = set(env.HA_TOKEN);

  const mode: Mode = supervisorToken ? 'addon' : directUrl && directToken ? 'standalone-ha' : 'standalone';
  const own = (name: string): string | undefined => (mode === 'addon' ? undefined : set(env[`STUPS_${name}`]));

  const dataDir = own('DATA_DIR') ?? set(env.DATA_DIR) ?? '/data';
  const optionsPath = own('CONFIG') ?? set(env.OPTIONS_PATH) ?? (mode === 'addon' ? '/data/options.json' : `${dataDir}/options.json`);
  const fileRaw = readFile(optionsPath);
  const invalidOptions: string[] = [];
  const options = mode === 'addon' ? parseOptions(fileRaw, invalidOptions) : parseOptions({ ...fileRaw, ...optionsFromEnv(env) });

  const port = Number(own('PORT') ?? set(env.PORT) ?? 8099);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Ungültiger Port: ${own('PORT') ?? env.PORT}`);

  let ha: HaConnection | null = null;
  if (mode === 'addon') {
    ha = { baseUrl: directUrl ?? 'http://supervisor/core', token: supervisorToken! };
  } else if (mode === 'standalone-ha') {
    const baseUrl = directUrl!.replace(/\/+$/, '');
    ha = { baseUrl, token: directToken!, wsUrl: `${baseUrl.replace(/^http/, 'ws')}/api/websocket` };
  }

  const devName = set(env.DEV_USER);
  const noIpCheck = env.ENFORCE_INGRESS_IP === 'false';
  const devAdmins = noIpCheck ? set(env.DEV_ADMINS) : undefined;
  const publicUrl = own('PUBLIC_URL')?.replace(/\/+$/, '') ?? null;
  // Ohne Add-on melden sich Benutzer mit eigenem Konto an. Ohne IP-Prüfung (Entwicklung, Tests) bleibt es bei Ingress.
  const kind = mode === 'addon' || noIpCheck ? 'ingress' : 'session';
  const adminUser = own('ADMIN_USER');
  const adminPassword = own('ADMIN_PASSWORD');
  if (kind === 'session' && (adminUser === undefined) !== (adminPassword === undefined)) {
    throw new Error('STUPS_ADMIN_USER und STUPS_ADMIN_PASSWORD gehören zusammen: bitte beide setzen oder beide weglassen');
  }

  return {
    mode,
    channel: channelFromEnv(env),
    dataDir,
    shareDir: own('SHARE_DIR') ?? set(env.SHARE_DIR) ?? '/share',
    port,
    timeZone: set(env.TZ) ?? 'Europe/Berlin',
    publicUrl,
    options,
    invalidOptions,
    ha,
    ntfy: ntfyFromEnv(own),
    trustProxy: parseTrustProxy(own('TRUST_PROXY')),
    identity: {
      kind,
      bootstrap: kind === 'session' && adminUser !== undefined && adminPassword !== undefined ? { username: adminUser, password: adminPassword } : undefined,
      enforceIngressIp: !noIpCheck,
      devUser: devName ? { id: `dev-${devName}`, name: devName, displayName: devName } : undefined,
      devAdmins: devAdmins === undefined ? undefined : devAdmins.split(',').map((s) => s.trim()).filter(Boolean),
      devNoOnboarding: noIpCheck && set(env.DEV_NO_ONBOARDING) === '1',
    },
  };
}

/** Was die Oberfläche anzeigen darf: ohne Home Assistant entfallen Wächter und Sensoren ohne Fehlermeldung */
export interface Capabilities {
  mode: Mode;
  /** normale App oder Beta (die Oberfläche zeigt in der Beta ein Band und die Schalter für Push und Wächter) */
  channel: Channel;
  auth: 'ingress' | 'session';
  ha: boolean;
  watchers: boolean;
  sensors: boolean;
  /** Haus-Kanäle (Ansage, Lampe): nur mit Verbindung zu Home Assistant */
  house: boolean;
  /** Wege, auf denen Push zugestellt werden kann */
  push: ('ha-notify' | 'ntfy')[];
  publicUrl: string | null;
  /** Anmeldung mit Passkey (eigene Konten und STUPS_PUBLIC_URL mit HTTPS) */
  passkeys: boolean;
  /** Version der App (kommt mit dem Image; null, wenn unbekannt) */
  version?: string | null;
}
