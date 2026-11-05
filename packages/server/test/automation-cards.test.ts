import { beforeEach, describe, expect, it } from 'vitest';
import { createAutomationCards, EVENT_TYPE } from '../src/automation-cards.js';
import { openDb } from '../src/db.js';
import { createStore, type Card, type Store } from '../src/store.js';
import { FakeHa } from './helpers/fake-ha.js';

let store: Store;
let ha: FakeHa;
let present: string[];
let assigned: { card: Card; ids: string[] }[];
let anna: string;
let ben: string;
let boardId: string;
let openId: string;
const t0 = Date.parse('2026-11-04T10:00:00Z');

function engine() {
  const auto = createAutomationCards({
    store,
    ha,
    now: () => new Date(t0),
    presentPersonIds: async () => present,
    onAssigned: (card, ids) => assigned.push({ card, ids }),
  });
  auto.start();
  return auto;
}

beforeEach(() => {
  store = createStore(openDb(':memory:'), { now: () => new Date(t0) });
  ha = new FakeHa();
  present = [];
  assigned = [];
  anna = store.addPerson({ haUserId: 'u-anna', name: 'Anna' }).id;
  ben = store.addPerson({ haUserId: 'u-ben', name: 'Ben' }).id;
  boardId = store.createBoard({ name: 'Haushalt', withPlanned: true }).id;
  openId = store.getBoardView(boardId).columns.find((c) => !c.isDone && !c.isPlanned)!.id;
});

const cards = () => store.getBoardView(boardId).cards;

describe('Ereignis stups_create_card', () => {
  it('abonniert das Ereignis bei Home Assistant', () => {
    engine();
    expect(ha.subs.get(EVENT_TYPE)!.payload).toEqual({ type: 'subscribe_events', event_type: EVENT_TYPE });
  });

  it('Beta: hört nur auf stups_beta_create_card und nicht auf das Ereignis der normalen App', () => {
    const betaHa = new FakeHa();
    createAutomationCards({
      store,
      ha: betaHa,
      now: () => new Date(t0),
      presentPersonIds: async () => [],
      eventType: 'stups_beta_create_card',
    }).start();
    expect(betaHa.subs.has('stups_beta_create_card')).toBe(true);
    expect(betaHa.subs.has(EVENT_TYPE)).toBe(false);
    expect(betaHa.subs.get('stups_beta_create_card')!.payload).toEqual({ type: 'subscribe_events', event_type: 'stups_beta_create_card' });
  });

  it('legt eine Karte an: Board und Spalte über den Namen, Personen über den Namen, Fälligkeit in Minuten', async () => {
    const auto = engine();
    await auto.handle({ board: 'haushalt', column: 'Offen', title: 'Müll rausbringen', description: 'Gelber Sack', assignees: ['anna', 'Ben'], due_in_minutes: 45 });
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toMatchObject({ title: 'Müll rausbringen', columnId: openId, assigneeIds: [anna, ben], dueAt: '2026-11-04T10:45:00.000Z', createdBy: null });
    expect(store.getCard(cards()[0]!.id).description).toBe('Gelber Sack');
    expect(assigned[0]!.ids).toEqual([anna, ben]);
    expect(auto.log()[0]).toMatchObject({ result: 'created', title: 'Müll rausbringen' });
  });

  it('ohne Board und Spalte: erstes Board, erste offene Spalte; ohne Personen unzugewiesen', async () => {
    const auto = engine();
    await auto.handle({ title: 'Einfach so' });
    expect(cards()[0]).toMatchObject({ columnId: openId, assigneeIds: [], dueAt: null });
    expect(assigned).toEqual([]);
  });

  it('assignees „present": wer zu Hause ist; Mischung mit Namen, Unbekannte werden gemeldet, nicht angelegt', async () => {
    present = [ben];
    const auto = engine();
    await auto.handle({ title: 'Tür prüfen', assignees: 'present' });
    expect(cards()[0]!.assigneeIds).toEqual([ben]);
    await auto.handle({ title: 'Zwei', assignees: ['present', 'anna', 'Niemand'] });
    expect(cards()[1]!.assigneeIds).toEqual([ben, anna]);
    expect(auto.log()[0]!.note).toMatch(/Unbekannte Personen übersprungen: Niemand/);
  });

  it('dedupe_key: zwei gleichzeitige Ereignisse (mit asynchroner Zuweisung) legen nur eine Karte an', async () => {
    present = [anna];
    const auto = engine();
    await Promise.all([
      auto.handle({ title: 'Filter', dedupe_key: 'filter-luft', assignees: 'present' }),
      auto.handle({ title: 'Filter', dedupe_key: 'filter-luft', assignees: 'present' }),
      auto.handle({ title: 'Filter', dedupe_key: 'filter-luft', assignees: 'present' }),
    ]);
    expect(cards().filter((c) => c.title === 'Filter')).toHaveLength(1);
    expect(auto.log().filter((l) => l.result === 'duplicate')).toHaveLength(2);
  });

  it('dedupe_key: solange die Karte offen ist, entsteht keine zweite; nach dem Erledigen wieder', async () => {
    const auto = engine();
    await auto.handle({ title: 'Filter', dedupe_key: 'filter-luft' });
    await auto.handle({ title: 'Filter', dedupe_key: 'filter-luft' });
    expect(cards()).toHaveLength(1);
    expect(auto.log()[0]).toMatchObject({ result: 'duplicate' });
    store.completeCard(cards()[0]!.id, { by: anna, source: 'app' });
    await auto.handle({ title: 'Filter', dedupe_key: 'filter-luft' });
    expect(cards()).toHaveLength(2);
  });

  it('Fehler gehen ins Protokoll, nichts stürzt ab', async () => {
    const auto = engine();
    await auto.handle({});
    await auto.handle({ title: 'x', board: 'Gibt es nicht' });
    await auto.handle({ title: 'x', column: 'Gibt es nicht' });
    expect(cards()).toHaveLength(0);
    expect(auto.log().map((e) => e.note)).toEqual(['Spalte „Gibt es nicht" gibt es nicht', 'Board „Gibt es nicht" gibt es nicht', 'title fehlt']);
  });

  it('das Ereignis von Home Assistant kommt über das Abo an (Felder unter data)', async () => {
    const auto = engine();
    ha.subs.get(EVENT_TYPE)!.onEvent({ event_type: EVENT_TYPE, data: { title: 'Aus der Automation' } });
    await new Promise((r) => setTimeout(r, 10));
    expect(cards().map((c) => c.title)).toEqual(['Aus der Automation']);
    expect(auto.log()).toHaveLength(1);
  });

  it('das Protokoll behält die letzten 20', async () => {
    const auto = engine();
    for (let i = 0; i < 25; i += 1) await auto.handle({ title: `Karte ${i}`, dedupe_key: 'k' });
    expect(auto.log()).toHaveLength(20);
  });
});
