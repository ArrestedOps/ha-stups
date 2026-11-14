/**
 * Symbol einer Wächter-Aufgabe aus der beobachteten Entität: erst ein Hinweis im Namen (Waschmaschine, Briefkasten …), dann das
 * Symbol der Entität selbst (`attributes.icon`, wenn es zur Bibliothek der Oberfläche gehört), dann `device_class`, dann die
 * Domäne. Die Namen sind die der Symbol-Bibliothek in packages/web/src/lib/symbols (ein Test der Oberfläche prüft, dass es sie
 * alle gibt). Keine Abhängigkeiten, damit der Test der Oberfläche die Datei lesen kann.
 */

/** device_class von Sensoren und Binärsensoren */
const BY_DEVICE_CLASS: Record<string, string> = {
  door: 'door',
  opening: 'door',
  window: 'window-closed-variant',
  garage_door: 'garage-open',
  lock: 'lock-outline',
  motion: 'motion-sensor',
  occupancy: 'motion-sensor',
  presence: 'motion-sensor',
  smoke: 'smoke-detector-outline',
  gas: 'alarm-light-outline',
  carbon_monoxide: 'alarm-light-outline',
  safety: 'alarm-light-outline',
  tamper: 'alarm-light-outline',
  moisture: 'water-alert-outline',
  battery: 'battery-outline',
  battery_charging: 'battery-outline',
  plug: 'power-plug-outline',
  power: 'power-plug-outline',
  energy: 'power-plug-outline',
  voltage: 'flash-outline',
  current: 'flash-outline',
  temperature: 'thermostat',
  heat: 'thermostat',
  cold: 'thermostat',
  humidity: 'water-outline',
  connectivity: 'wifi',
  problem: 'alert-outline',
  update: 'update',
  running: 'washing-machine-alert',
  vibration: 'washing-machine-alert',
  illuminance: 'lightbulb-outline',
  sound: 'speaker-wireless',
};

/** Domäne der Entität (der Teil vor dem Punkt) */
const BY_DOMAIN: Record<string, string> = {
  light: 'lightbulb-outline',
  switch: 'power-plug-outline',
  climate: 'thermostat',
  water_heater: 'thermostat',
  vacuum: 'robot-vacuum',
  camera: 'cctv',
  media_player: 'speaker-wireless',
  lock: 'lock-outline',
  cover: 'window-closed-variant',
  fan: 'fan',
  humidifier: 'water-outline',
  weather: 'weather-pouring',
  calendar: 'calendar-outline',
  person: 'map-marker-outline',
  device_tracker: 'map-marker-outline',
  alarm_control_panel: 'alarm-light-outline',
  lawn_mower: 'robot-mower-outline',
  sun: 'white-balance-sunny',
  todo: 'format-list-checks',
  update: 'update',
};

/** Hinweise im Entitätsnamen oder in der Kennung (kleingeschrieben, ä → ae usw. wie in Kennungen üblich) */
const BY_NAME: [RegExp, string][] = [
  [/waschmaschine|washing[\s_-]?machine|washer/, 'washing-machine'],
  [/trockner|dryer/, 'tumble-dryer'],
  [/sp(ue|ü)lmaschine|geschirrsp(ue|ü)ler|dishwasher/, 'dishwasher'],
  [/gefrier|tiefk(ue|ü)hl|freezer/, 'fridge-industrial-outline'],
  [/k(ue|ü)hlschrank|fridge|refrigerator/, 'fridge-outline'],
  [/briefkasten|mailbox|letterbox/, 'mailbox-outline'],
  [/m(ue|ü)ll|trash|rubbish|garbage|waste/, 'trash-can-outline'],
  [/backofen|herd\b|oven|stove|cooker/, 'stove'],
  [/kaffee|coffee|espresso/, 'coffee-outline'],
  [/\bpool\b|schwimmbad/, 'pool'],
  [/rasen|lawn|m(ae|ä)h/, 'grass'],
  [/pflanze|plant|blume|flower/, 'leaf'],
  [/heizung|heizk(oe|ö)rper|heating|radiator/, 'radiator'],
  [/t(ue|ü)r(?!m)|door/, 'door'],
  [/fenster|window/, 'window-closed-variant'],
  [/garage/, 'garage-open'],
  [/saugroboter|staubsauger|vacuum|roborock|roomba/, 'robot-vacuum'],
  [/rauchmelder|smoke/, 'smoke-detector-outline'],
];

/** Alle Namen, die diese Datei vergeben kann (Prüfung in der Oberfläche: gibt es in der Bibliothek) */
export const WATCHER_ICON_IDS: readonly string[] = [...new Set([...Object.values(BY_DEVICE_CLASS), ...Object.values(BY_DOMAIN), ...BY_NAME.map((n) => n[1])])];

/** Das Symbol für eine beobachtete Entität; null, wenn nichts passt (dann gilt das Standardsymbol) */
export function watcherIcon(input: { entityId: string; deviceClass?: unknown; icon?: unknown; name?: unknown }): string | null {
  const hay = `${input.entityId.split('.')[1] ?? ''} ${typeof input.name === 'string' ? input.name : ''}`.toLowerCase();
  for (const [re, id] of BY_NAME) if (re.test(hay)) return id;
  if (typeof input.icon === 'string') {
    const id = input.icon.replace(/^mdi:/, '');
    if (WATCHER_ICON_IDS.includes(id)) return id;
  }
  if (typeof input.deviceClass === 'string' && BY_DEVICE_CLASS[input.deviceClass]) return BY_DEVICE_CLASS[input.deviceClass]!;
  return BY_DOMAIN[input.entityId.split('.')[0] ?? ''] ?? null;
}
