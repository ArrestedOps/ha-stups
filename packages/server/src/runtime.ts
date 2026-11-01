import { readFileSync } from 'node:fs';
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

export interface Runtime {
  mode: Mode;
  dataDir: string;
  shareDir: string;
  port: number;
  timeZone: string;
  /** Adresse, unter der Handys Stups erreichen (für Push-Aktionen ohne Home Assistant) */
  publicUrl: string | null;
  options: Options;
  ha: HaConnection | null;
  identity: {
    /** Nur den Ingress-Proxy von Home Assistant zulassen */
    enforceIngressIp: boolean;
    /** Nur für Entwicklung und Tests */
    devUser?: { id: string; name: string; displayName: string };
    devAdmins?: string[];
  };
}

type Env = Record<string, string | undefined>;

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
  const options = parseOptions(mode === 'addon' ? fileRaw : { ...fileRaw, ...optionsFromEnv(env) });

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

  return {
    mode,
    dataDir,
    shareDir: own('SHARE_DIR') ?? set(env.SHARE_DIR) ?? '/share',
    port,
    timeZone: set(env.TZ) ?? 'Europe/Berlin',
    publicUrl,
    options,
    ha,
    identity: {
      enforceIngressIp: !noIpCheck,
      devUser: devName ? { id: `dev-${devName}`, name: devName, displayName: devName } : undefined,
      devAdmins: devAdmins === undefined ? undefined : devAdmins.split(',').map((s) => s.trim()).filter(Boolean),
    },
  };
}

/** Was die Oberfläche anzeigen darf: ohne Home Assistant entfallen Wächter und Sensoren ohne Fehlermeldung */
export interface Capabilities {
  mode: Mode;
  auth: 'ingress';
  ha: boolean;
  watchers: boolean;
  sensors: boolean;
  /** Wege, auf denen Push zugestellt werden kann */
  push: 'ha-notify'[];
  publicUrl: string | null;
}
