import { channelNames, type ChannelNames } from './channel.js';
import type { Options } from './config.js';
import { dayDiff } from './time.js';
import type { OpenDueCard, Store } from './store.js';

export interface SensorHa {
  setState(entityId: string, state: string, attributes: Record<string, unknown>): Promise<void>;
}

export interface SensorDeps {
  store: Store;
  ha: SensorHa;
  options: Pick<Options, 'users'>;
  now: () => Date;
  timeZone: () => string;
  debounceMs?: number;
  log?: { warn: (msg: string) => void };
  /** Namen der Sensoren: normale App oder Beta (Vorgabe: normale App) */
  names?: Pick<ChannelNames, 'sensorPrefix' | 'sensorLabel'>;
}

/**
 * Kürzel je Person für die Sensornamen. Namen ohne lateinische Buchstaben (Лена, 李雷) ergeben kein Kürzel, und gleiche Kürzel
 * (René, Rene) würden sich einen Sensor teilen: dann hängt die Kennung der Person an, damit jede ihren eigenen und stabilen Sensor hat.
 */
export function personSlugs(people: { id: string; name: string }[]): Map<string, string> {
  const base = new Map(people.map((p) => [p.id, slugify(p.name)]));
  const count = new Map<string, number>();
  for (const s of base.values()) count.set(s, (count.get(s) ?? 0) + 1);
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const p of people) {
    const slug = base.get(p.id)!;
    const short = p.id.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 6);
    let name = slug === '' ? `person_${short}` : (count.get(slug) ?? 0) > 1 && used.has(slug) ? `${slug}_${short}` : slug;
    while (used.has(name)) name = `${name}_x`;
    used.add(name);
    out.set(p.id, name);
  }
  return out;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function createSensors(deps: SensorDeps) {
  const { store, ha } = deps;
  const { sensorPrefix, sensorLabel } = deps.names ?? channelNames('stable');
  const warn = deps.log?.warn ?? (() => undefined);
  let timer: NodeJS.Timeout | undefined;

  const task = (c: OpenDueCard) => ({ title: c.title, due: new Date(c.dueAt).toISOString(), board: c.boardName });

  async function publish(): Promise<void> {
    const nowMs = deps.now().getTime();
    const tz = deps.timeZone();
    // Sensoren in Home Assistant liest jeder dort: nur Karten aus Boards, die alle sehen (nie aus privaten oder ausgewählten)
    const cards = store.openDueCards({ publicOnly: true });
    const overdue = (list: OpenDueCard[]) => list.filter((c) => Date.parse(c.dueAt) < nowMs);
    const today = (list: OpenDueCard[]) =>
      list.filter((c) => Date.parse(c.dueAt) >= nowMs && dayDiff(Date.parse(c.dueAt), nowMs, tz) === 0);

    const writes: Promise<void>[] = [];
    const put = (entity: string, name: string, icon: string, list: OpenDueCard[]) =>
      writes.push(
        ha.setState(`${sensorPrefix}${entity}`, String(list.length), {
          friendly_name: name,
          unit_of_measurement: 'Aufgaben',
          icon,
          tasks: list.map(task),
        }),
      );

    put('ueberfaellig', `${sensorLabel} überfällig`, 'mdi:alert-circle-outline', overdue(cards));
    put('heute_faellig', `${sensorLabel} heute fällig`, 'mdi:calendar-today', today(cards));
    const people = store.people();
    const slugs = personSlugs(people);
    for (const person of people) {
      const slug = slugs.get(person.id)!;
      const mine = cards.filter((c) => c.assigneeIds.includes(person.id));
      put(`ueberfaellig_${slug}`, `${sensorLabel} überfällig (${person.name})`, 'mdi:alert-circle-outline', overdue(mine));
      put(`heute_faellig_${slug}`, `${sensorLabel} heute fällig (${person.name})`, 'mdi:calendar-today', today(mine));
    }
    // Offene Stupse: gesamt und je Person (die Namen der Sensoren beginnen wie die übrigen mit stups)
    const nudges = store.openNudgeCounts({ publicOnly: true });
    const list = store.openNudgeList({ publicOnly: true });
    writes.push(
      ha.setState(`${sensorPrefix}stupse_offen`, String(nudges.total), {
        friendly_name: `${sensorLabel} offene Stupse`,
        unit_of_measurement: 'Stupse',
        icon: 'mdi:hand-wave-outline',
      }),
    );
    // Offene Karten, die ein Wächter angelegt hat
    writes.push(
      ha.setState(`${sensorPrefix}waechter_offen`, String(store.openWatcherCardCount({ publicOnly: true })), {
        friendly_name: `${sensorLabel} offene Wächter-Karten`,
        unit_of_measurement: 'Karten',
        icon: 'mdi:eye-outline',
      }),
    );
    for (const person of people) {
      writes.push(
        ha.setState(`${sensorPrefix}gestupst_${slugs.get(person.id)!}`, String(nudges.byUser[person.id] ?? 0), {
          friendly_name: `${sensorLabel} gestupst (${person.name})`,
          unit_of_measurement: 'Stupse',
          icon: 'mdi:hand-wave-outline',
          nudges: list.filter((n) => n.toId === person.id).map(({ card, from, since }) => ({ card, from, since })),
        }),
      );
    }
    const results = await Promise.allSettled(writes);
    for (const r of results) if (r.status === 'rejected') warn(`Sensor konnte nicht aktualisiert werden: ${String(r.reason)}`);
  }

  /** Bündelt viele Änderungen in kurzer Zeit zu einer Veröffentlichung. */
  function publishSoon(): void {
    clearTimeout(timer);
    timer = setTimeout(() => void publish(), deps.debounceMs ?? 5000);
    timer.unref();
  }

  return { publish, publishSoon };
}

export type Sensors = ReturnType<typeof createSensors>;
