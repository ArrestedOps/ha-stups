import type { Options } from './config.js';
import type { Mode } from './runtime.js';
import type { Store } from './store.js';
import type { AddonOptionsImport } from './store/types.js';

/** Die Standardwerte des Add-ons (wie in config.yaml): Seit der Übernahme beim ersten Start gelten sie, solange die App nichts anderes eingestellt hat */
export const ADDON_DEFAULTS = { dashboardPath: '/', dailySummaryTime: '08:00', overdueNagTime: '18:00' } as const;

/** Die Add-on-Optionen als Eingabe der einmaligen Übernahme */
export function addonImportOf(raw: Options): AddonOptionsImport {
  return { users: raw.users, accessMode: raw.accessMode, dashboardPath: raw.dashboardPath, dailySummaryTime: raw.dailySummaryTime, overdueNagTime: raw.overdueNagTime };
}

/** Was im Add-on nach der Übernahme noch aus den Optionen gilt: nur das Log-Level, alles andere die Standardwerte */
export function addonFallbackOptions(raw: Options): Options {
  return { ...raw, users: [], accessMode: 'selected', ...ADDON_DEFAULTS };
}

/**
 * Personen, Zugriff und Einstellungen beim Start. Im Add-on übernimmt der erste Start die Optionen einmal in die Datenbank (die App
 * gilt danach); in Docker gilt die Konfiguration wie bisher bei jedem Start (gefüllte Liste: Personen und Zugriff sind in der App gesperrt).
 */
export function applyStartupOptions(
  store: Store,
  runtime: { mode: Mode; options: Options },
  log: { info(message: string): void; warn(message: string): void },
): void {
  const { options } = runtime;
  if (runtime.mode === 'addon') {
    const result = store.importAddonOptions(addonImportOf(options), ADDON_DEFAULTS);
    if (!result) return;
    const parts = [`${result.people} Personen`];
    if (result.accessMode) parts.push(`Zugriff ${result.accessMode}`);
    if (result.settings.length > 0) parts.push(`Einstellungen: ${result.settings.join(', ')}`);
    log.info(`Aus den Add-on-Optionen übernommen (gilt künftig nur noch in der App): ${parts.join(', ')}`);
    if (result.skipped.length > 0) log.warn(`Ungültige Werte in den Add-on-Optionen wurden nicht übernommen: ${result.skipped.join(', ')}`);
    return;
  }
  if (options.users.some((u) => u.name !== '')) {
    // Ist in der Konfiguration eine Personenliste eingetragen, gilt sie (Personen, Push-Geräte, Zugriff)
    store.applyManagedPeople(options.users, options.accessMode);
    log.info(`Personen und Zugriff aus der Konfiguration übernommen (${options.users.length}), Zugriff: ${options.accessMode}`);
  } else {
    store.clearManaged();
    if (store.importLegacyPeople(options.users)) log.info(`Zugriff: ${store.getAccessMode()}`);
  }
}
