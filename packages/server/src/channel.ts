import type { PushGateway } from './push.js';

/**
 * Die normale App und die Beta laufen nebeneinander in demselben Home Assistant, auf denselben Handys und (nach dem Umzug)
 * mit denselben Karten. Damit sie sich nicht in die Quere kommen, hat die Beta für alles, was nach außen sichtbar ist,
 * eigene Namen: Push-Titel, Tags und Gruppen, Knöpfe in Nachrichten, Sensoren und das Ereignis für Automationen.
 */
export type Channel = 'stable' | 'beta';

export interface ChannelNames {
  channel: Channel;
  /** steht vor jedem Push-Titel */
  titlePrefix: string;
  /** steht vor jedem Tag (Nachrichten ersetzen und entfernen sich über das Tag) */
  tagPrefix: string;
  group: string;
  /** steht vor der Kennung jedes Knopfs in Nachrichten */
  actionPrefix: string;
  sensorPrefix: string;
  /** Anfang der Anzeigenamen der Sensoren */
  sensorLabel: string;
  /** Ereignis in Home Assistant, mit dem eine Automation eine Karte anlegt */
  eventType: string;
}

/** Das Image bringt den Kanal mit (STUPS_CHANNEL); er ist keine Option, die jemand ändert. Alles außer „beta" ist die normale App. */
export function channelFromEnv(env: Record<string, string | undefined>): Channel {
  return env.STUPS_CHANNEL?.trim().toLowerCase() === 'beta' ? 'beta' : 'stable';
}

export function channelNames(channel: Channel): ChannelNames {
  if (channel === 'beta') {
    return {
      channel,
      titlePrefix: 'Beta · ',
      tagPrefix: 'beta-',
      group: 'stups-beta',
      actionPrefix: 'BETA_',
      sensorPrefix: 'sensor.stups_beta_',
      sensorLabel: 'Stups Beta',
      eventType: 'stups_beta_create_card',
    };
  }
  return {
    channel,
    titlePrefix: '',
    tagPrefix: '',
    group: 'stups',
    actionPrefix: '',
    sensorPrefix: 'sensor.stups_',
    sensorLabel: 'Stups',
    eventType: 'stups_create_card',
  };
}

/**
 * Setzt in der Beta Titel, Tag und Gruppe jeder Nachricht auf die Namen der Beta. Die Kennungen der Knöpfe bekommen ihr
 * Präfix schon im Notifier (der sie auch wieder entgegennimmt). In der normalen App bleibt alles, wie es ist.
 */
export function withChannel(push: PushGateway, names: ChannelNames): PushGateway {
  if (names.channel === 'stable') return push;
  return {
    canReach: (userId, kind) => push.canReach(userId, kind),
    send: (userId, message) =>
      push.send(userId, {
        ...message,
        title: `${names.titlePrefix}${message.title}`,
        tag: `${names.tagPrefix}${message.tag}`,
        ...(message.group !== undefined ? { group: names.group } : {}),
      }),
    clear: (userId, tag) => push.clear(userId, `${names.tagPrefix}${tag}`),
  };
}
