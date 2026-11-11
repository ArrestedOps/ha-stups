import type { TriggerKind } from '../watcher-types.js';
import type { Seen } from './types.js';

export function toSeen(s: { state?: unknown; last_changed?: unknown; attributes?: Record<string, any> } | null | undefined): Seen | null {
  if (!s || typeof s.state !== 'string') return null;
  const name = s.attributes?.friendly_name;
  const unit = s.attributes?.unit_of_measurement;
  const deviceClass = s.attributes?.device_class;
  const icon = s.attributes?.icon;
  return {
    state: s.state,
    lastChanged: typeof s.last_changed === 'string' ? s.last_changed : null,
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof unit === 'string' ? { unit } : {}),
    ...(typeof deviceClass === 'string' ? { deviceClass } : {}),
    ...(typeof icon === 'string' ? { icon } : {}),
  };
}

/** Der neue Zustand aus einem Ereignis des Abos */
export const stateOfEvent = (ev: Record<string, any>): Seen | null => toSeen(ev.variables?.trigger?.to_state);

/** Seit wann gilt die Bedingung? Beim Zustandswechsel genau seit dem Wechsel, sonst ab jetzt */
export function metSinceOf(kind: TriggerKind, s: Seen, nowMs: number): string {
  const changed = s.lastChanged ? Date.parse(s.lastChanged) : NaN;
  return new Date(kind === 'state' && Number.isFinite(changed) ? Math.min(changed, nowMs) : nowMs).toISOString();
}
