import { describe, expect, it } from 'vitest';
import { createHaNotifyPush, type PushMessage } from '../src/push.js';

function setup(services: Record<string, string[]>, failing: string[] = []) {
  const calls: { domain: string; service: string; data: any }[] = [];
  const warns: string[] = [];
  const push = createHaNotifyPush({
    ha: {
      callService: async (domain, service, data) => {
        if (failing.includes(service)) throw new Error('nicht erreichbar');
        calls.push({ domain, service, data });
      },
    },
    servicesFor: (id) => services[id] ?? [],
    panelPath: () => '/dashboard/start',
    log: { warn: (m) => warns.push(m) },
  });
  return { push, calls, warns };
}

const message: PushMessage = {
  title: 'Bad putzen',
  body: 'Fällig: heute 10:00',
  tag: 'stups-card-1',
  group: 'stups',
  open: { cardId: 'c1' },
  level: 'time-sensitive',
  actions: [{ id: 'KANBAN_DONE:c1:2026-11-01T09:00:00.000Z', title: 'Erledigt' }],
};

describe('HaNotifyPush', () => {
  it('baut die Nachricht für die Companion App', async () => {
    const { push, calls } = setup({ u1: ['mobile_app_a', 'mobile_app_b'] });
    expect(await push.send('u1', message)).toBe(true);
    expect(calls.map((c) => c.service)).toEqual(['mobile_app_a', 'mobile_app_b']);
    expect(calls[0]).toEqual({
      domain: 'notify',
      service: 'mobile_app_a',
      data: {
        title: 'Bad putzen',
        message: 'Fällig: heute 10:00',
        data: {
          tag: 'stups-card-1',
          group: 'stups',
          url: '/dashboard/start?card=c1',
          push: { 'interruption-level': 'time-sensitive' },
          actions: [{ action: 'KANBAN_DONE:c1:2026-11-01T09:00:00.000Z', title: 'Erledigt' }],
        },
      },
    });
  });

  it('lässt weg, was nicht gesetzt ist: keine Adresse, keine Stufe, keine Knöpfe', async () => {
    const { push, calls } = setup({ u1: ['svc'] });
    await push.send('u1', { title: 'T', body: 'B', tag: 't' });
    expect(calls[0]!.data).toEqual({ title: 'T', message: 'B', data: { tag: 't' } });
  });

  it('öffnet ohne Aufgabe die Startseite', async () => {
    const { push, calls } = setup({ u1: ['svc'] });
    await push.send('u1', { title: 'T', body: 'B', tag: 't', open: {} });
    expect(calls[0]!.data.data.url).toBe('/dashboard/start');
  });

  it('im eigenen Container öffnet die Nachricht Stups unter dessen Adresse, nicht ein Panel in Home Assistant', async () => {
    const calls: any[] = [];
    const push = createHaNotifyPush({
      ha: { callService: async (_d, _s, data) => void calls.push(data) },
      servicesFor: () => ['svc'],
      panelPath: () => '/dashboard/start',
      publicUrl: 'https://stups.example.org',
    });
    await push.send('u1', message);
    await push.send('u1', { ...message, open: {} });
    await push.send('u1', { title: 'T', body: 'B', tag: 't' });
    expect(calls.map((c) => c.data.url)).toEqual(['https://stups.example.org/?card=c1', 'https://stups.example.org/', undefined]);
  });

  it('canReach: nur mit mindestens einem Gerät', () => {
    const { push } = setup({ u1: ['svc'], u2: [] });
    expect(push.canReach('u1')).toBe(true);
    expect(push.canReach('u2')).toBe(false);
    expect(push.canReach('unbekannt')).toBe(false);
  });

  it('send: ein Gerät genügt, Fehler der anderen werden gemeldet', async () => {
    const { push, warns } = setup({ u1: ['gut', 'kaputt'] }, ['kaputt']);
    expect(await push.send('u1', message)).toBe(true);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatch(/Push fehlgeschlagen.*nicht erreichbar/);
  });

  it('send: false, wenn alle scheitern oder es kein Gerät gibt', async () => {
    expect(await setup({ u1: ['kaputt'] }, ['kaputt']).push.send('u1', message)).toBe(false);
    expect(await setup({}).push.send('u1', message)).toBe(false);
  });

  it('clear: schickt clear_notification mit dem Tag an alle Geräte, ohne Meldung bei Fehlern', async () => {
    const { push, calls, warns } = setup({ u1: ['a', 'kaputt'] }, ['kaputt']);
    await push.clear('u1', 'stups-card-1');
    expect(calls).toEqual([{ domain: 'notify', service: 'a', data: { message: 'clear_notification', data: { tag: 'stups-card-1' } } }]);
    expect(warns).toEqual([]);
  });
});
