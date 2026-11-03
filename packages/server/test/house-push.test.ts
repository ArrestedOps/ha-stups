import { beforeEach, describe, expect, it } from 'vitest';
import { accentRgb } from '../src/accent.js';
import { createHousePush } from '../src/house.js';
import { HouseFailure } from '../src/house-drivers.js';
import { openDb } from '../src/db.js';
import type { HomeState } from '../src/presence.js';
import type { PushMessage } from '../src/push.js';
import { createStore, type Store } from '../src/store.js';

const TZ = 'Europe/Berlin';
const MIN = 60_000;

let now: Date;
let store: Store;
let ben: string;
let anna: string;
let home: Record<string, HomeState>;
let freshAsked: boolean[];
let speakCalls: { channel: any; text: string; opts: any }[];
let lightCalls: { channel: any; rgb: number[] }[];
let failing: HouseFailure | null;
let cardId: string;

const drivers = {
  speak: async (channel: any, text: string, opts: any) => {
    if (failing) throw failing;
    speakCalls.push({ channel, text, opts });
  },
  light: async (channel: any, rgb: number[]) => {
    if (failing) throw failing;
    lightCalls.push({ channel, rgb });
  },
};
const presence = {
  homeOf: async (userId: string, opts?: { fresh?: boolean }) => {
    freshAsked.push(opts?.fresh === true);
    return home[userId] ?? 'unknown';
  },
};

const house = () => createHousePush({ store, drivers, presence, now: () => now, timeZone: () => TZ });

const msg = (kind: PushMessage['kind'], extra: Partial<PushMessage> = {}): PushMessage => ({
  title: 'T',
  body: 'B',
  tag: 'x',
  kind,
  spoken: 'Ben, Anna stupst dich: Müll.',
  ...extra,
});

beforeEach(() => {
  now = new Date('2026-11-03T12:00:00Z'); // 13:00 Berlin, keine Ruhezeit
  store = createStore(openDb(':memory:'), { now: () => now, timeZone: () => TZ });
  ben = store.addPerson({ haUserId: 'ha-ben', name: 'Ben' }).id;
  anna = store.addPerson({ haUserId: 'ha-anna', name: 'Anna' }).id;
  const board = store.createBoard({ name: 'Haushalt' });
  const col = store.getBoardView(board.id).columns[0]!.id;
  cardId = store.createCard(board.id, { columnId: col, title: 'Müll', assigneeIds: [ben] }, anna).id;
  home = { [ben]: 'home', [anna]: 'home' };
  freshAsked = [];
  speakCalls = [];
  lightCalls = [];
  failing = null;
  store.setHouseTts('tts.piper');
});

const speakChannel = (over: Record<string, unknown> = {}) => store.addHouseChannel(ben, { type: 'speak', entityId: 'media_player.ben', ...over });
const lightChannel = (over: Record<string, unknown> = {}) => store.addHouseChannel(ben, { type: 'light', entityId: 'light.flur', ...over });

describe('Erreichbarkeit', () => {
  it('erreichbar mit der passenden Art; ohne Art (Zusammenfassung, Rückmeldung) nie', () => {
    const h = house();
    expect(h.canReach(ben, 'nudge')).toBe(false); // noch kein Kanal
    speakChannel({ kinds: ['nudge', 'watcher'] });
    expect(h.canReach(ben, 'nudge')).toBe(true);
    expect(h.canReach(ben, 'watcher')).toBe(true);
    expect(h.canReach(ben, 'due')).toBe(false);
    expect(h.canReach(ben)).toBe(false);
    expect(h.canReach(anna, 'nudge')).toBe(false);
  });

  it('ein ausgeschalteter Kanal und eine entfernte Person zählen nicht', () => {
    const c = speakChannel();
    store.updateHouseChannel(c.id, { enabled: false });
    expect(house().canReach(ben, 'nudge')).toBe(false);
    store.updateHouseChannel(c.id, { enabled: true });
    expect(house().canReach(ben, 'nudge')).toBe(true);
    store.removePerson(ben);
    expect(house().canReach(ben, 'nudge')).toBe(false);
  });

  it('ein Haus-Kanal für Stupse macht eine Person ohne Push-Gerät stupsbar', () => {
    const targets = () => store.nudgeTargets(cardId, anna).find((t) => t.id === ben)!;
    expect(targets()).toMatchObject({ selectable: false, reason: 'no_device' });
    store.addHouseChannel(ben, { type: 'light', entityId: 'light.flur', kinds: ['due'] });
    expect(targets().reason).toBe('no_device'); // nur Fälligkeiten: Stupse kommen nicht an
    store.addHouseChannel(ben, { type: 'speak', entityId: 'media_player.ben', kinds: ['nudge'] });
    expect(targets()).toMatchObject({ selectable: true, reason: null });
  });
});

describe('Zustellen', () => {
  it('Ansage: Sprachdienst, Lautsprecher, Satz und Sprache der Person (deutsch)', async () => {
    const c = speakChannel({ volume: 60 });
    expect(await house().send(ben, msg('nudge'))).toBe(true);
    expect(speakCalls).toEqual([
      { channel: { id: c.id, entityId: 'media_player.ben', volume: 60 }, text: 'Ben, Anna stupst dich: Müll.', opts: { tts: 'tts.piper', language: 'de' } },
    ]);
  });

  it('Ansage in der Sprache der Person (englisch)', async () => {
    store.setLanguage(ben, { choice: 'en', effective: 'en' });
    speakChannel();
    await house().send(ben, msg('nudge'));
    expect(speakCalls[0]!.opts.language).toBe('en');
  });

  it('Lampe: in der Akzentfarbe der Person, ohne Wahl Orange', async () => {
    const c = lightChannel();
    await house().send(ben, msg('nudge'));
    expect(lightCalls).toEqual([{ channel: { id: c.id, entityId: 'light.flur' }, rgb: accentRgb(null) }]);
    store.setAccentHue(ben, 200);
    await house().send(ben, msg('nudge'));
    expect(lightCalls[1]!.rgb).toEqual(accentRgb(200));
  });

  it('mehrere Kanäle: alle bekommen es', async () => {
    speakChannel();
    lightChannel();
    expect(await house().send(ben, msg('nudge'))).toBe(true);
    expect(speakCalls).toHaveLength(1);
    expect(lightCalls).toHaveLength(1);
  });

  it('die Art entscheidet je Kanal; ohne Art und ohne passenden Kanal wird nichts gesendet', async () => {
    speakChannel({ kinds: ['due'] });
    lightChannel({ kinds: ['nudge'] });
    expect(await house().send(ben, msg('nudge'))).toBe(true);
    expect(speakCalls).toHaveLength(0);
    expect(lightCalls).toHaveLength(1);
    expect(await house().send(ben, msg('watcher'))).toBe(false);
    expect(await house().send(ben, msg(undefined))).toBe(false);
    expect(speakCalls.length + lightCalls.length).toBe(1);
  });

  it('ein ausgeschalteter Kanal bleibt still', async () => {
    speakChannel({ enabled: false });
    expect(await house().send(ben, msg('nudge'))).toBe(false);
    expect(speakCalls).toEqual([]);
  });

  it('clear ist ohne Wirkung', async () => {
    await expect(house().clear(ben, 'tag')).resolves.toBeUndefined();
  });
});

describe('Ruhezeit', () => {
  beforeEach(() => {
    now = new Date('2026-11-03T22:30:00Z'); // 23:30 Berlin: in der Ruhezeit (22:00 bis 07:00)
  });

  it('Fälligkeit und Wächter-Karte werden in der Ruhezeit verworfen, nicht nachgeholt', async () => {
    speakChannel({ kinds: ['nudge', 'due', 'watcher'], whenAway: 'wait' });
    expect(await house().send(ben, msg('due'))).toBe(true); // bewusst verworfen: kein Fehler, kein Wiederholen
    expect(await house().send(ben, msg('watcher'))).toBe(true);
    expect(speakCalls).toEqual([]);
    expect(store.housePendingOf(ben)).toEqual([]);
  });

  it('ein Stups kommt hier an, er wurde schon bis zum Ende der Ruhezeit zurückgehalten', async () => {
    speakChannel();
    await house().send(ben, msg('nudge'));
    expect(speakCalls).toHaveLength(1);
  });

  it('die Ruhezeit der Person gilt, ist sie ausgeschaltet, wird auch nachts angesagt', async () => {
    speakChannel({ kinds: ['due'] });
    store.setNudgeQuiet(ben, { off: true });
    await house().send(ben, msg('due'));
    expect(speakCalls).toHaveLength(1);
  });

  it('zeigt das Ergebnis je Kanal an', async () => {
    const c = speakChannel({ kinds: ['due'] });
    const h = house();
    await h.send(ben, msg('due'));
    expect(h.status(c.id)).toMatchObject({ result: 'skipped_quiet', at: now.toISOString() });
  });
});

describe('Anwesenheit', () => {
  it('beim Senden wird die Anwesenheit frisch erfragt (wer gerade weggegangen ist, gilt nicht noch 15 Sekunden als zu Hause), einmal je Nachricht', async () => {
    speakChannel();
    lightChannel();
    freshAsked = [];
    await house().send(ben, msg('nudge'));
    expect(freshAsked).toEqual([true]);
  });

  it('nicht zu Hause und „verwerfen": nichts, aber kein Fehler (sonst würde der Notifier wiederholen)', async () => {
    const c = speakChannel();
    home[ben] = 'away';
    const h = house();
    expect(await h.send(ben, msg('nudge'))).toBe(true);
    expect(speakCalls).toEqual([]);
    expect(store.housePendingOf(ben)).toEqual([]);
    expect(h.status(c.id)?.result).toBe('skipped_away');
  });

  it('nicht zu Hause und „warten": in die Warteschlange mit der Frist des Kanals', async () => {
    const c = speakChannel({ whenAway: 'wait', waitMinutes: 90 });
    home[ben] = 'away';
    const h = house();
    expect(await h.send(ben, msg('nudge', { nudgeId: 'n1', open: { cardId } }))).toBe(true);
    expect(speakCalls).toEqual([]);
    expect(store.housePendingOf(ben)).toEqual([
      expect.objectContaining({ channelId: c.id, kind: 'nudge', spoken: 'Ben, Anna stupst dich: Müll.', cardId, nudgeId: 'n1', expiresAt: new Date(now.getTime() + 90 * MIN).toISOString() }),
    ]);
    expect(h.status(c.id)?.result).toBe('queued');
  });

  it('keine passende Person in Home Assistant (unknown) gilt als zu Hause', async () => {
    speakChannel({ whenAway: 'wait' });
    home = {};
    await house().send(ben, msg('nudge'));
    expect(speakCalls).toHaveLength(1);
    expect(store.housePendingOf(ben)).toEqual([]);
  });
});

describe('Warteschlange', () => {
  const queue = async (over: Record<string, unknown> = {}, message: PushMessage = msg('nudge', { open: { cardId } })) => {
    const c = speakChannel({ whenAway: 'wait', ...over });
    home[ben] = 'away';
    const h = house();
    await h.send(ben, message);
    return { c, h };
  };

  it('Heimkehr liefert aus (mit frischer Abfrage) und leert die Warteschlange', async () => {
    const { h } = await queue();
    home[ben] = 'home';
    freshAsked = [];
    await h.arrival(ben);
    expect(speakCalls).toHaveLength(1);
    expect(speakCalls[0]!.text).toBe('Ben, Anna stupst dich: Müll.');
    expect(store.housePendingOf(ben)).toEqual([]);
    expect(freshAsked).toContain(true);
  });

  it('der Takt liefert ebenfalls aus, sobald die Person zu Hause ist, vorher nicht', async () => {
    const { h } = await queue();
    await h.tick();
    expect(speakCalls).toEqual([]);
    expect(store.housePendingOf(ben)).toHaveLength(1);
    home[ben] = 'home';
    await h.tick();
    expect(speakCalls).toHaveLength(1);
    expect(store.housePendingOf(ben)).toEqual([]);
  });

  it('Home Assistant nicht erreichbar (unknown): weiter warten', async () => {
    const { h } = await queue();
    home[ben] = 'unknown';
    await h.tick();
    expect(speakCalls).toEqual([]);
    expect(store.housePendingOf(ben)).toHaveLength(1);
  });

  it('ist die Karte inzwischen erledigt, wird nichts mehr angesagt', async () => {
    const { h } = await queue({}, msg('due', { open: { cardId } }));
    store.completeCard(cardId, { by: ben, source: 'app' });
    home[ben] = 'home';
    await h.arrival(ben);
    expect(speakCalls).toEqual([]);
    expect(store.housePendingOf(ben)).toEqual([]);
  });

  it('ist der Stups inzwischen beantwortet, wird nichts mehr angesagt', async () => {
    store.setNotifyServices(ben, ['svc']); // ein Gerät, damit man ihn stupsen darf
    const created = store.createNudges(cardId, anna, { to: [ben], template: 'think' });
    const nudgeId = created.sent[0]!.nudgeId;
    const { h } = await queue({}, msg('nudge', { open: { cardId }, nudgeId }));
    store.replyNudge(nudgeId, ben, 'ack');
    home[ben] = 'home';
    await h.arrival(ben);
    expect(speakCalls).toEqual([]);
    expect(store.housePendingOf(ben)).toEqual([]);
  });

  it('abgelaufene Einträge werden gelöscht und nicht ausgeliefert', async () => {
    const { h } = await queue({ waitMinutes: 30 });
    now = new Date(now.getTime() + 31 * MIN);
    home[ben] = 'home';
    await h.tick();
    expect(speakCalls).toEqual([]);
    expect(store.housePendingAll()).toEqual([]);
  });

  it('in der Ruhezeit bei der Heimkehr: ein Stups wartet weiter, eine Fälligkeit wird verworfen', async () => {
    const c = speakChannel({ whenAway: 'wait', waitMinutes: 1200, kinds: ['nudge', 'due'] });
    home[ben] = 'away';
    const h = house();
    await h.send(ben, msg('nudge'));
    await h.send(ben, msg('due'));
    expect(store.housePendingOf(ben)).toHaveLength(2);

    now = new Date('2026-11-03T22:30:00Z'); // 23:30: Ruhezeit
    home[ben] = 'home';
    await h.arrival(ben);
    expect(speakCalls).toEqual([]);
    expect(store.housePendingOf(ben).map((p) => p.kind)).toEqual(['nudge']);

    now = new Date('2026-11-04T06:30:00Z'); // 07:30: Ruhezeit vorbei
    await h.tick();
    expect(speakCalls).toHaveLength(1);
    expect(store.housePendingOf(ben)).toEqual([]);
    expect(c.id).toBeTruthy();
  });

  it('ein Kanal, der inzwischen ausgeschaltet oder gelöscht ist, bekommt nichts mehr', async () => {
    const { c, h } = await queue();
    store.updateHouseChannel(c.id, { enabled: false });
    home[ben] = 'home';
    await h.arrival(ben);
    expect(speakCalls).toEqual([]);
    expect(store.housePendingOf(ben)).toEqual([]);
  });

  it('scheitert die Auslieferung, wird der Eintrag trotzdem entfernt (keine Endlosschleife)', async () => {
    const { h } = await queue();
    home[ben] = 'home';
    failing = new HouseFailure('ha_error', 'tts.speak: kaputt');
    await h.arrival(ben);
    expect(store.housePendingOf(ben)).toEqual([]);
  });
});

describe('Fehler', () => {
  it('scheitert der einzige Kanal, ist es „nicht zugestellt" und das Ergebnis zeigt den Fehler', async () => {
    const c = speakChannel();
    failing = new HouseFailure('ha_error', 'tts.speak: kaputt');
    const h = house();
    expect(await h.send(ben, msg('nudge'))).toBe(false);
    expect(h.status(c.id)).toMatchObject({ result: 'error', error: { code: 'ha_error', detail: 'tts.speak: kaputt' } });
  });

  it('ein fehlgeschlagener Kanal hält die anderen nicht auf', async () => {
    const bad = speakChannel();
    lightChannel();
    const flaky = { ...drivers, speak: async () => Promise.reject(new HouseFailure('no_tts')) };
    const h = createHousePush({ store, drivers: flaky, presence, now: () => now, timeZone: () => TZ });
    expect(await h.send(ben, msg('nudge'))).toBe(true);
    expect(lightCalls).toHaveLength(1);
    expect(h.status(bad.id)).toMatchObject({ result: 'error', error: { code: 'no_tts' } });
  });
});

describe('Test-Knopf', () => {
  it('spricht einen Testsatz in der Sprache der Person und ignoriert Art, Ruhezeit und Anwesenheit', async () => {
    now = new Date('2026-11-03T22:30:00Z'); // Ruhezeit
    home[ben] = 'away';
    const c = speakChannel({ kinds: [], whenAway: 'skip' });
    const h = house();
    const r = await h.test(c.id);
    expect(r).toMatchObject({ result: 'delivered' });
    expect(speakCalls).toHaveLength(1);
    expect(speakCalls[0]!.text).toBe('Das ist ein Test von Stups.');
    expect(h.status(c.id)?.result).toBe('delivered');
  });

  it('englisch', async () => {
    store.setLanguage(ben, { choice: 'en', effective: 'en' });
    const c = speakChannel();
    await house().test(c.id);
    expect(speakCalls[0]!.text).toBe('This is a test from Stups.');
  });

  it('die Lampe leuchtet', async () => {
    const c = lightChannel();
    expect(await house().test(c.id)).toMatchObject({ result: 'delivered' });
    expect(lightCalls).toHaveLength(1);
  });

  it('meldet den Fehler, statt zu werfen', async () => {
    const c = speakChannel();
    failing = new HouseFailure('no_tts');
    expect(await house().test(c.id)).toMatchObject({ result: 'error', error: { code: 'no_tts' } });
  });

  it('unbekannter Kanal: null', async () => {
    expect(await house().test('gibt-es-nicht')).toBeNull();
  });
});
