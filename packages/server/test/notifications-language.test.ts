import { beforeEach, describe, expect, it } from 'vitest';
import { parseOptions } from '../src/config.js';
import { openDb } from '../src/db.js';
import { createNotifier, pushLanguage } from '../src/notifications.js';
import { createHaNotifyPush } from '../src/push.js';
import { createStore, type Store } from '../src/store.js';

const TZ = 'Europe/Berlin';
interface Call {
  service: string;
  data: any;
}

let now: Date;
let store: Store;
let calls: Call[];
let rene: { id: string };
let conny: { id: string };
let boardId: string;
let openCol: string;

const notifier = () =>
  createNotifier({
    store,
    push: createHaNotifyPush({
      ha: { callService: async (_d: string, service: string, data: Record<string, unknown>) => void calls.push({ service, data }) },
      servicesFor: (userId) => store.userById(userId)?.notifyServices ?? [],
      panelPath: () => '/',
    }),
    options: parseOptions({ daily_summary_time: '23:59', overdue_nag_time: '18:00' }),
    now: () => now,
    timeZone: () => TZ,
  });

beforeEach(() => {
  now = new Date('2026-11-01T07:00:00Z'); // Sa 08:00 Berlin
  store = createStore(openDb(':memory:'), { now: () => now, timeZone: () => TZ });
  store.syncPeople([
    { name: 'Rene', notify: ['svc_rene'] },
    { name: 'Conny', notify: ['svc_conny'] },
  ]);
  rene = store.resolveUser({ haId: 'ha-rene', name: 'rene', displayName: 'René' });
  conny = store.resolveUser({ haId: 'ha-conny', name: 'conny', displayName: 'Conny' });
  const b = store.createBoard({ name: 'Haushalt' });
  boardId = b.id;
  openCol = store.getBoardView(b.id).columns[0]!.id;
  calls = [];
});

const to = (name: string) => calls.filter((c) => c.service === `svc_${name}`);

describe('Sprache je Empfänger', () => {
  it('ohne gemeldete Sprache gilt Deutsch (nach dem Update ändert sich für niemanden etwas)', () => {
    expect(pushLanguage(store, rene.id)).toBe('de');
    store.setLanguage(rene.id, { choice: 'auto', effective: 'en' });
    expect(pushLanguage(store, rene.id)).toBe('en');
  });

  it('dieselbe fällige Karte: ein englischer und ein deutscher Empfänger bekommen je ihre Sprache', async () => {
    store.setLanguage(rene.id, { choice: 'en', effective: 'en' });
    store.createCard(boardId, { columnId: openCol, title: 'Bad putzen', dueAt: '2026-11-01T07:00:00Z', assigneeIds: [rene.id, conny.id] }, rene.id);
    await notifier().tick();

    expect(to('rene')[0]!.data.message).toBe('Due: today 08:00 · Haushalt');
    expect(to('rene')[0]!.data.data.actions[0].title).toBe('Done');
    expect(to('conny')[0]!.data.message).toBe('Fällig: heute 08:00 · Haushalt');
    expect(to('conny')[0]!.data.data.actions[0].title).toBe('Erledigt');
  });

  it('Vorab-Erinnerung und Nachhaken in der Sprache des Empfängers', async () => {
    store.setLanguage(rene.id, { choice: 'en', effective: 'en' });
    store.createCard(boardId, { columnId: openCol, title: 'A', dueAt: '2026-11-01T07:30:00Z', remindBeforeMin: 60, assigneeIds: [rene.id] }, rene.id);
    await notifier().tick();
    expect(to('rene')[0]!.data.message).toBe('Due in 1 h: today 08:30 · Haushalt');
  });

  it('Stups mit Vorlage: Text in der Sprache des Empfängers, eigener Text unverändert', async () => {
    store.setLanguage(conny.id, { choice: 'en', effective: 'en' });
    const c = store.createCard(boardId, { columnId: openCol, title: 'Müll', assigneeIds: [rene.id, conny.id] }, rene.id);
    store.createNudges(c.id, rene.id, { to: [conny.id], template: 'think' });
    await notifier().tick();
    expect(to('conny')[0]!.data.title).toBe('Rene nudges you');
    expect(to('conny')[0]!.data.message).toBe('Müll · Are you on it?');
    expect(to('conny')[0]!.data.data.actions.map((a: any) => a.title)).toEqual(['Done', 'On it', 'Later']);

    calls = [];
    const d = store.createCard(boardId, { columnId: openCol, title: 'Wäsche', assigneeIds: [rene.id, conny.id] }, rene.id);
    store.createNudges(d.id, rene.id, { to: [conny.id], text: 'Bitte heute noch' });
    await notifier().tick();
    expect(to('conny')[0]!.data.message).toBe('Wäsche · Bitte heute noch');
  });

  it('Tageszusammenfassung in der Sprache der Person', async () => {
    store.setLanguage(rene.id, { choice: 'en', effective: 'en' });
    store.createCard(boardId, { columnId: openCol, title: 'A', dueAt: '2026-11-01T06:00:00Z', assigneeIds: [rene.id, conny.id] }, rene.id);
    const n = createNotifier({
      store,
      push: createHaNotifyPush({
        ha: { callService: async (_d: string, service: string, data: Record<string, unknown>) => void calls.push({ service, data }) },
        servicesFor: (userId) => store.userById(userId)?.notifyServices ?? [],
        panelPath: () => '/',
      }),
      options: parseOptions({ daily_summary_time: '08:00', overdue_nag_time: '23:00' }),
      now: () => now,
      timeZone: () => TZ,
    });
    await n.tick();
    const summary = (name: string) => to(name).find((c) => c.data.title === 'Stups')!.data.message as string;
    expect(summary('rene')).toMatch(/^Due today: 0 · Overdue: 1/);
    expect(summary('conny')).toMatch(/^Heute fällig: 0 · Überfällig: 1/);
  });
});
