import { dayKeyOf } from './calendar';
import { deviceTz } from './datetime';

/** Name des Sensors „heute fällig" (gleich wie in packages/server/src/channel.ts: die Beta hat eigene Namen) */
export const todaySensor = (channel: 'stable' | 'beta' | undefined): string => (channel === 'beta' ? 'sensor.stups_beta_heute_faellig' : 'sensor.stups_heute_faellig');

/** Was die Vorschau des Knopfs zeigt: offene Aufgaben, die heute fällig oder überfällig sind (wie die Sensoren, für alle Personen) */
export function bubbleCounts(cards: { dueAt: string | null; completedAt: string | null }[], nowMs: number, tz = deviceTz()): { today: number; overdue: number } {
  const key = dayKeyOf(nowMs, tz);
  let today = 0;
  let overdue = 0;
  for (const c of cards) {
    if (c.completedAt || !c.dueAt) continue;
    const due = Date.parse(c.dueAt);
    if (due < nowMs) overdue += 1;
    else if (dayKeyOf(due, tz) === key) today += 1;
  }
  return { today, overdue };
}

/** Die YAML-Konfiguration der Bubble Card: Knopf „Stups" mit Zähler „heute fällig", ein Tipp öffnet Stups */
export function bubbleYaml(opts: { panelPath: string | null | undefined; channel?: 'stable' | 'beta' }): string {
  return `type: custom:bubble-card
card_type: button
button_type: name
name: Stups
icon: mdi:view-column
sub_button:
  - entity: ${todaySensor(opts.channel)}
    show_state: true
tap_action:
  action: navigate
  navigation_path: ${opts.panelPath ?? '/<panel-pfad>'}`;
}
