import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore, type Store } from '../src/store.js';

const as = (id: string, name = id) => ({
  'x-remote-user-id': id,
  'x-remote-user-name': name,
  'x-remote-user-display-name': name,
});
const chef = as('ha-chef', 'Chef'); // Administrator in Home Assistant, noch keine Person
const anna = as('ha-anna', 'Anna'); // Person, kein Administrator
const fremd = as('ha-fremd', 'Fremd'); // kein Eintrag

let app: FastifyInstance;
let store: Store;
let db: ReturnType<typeof openDb>;

async function build(opts: { directory?: boolean; people?: boolean } = {}): Promise<void> {
  db = openDb(':memory:');
  store = createStore(db, { now: () => new Date('2026-10-30T10:00:00Z') });
  if (opts.people) store.addPerson({ haUserId: 'ha-anna', name: 'Anna' });
  app = Fastify();
  await app.register(ingressAuth, { enforceIp: false });
  await app.register(apiRoutes, {
    store,
    ...(opts.directory === false ? {} : { directory: { isAdmin: async (id: string) => id === 'ha-chef', persons: async () => [] } }),
  });
}

async function call(who: object, method: 'GET' | 'PUT' | 'DELETE', url: string, payload?: object) {
  const res = await app.inject({ method, url, headers: who as Record<string, string>, payload });
  return { status: res.statusCode, body: res.body ? (res.json() as any) : null };
}
const me = async (who: object) => (await call(who, 'GET', '/api/me')).body;

function addCard(): void {
  const board = store.createBoard({ name: 'Haushalt' });
  const columnId = store.getBoardView(board.id).columns[0]!.id;
  store.createCard(board.id, { columnId, title: 'Müll raus' }, store.resolveUser({ haId: 'ha-chef', name: 'Chef', displayName: 'Chef' }).id);
}
function addWatcher(): void {
  db.exec(`insert into watchers (id, name, trigger_json, card_json, assign_json, created_at, updated_at)
           values ('w1', 'Waschmaschine', '{}', '{}', '{}', '2026-10-30T10:00:00Z', '2026-10-30T10:00:00Z')`);
}

describe('needsOnboarding: wer die Einrichtung sieht', () => {
  beforeEach(() => build({ people: true }));

  it('Administrator einer neuen Installation (nur das Standard-Board, keine anderen Personen): ja, ohne Status und Fortschritt', async () => {
    await build();
    store.ensureDefaultBoard();
    expect(await me(chef)).toMatchObject({ needsOnboarding: true, onboarding: null, onboardingProgress: null });
  });

  it('Administrator: nein, sobald es Karten gibt', async () => {
    await build();
    addCard();
    expect((await me(chef)).needsOnboarding).toBe(false);
  });

  it('Administrator: nein, sobald es einen Wächter gibt', async () => {
    await build();
    addWatcher();
    expect((await me(chef)).needsOnboarding).toBe(false);
  });

  it('Administrator: nein, wenn schon andere Personen da sind (Bestandsinstallation)', async () => {
    expect((await me(chef)).needsOnboarding).toBe(false);
  });

  it('Administrator, der selbst die einzige Person ist: ja', async () => {
    await build();
    const p = store.addPerson({ haUserId: 'ha-chef', name: 'Chef' });
    expect(store.needsOnboarding(p.id, { isAdmin: true })).toBe(true);
    expect((await me(chef)).needsOnboarding).toBe(true);
  });

  it('nach „fertig" und „übersprungen": nein, auch wenn die Installation noch leer ist', async () => {
    await build();
    const p = store.addPerson({ haUserId: 'ha-chef', name: 'Chef' });
    store.setOnboardingStatus(p.id, 'skipped');
    expect(store.needsOnboarding(p.id, { isAdmin: true })).toBe(false);
    store.setOnboardingStatus(p.id, 'done');
    expect(store.needsOnboarding(p.id, { isAdmin: true })).toBe(false);
  });

  it('Abbruch und Wiederaufnahme: mit gespeichertem Fortschritt bleibt es offen, auch wenn die Einrichtung schon Personen und Wächter angelegt hat', async () => {
    await build();
    const chefP = store.addPerson({ haUserId: 'ha-chef', name: 'Chef' });
    store.setOnboardingProgress(chefP.id, { step: 'watcher', selection: { people: ['a', 'b'] } });
    store.addPerson({ haUserId: 'ha-ben', name: 'Ben' });
    addWatcher();
    expect(store.needsOnboarding(chefP.id, { isAdmin: true })).toBe(true);
    expect(store.onboardingOf(chefP.id)).toEqual({ status: null, progress: { step: 'watcher', selection: { people: ['a', 'b'] } } });
  });

  it('Mitglied: ja beim ersten Start (Kurzfassung), danach nein; die Installation muss dafür nicht neu sein', async () => {
    addCard();
    expect(await me(anna)).toMatchObject({ isAdmin: false, needsOnboarding: true });
    await call(anna, 'PUT', '/api/me/onboarding', { status: 'done' });
    expect((await me(anna)).needsOnboarding).toBe(false);
  });

  it('wer keine Person ist und nicht verwaltet (Fremder): nein', async () => {
    expect(await me(fremd)).toMatchObject({ isAdmin: false, needsOnboarding: false });
  });

  it('kein Zugriff („nur freigegebene"): nein', async () => {
    store.setAccessMode('selected');
    expect(await me(fremd)).toMatchObject({ allowed: false, needsOnboarding: false });
  });

  it('Container ohne Home Assistant (kein Verzeichnis): der Erste auf einer leeren Installation sieht es', async () => {
    await build({ directory: false });
    expect(await me(chef)).toMatchObject({ isAdmin: true, needsOnboarding: true });
  });
});

describe('PUT/DELETE /api/me/onboarding', () => {
  beforeEach(() => build({ people: true }));

  it('setzt Status und löscht den Fortschritt', async () => {
    await call(anna, 'PUT', '/api/me/onboarding/progress', { step: 'test' });
    expect((await me(anna)).onboardingProgress).toEqual({ step: 'test' });
    const res = await call(anna, 'PUT', '/api/me/onboarding', { status: 'skipped' });
    expect(res.status).toBe(204);
    expect(await me(anna)).toMatchObject({ onboarding: 'skipped', onboardingProgress: null, needsOnboarding: false });
  });

  it('lehnt andere Werte ab', async () => {
    for (const status of ['finished', null, '', 1]) {
      expect((await call(anna, 'PUT', '/api/me/onboarding', { status } as object)).status).toBe(400);
    }
    expect((await me(anna)).onboarding).toBeNull();
  });

  it('jede Person ändert nur den eigenen Status', async () => {
    store.setOnboardingStatus(store.people()[0]!.id, 'done');
    await call(chef, 'PUT', '/api/me/onboarding', { status: 'done' });
    // Anna ist unverändert (war schon „done"), und umgekehrt
    await call(anna, 'DELETE', '/api/me/onboarding');
    expect((await me(chef)).onboarding).toBe('done');
    expect((await me(anna)).onboarding).toBeNull();
  });

  it('DELETE („nochmal durchgehen") öffnet die Einrichtung wieder, auch in einer Bestandsinstallation', async () => {
    addCard();
    await call(chef, 'PUT', '/api/me/onboarding', { status: 'done' });
    expect((await me(chef)).needsOnboarding).toBe(false);
    const res = await call(chef, 'DELETE', '/api/me/onboarding');
    expect(res.status).toBe(204);
    expect(await me(chef)).toMatchObject({ onboarding: null, onboardingProgress: { step: 'welcome' }, needsOnboarding: true });
  });

  it('Fortschritt: Schritt und Auswahl werden gespeichert und geprüft', async () => {
    const ok = await call(anna, 'PUT', '/api/me/onboarding/progress', { step: 'people', selection: { ids: ['x'] } });
    expect(ok.status).toBe(204);
    expect((await me(anna)).onboardingProgress).toEqual({ step: 'people', selection: { ids: ['x'] } });
    for (const bad of [{}, { step: '' }, { step: 'Drei Schritte' }, { step: 'x'.repeat(40) }, { step: 'people', selection: 'ja' }, { step: 'people', selection: [1] }, { step: 'people', selection: { big: 'x'.repeat(5000) } }]) {
      expect((await call(anna, 'PUT', '/api/me/onboarding/progress', bad as object)).status).toBe(400);
    }
    expect((await me(anna)).onboardingProgress).toEqual({ step: 'people', selection: { ids: ['x'] } });
  });

  it('ein Kind darf seinen eigenen Status setzen', async () => {
    store.setChild(store.people()[0]!.id, { isChild: true } as never);
    expect((await call(anna, 'PUT', '/api/me/onboarding', { status: 'done' })).status).toBe(204);
  });
});
