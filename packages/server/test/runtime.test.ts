import { describe, expect, it } from 'vitest';
import { resolveRuntime } from '../src/runtime.js';

const files = (content: Record<string, Record<string, unknown>> = {}) => (path: string) => content[path] ?? {};

describe('Betriebsart', () => {
  it('Add-on: Supervisor-Token gesetzt', () => {
    const r = resolveRuntime({ SUPERVISOR_TOKEN: 'abc' }, files());
    expect(r.mode).toBe('addon');
    expect(r.ha).toEqual({ baseUrl: 'http://supervisor/core', token: 'abc' });
  });

  it('Add-on: eigene HA_URL gilt weiter (Tests mit nachgebautem Home Assistant)', () => {
    const r = resolveRuntime({ SUPERVISOR_TOKEN: 'abc', HA_URL: 'http://127.0.0.1:9999' }, files());
    expect(r.ha).toEqual({ baseUrl: 'http://127.0.0.1:9999', token: 'abc' });
  });

  it('Standalone mit Home Assistant: Adresse und Long-Lived-Token, Websocket unter /api/websocket', () => {
    const r = resolveRuntime({ HA_URL: 'https://ha.example.org:8123/', HA_TOKEN: 'lll' }, files());
    expect(r.mode).toBe('standalone-ha');
    expect(r.ha).toEqual({ baseUrl: 'https://ha.example.org:8123', token: 'lll', wsUrl: 'wss://ha.example.org:8123/api/websocket' });
  });

  it('Standalone ohne Home Assistant: weder Token noch Adresse mit Token', () => {
    expect(resolveRuntime({}, files()).mode).toBe('standalone');
    expect(resolveRuntime({ SUPERVISOR_TOKEN: '' }, files()).mode).toBe('standalone');
    expect(resolveRuntime({ HA_URL: 'http://ha:8123' }, files())).toMatchObject({ mode: 'standalone', ha: null });
    expect(resolveRuntime({ HA_TOKEN: 'x' }, files())).toMatchObject({ mode: 'standalone', ha: null });
  });
});

describe('Pfade und Port', () => {
  it('Vorgaben wie bisher', () => {
    const r = resolveRuntime({ SUPERVISOR_TOKEN: 'abc' }, files());
    expect(r).toMatchObject({ dataDir: '/data', shareDir: '/share', port: 8099, timeZone: 'Europe/Berlin', publicUrl: null });
  });

  it('die alten Variablen gelten weiter', () => {
    const r = resolveRuntime({ DATA_DIR: '/x', SHARE_DIR: '/y', PORT: '1234', TZ: 'UTC' }, files());
    expect(r).toMatchObject({ dataDir: '/x', shareDir: '/y', port: 1234, timeZone: 'UTC' });
  });

  it('Standalone: STUPS_* geht vor den alten Variablen', () => {
    const r = resolveRuntime({ STUPS_DATA_DIR: '/daten', DATA_DIR: '/x', STUPS_PORT: '8080', PORT: '1', STUPS_PUBLIC_URL: 'https://stups.example.org/' }, files());
    expect(r).toMatchObject({ dataDir: '/daten', port: 8080, publicUrl: 'https://stups.example.org' });
  });

  it('Add-on: STUPS_* wird ignoriert', () => {
    const r = resolveRuntime({ SUPERVISOR_TOKEN: 'abc', STUPS_DATA_DIR: '/daten', STUPS_PORT: '8080', STUPS_PUBLIC_URL: 'https://x', STUPS_LOG_LEVEL: 'debug' }, files());
    expect(r).toMatchObject({ dataDir: '/data', port: 8099, publicUrl: null });
    expect(r.options.logLevel).toBe('info');
  });

  it('weist einen ungültigen Port ab', () => {
    expect(() => resolveRuntime({ PORT: 'abc' }, files())).toThrow(/Port/);
    expect(() => resolveRuntime({ STUPS_PORT: '70000' }, files())).toThrow(/Port/);
  });
});

describe('Einstellungen', () => {
  it('Add-on liest nur options.json', () => {
    const r = resolveRuntime({ SUPERVISOR_TOKEN: 'abc' }, files({ '/data/options.json': { daily_summary_time: '07:30', access_mode: 'everyone', users: [{ name: 'Rene', notify: ['mobile_app_x'] }] } }));
    expect(r.options).toMatchObject({ dailySummaryTime: '07:30', accessMode: 'everyone', users: [{ name: 'Rene', notify: ['mobile_app_x'] }] });
  });

  it('OPTIONS_PATH wählt die Datei', () => {
    const r = resolveRuntime({ OPTIONS_PATH: '/etc/o.json' }, files({ '/etc/o.json': { log_level: 'debug' } }));
    expect(r.options.logLevel).toBe('debug');
  });

  it('Standalone: die Datei liegt vorgabemäßig im Datenordner, STUPS_CONFIG wählt eine andere', () => {
    const a = resolveRuntime({ STUPS_DATA_DIR: '/daten' }, files({ '/daten/options.json': { log_level: 'warn' } }));
    expect(a.options.logLevel).toBe('warn');
    const b = resolveRuntime({ STUPS_CONFIG: '/cfg.json' }, files({ '/cfg.json': { log_level: 'error' } }));
    expect(b.options.logLevel).toBe('error');
  });

  it('Standalone: Umgebungsvariablen gehen vor die Datei', () => {
    const r = resolveRuntime(
      { STUPS_DAILY_SUMMARY_TIME: '06:45', STUPS_ACCESS_MODE: 'everyone', STUPS_DASHBOARD_PATH: 'lovelace/home', STUPS_USERS: '[{"name":"Anna","notify":["notify.mobile_app_a"]}]' },
      files({ '/data/options.json': { daily_summary_time: '09:00', overdue_nag_time: '19:00' } }),
    );
    expect(r.options).toMatchObject({ dailySummaryTime: '06:45', overdueNagTime: '19:00', accessMode: 'everyone', dashboardPath: '/lovelace/home' });
    expect(r.options.users).toEqual([{ name: 'Anna', notify: ['mobile_app_a'] }]);
  });

  it('weist falsche Werte mit einer klaren Meldung ab', () => {
    expect(() => resolveRuntime({ STUPS_DAILY_SUMMARY_TIME: '25:00' }, files())).toThrow(/daily_summary_time/);
    expect(() => resolveRuntime({ STUPS_USERS: 'kein json' }, files())).toThrow(/STUPS_USERS/);
  });
});

describe('Anmeldung', () => {
  it('Add-on: Ingress', () => {
    expect(resolveRuntime({ SUPERVISOR_TOKEN: 'abc' }, files()).identity.kind).toBe('ingress');
  });

  it('Standalone: eigene Anmeldung mit Sitzung', () => {
    expect(resolveRuntime({}, files()).identity.kind).toBe('session');
    expect(resolveRuntime({ HA_URL: 'http://ha', HA_TOKEN: 't' }, files()).identity.kind).toBe('session');
  });

  it('ohne IP-Prüfung (Entwicklung, Tests) bleibt es bei Ingress', () => {
    expect(resolveRuntime({ ENFORCE_INGRESS_IP: 'false' }, files()).identity.kind).toBe('ingress');
  });

  it('erster Administrator aus der Umgebung, nur beide zusammen', () => {
    const r = resolveRuntime({ STUPS_ADMIN_USER: 'chef', STUPS_ADMIN_PASSWORD: 'langes-passwort' }, files());
    expect(r.identity.bootstrap).toEqual({ username: 'chef', password: 'langes-passwort' });
    expect(() => resolveRuntime({ STUPS_ADMIN_USER: 'chef' }, files())).toThrow(/gehören zusammen/);
    expect(() => resolveRuntime({ STUPS_ADMIN_PASSWORD: 'langes-passwort' }, files())).toThrow(/gehören zusammen/);
    expect(resolveRuntime({}, files()).identity.bootstrap).toBeUndefined();
  });

  it('Add-on: STUPS_ADMIN_* wird ignoriert', () => {
    const r = resolveRuntime({ SUPERVISOR_TOKEN: 'abc', STUPS_ADMIN_USER: 'chef', STUPS_ADMIN_PASSWORD: 'langes-passwort' }, files());
    expect(r.identity.bootstrap).toBeUndefined();
  });
});

describe('Entwicklung und Tests', () => {
  it('Ingress-Prüfung ist vorgabemäßig an', () => {
    const r = resolveRuntime({ DEV_USER: 'rene', DEV_ADMINS: 'dev-rene' }, files());
    expect(r.identity.enforceIngressIp).toBe(true);
    expect(r.identity.devAdmins).toBeUndefined(); // gilt nur ohne IP-Prüfung
    expect(r.identity.devUser).toEqual({ id: 'dev-rene', name: 'rene', displayName: 'rene' });
  });

  it('ohne IP-Prüfung gilt die Administratorenliste', () => {
    const r = resolveRuntime({ ENFORCE_INGRESS_IP: 'false', DEV_ADMINS: 'dev-rene, dev-anna' }, files());
    expect(r.identity.enforceIngressIp).toBe(false);
    expect(r.identity.devAdmins).toEqual(['dev-rene', 'dev-anna']);
  });
});

describe('ntfy', () => {
  it('ohne STUPS_NTFY_URL kein ntfy', () => {
    expect(resolveRuntime({}, files()).ntfy).toBeNull();
  });

  it('Adresse ohne Pfad, Schrägstrich am Ende fällt weg; Unterpfad bleibt', () => {
    expect(resolveRuntime({ STUPS_NTFY_URL: 'https://ntfy.example.org/' }, files()).ntfy).toMatchObject({ url: 'https://ntfy.example.org' });
    expect(resolveRuntime({ STUPS_NTFY_URL: 'http://192.168.1.5:8080' }, files()).ntfy).toMatchObject({ url: 'http://192.168.1.5:8080' });
    expect(resolveRuntime({ STUPS_NTFY_URL: 'https://example.org/ntfy/?x=1#y' }, files()).ntfy).toMatchObject({ url: 'https://example.org/ntfy' });
  });

  it('Zugriffstoken oder Benutzer mit Passwort', () => {
    expect(resolveRuntime({ STUPS_NTFY_URL: 'https://n', STUPS_NTFY_TOKEN: 'tk_x' }, files()).ntfy).toEqual({
      url: 'https://n',
      token: 'tk_x',
      username: undefined,
      password: undefined,
    });
    expect(resolveRuntime({ STUPS_NTFY_URL: 'https://n', STUPS_NTFY_USER: 'u', STUPS_NTFY_PASSWORD: 'p' }, files()).ntfy).toMatchObject({
      username: 'u',
      password: 'p',
    });
  });

  it('lehnt Unsinn mit einer verständlichen Meldung ab', () => {
    expect(() => resolveRuntime({ STUPS_NTFY_URL: 'kein-link' }, files())).toThrow(/keine Adresse/);
    expect(() => resolveRuntime({ STUPS_NTFY_URL: 'ftp://n' }, files())).toThrow(/http/);
    expect(() => resolveRuntime({ STUPS_NTFY_TOKEN: 'tk_x' }, files())).toThrow(/STUPS_NTFY_URL/);
    expect(() => resolveRuntime({ STUPS_NTFY_URL: 'https://n', STUPS_NTFY_USER: 'u' }, files())).toThrow(/gehören zusammen/);
    expect(() => resolveRuntime({ STUPS_NTFY_URL: 'https://n', STUPS_NTFY_TOKEN: 't', STUPS_NTFY_USER: 'u', STUPS_NTFY_PASSWORD: 'p' }, files())).toThrow(/nur eines/);
  });

  it('gilt auch mit Home Assistant daneben, im Add-on aber nie', () => {
    expect(resolveRuntime({ HA_URL: 'http://ha:8123', HA_TOKEN: 'x', STUPS_NTFY_URL: 'https://n' }, files()).ntfy).not.toBeNull();
    expect(resolveRuntime({ SUPERVISOR_TOKEN: 'abc', STUPS_NTFY_URL: 'https://n' }, files()).ntfy).toBeNull();
  });
});

describe('Kanal (normale App oder Beta)', () => {
  it('ohne Angabe ist es die normale App', () => {
    expect(resolveRuntime({}, files()).channel).toBe('stable');
    expect(resolveRuntime({ SUPERVISOR_TOKEN: 'abc' }, files()).channel).toBe('stable');
  });

  it('STUPS_CHANNEL=beta gilt in jeder Betriebsart, auch im Add-on (es kommt mit dem Image, nicht aus den Optionen)', () => {
    expect(resolveRuntime({ SUPERVISOR_TOKEN: 'abc', STUPS_CHANNEL: 'beta' }, files())).toMatchObject({ mode: 'addon', channel: 'beta' });
    expect(resolveRuntime({ STUPS_CHANNEL: 'beta' }, files()).channel).toBe('beta');
    expect(resolveRuntime({ HA_URL: 'http://ha:8123', HA_TOKEN: 'x', STUPS_CHANNEL: 'beta' }, files())).toMatchObject({ mode: 'standalone-ha', channel: 'beta' });
  });
});
