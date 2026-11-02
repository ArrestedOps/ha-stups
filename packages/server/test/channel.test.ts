import { describe, expect, it } from 'vitest';
import { channelFromEnv, channelNames, withChannel } from '../src/channel.js';
import type { PushGateway, PushMessage } from '../src/push.js';

function recorder() {
  const sent: { userId: string; message: PushMessage }[] = [];
  const cleared: { userId: string; tag: string }[] = [];
  const gateway: PushGateway = {
    canReach: (userId) => userId === 'a',
    send: async (userId, message) => {
      sent.push({ userId, message });
      return true;
    },
    clear: async (userId, tag) => void cleared.push({ userId, tag }),
  };
  return { gateway, sent, cleared };
}

describe('Kanal', () => {
  it('stable ist die Vorgabe; nur „beta" schaltet die Beta ein', () => {
    expect(channelFromEnv({})).toBe('stable');
    expect(channelFromEnv({ STUPS_CHANNEL: '' })).toBe('stable');
    expect(channelFromEnv({ STUPS_CHANNEL: 'Beta ' })).toBe('beta');
    expect(channelFromEnv({ STUPS_CHANNEL: 'beta' })).toBe('beta');
    expect(channelFromEnv({ STUPS_CHANNEL: 'irgendwas' })).toBe('stable');
  });

  it('die normale App behält ihre Namen', () => {
    expect(channelNames('stable')).toEqual({
      channel: 'stable',
      titlePrefix: '',
      tagPrefix: '',
      group: 'stups',
      actionPrefix: '',
      sensorPrefix: 'sensor.stups_',
      sensorLabel: 'Stups',
      eventType: 'stups_create_card',
    });
  });

  it('die Beta hat für alles eigene Namen, die sich nie mit der normalen App überschneiden', () => {
    const b = channelNames('beta');
    const s = channelNames('stable');
    expect(b).toEqual({
      channel: 'beta',
      titlePrefix: 'Beta · ',
      tagPrefix: 'beta-',
      group: 'stups-beta',
      actionPrefix: 'BETA_',
      sensorPrefix: 'sensor.stups_beta_',
      sensorLabel: 'Stups Beta',
      eventType: 'stups_beta_create_card',
    });
    expect(b.group).not.toBe(s.group);
    expect(b.eventType).not.toBe(s.eventType);
    expect(b.sensorPrefix).not.toBe(s.sensorPrefix);
    expect(b.tagPrefix).not.toBe(s.tagPrefix);
    expect(b.actionPrefix).not.toBe(s.actionPrefix);
  });
});

describe('Push-Nachrichten mit Kanal', () => {
  it('in der normalen App bleibt alles unverändert (dasselbe Objekt)', () => {
    const { gateway } = recorder();
    expect(withChannel(gateway, channelNames('stable'))).toBe(gateway);
  });

  it('in der Beta tragen Titel, Tag und Gruppe den Kanal; Knöpfe und Link bleiben', async () => {
    const { gateway, sent, cleared } = recorder();
    const g = withChannel(gateway, channelNames('beta'));
    const message: PushMessage = {
      title: 'Bad putzen',
      body: 'Fällig',
      tag: 'stups-card-1',
      group: 'stups',
      open: { cardId: '1' },
      level: 'time-sensitive',
      actions: [{ id: 'BETA_KANBAN_DONE:1:x', title: 'Erledigt' }],
    };
    expect(await g.send('a', message)).toBe(true);
    expect(sent[0]!.message).toEqual({ ...message, title: 'Beta · Bad putzen', tag: 'beta-stups-card-1', group: 'stups-beta' });
    expect(message.title).toBe('Bad putzen'); // das Original bleibt unverändert

    await g.clear('a', 'stups-card-1');
    expect(cleared).toEqual([{ userId: 'a', tag: 'beta-stups-card-1' }]);
  });

  it('ohne Gruppe bleibt keine Gruppe; erreichbar ist, wer beim Weg dahinter erreichbar ist', async () => {
    const { gateway, sent } = recorder();
    const g = withChannel(gateway, channelNames('beta'));
    await g.send('a', { title: 'T', body: 'B', tag: 't' });
    expect(sent[0]!.message.group).toBeUndefined();
    expect(g.canReach('a')).toBe(true);
    expect(g.canReach('b')).toBe(false);
  });
});
