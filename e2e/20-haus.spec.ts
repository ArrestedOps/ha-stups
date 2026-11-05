import { expect, test, type APIRequestContext } from '@playwright/test';
import { openBoards } from './helpers';

// Haus-Kanäle (Ansage, Lampe) mit dem nachgebauten Home Assistant (Projekt „waechter", Server mit e2e/mock-ha.mjs).
// Keine Abhängigkeit von der Tageszeit: Die Ruhezeit der Testpersonen ist aus, sonst hielte der Server Stupse nachts zurück.
const MOCK = 'http://127.0.0.1:18411';
test.describe.configure({ timeout: 90_000, mode: 'serial' });

const connyHeaders = {
  'x-remote-user-id': 'ha-conny-e2e',
  'x-remote-user-name': 'conny',
  'x-remote-user-display-name': 'Conny',
};

interface Call {
  domain: string;
  service: string;
  data: Record<string, any>;
}
interface Person {
  id: string;
  name: string;
  displayName: string;
}

const calls = async (request: APIRequestContext) => (await (await request.get(`${MOCK}/mock/calls`)).json()) as Call[];
const speaks = async (request: APIRequestContext) => (await calls(request)).filter((c) => c.domain === 'tts' && c.service === 'speak');
const setHome = (request: APIRequestContext, state: 'home' | 'not_home') => request.post(`${MOCK}/mock/state`, { data: { entityId: 'person.conny', state } });
const entity = async (request: APIRequestContext, id: string) => (await (await request.get(`${MOCK}/mock/entity/${id}`)).json()) as { state: string } | null;

let boardId = '';
let openId = '';
let conny: Person;
let rene: Person;
let counter = 0;

const people = async (request: APIRequestContext) => (await (await request.get('/api/people')).json()) as Person[];

async function card(request: APIRequestContext, base: string): Promise<{ id: string; title: string }> {
  const title = `${base} ${Date.now().toString(36)}${counter++}`;
  const res = await request.post(`/api/boards/${boardId}/cards`, { data: { title, columnId: openId } });
  return { ...(await res.json()), title };
}

/** Jemand ohne Push-Gerät und ohne Person in Home Assistant, dazu ohne Ruhezeit */
async function guest(request: APIRequestContext): Promise<Person> {
  const name = `Gast${Date.now().toString(36)}${counter++}`;
  const person = (await (await request.post('/api/access/people', { data: { name } })).json()) as Person;
  await request.patch(`/api/access/people/${person.id}`, { data: { quietOff: true } });
  return person;
}

const channel = async (request: APIRequestContext, userId: string, data: Record<string, unknown>) => {
  const res = await request.post('/api/house/channels', { data: { userId, ...data } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string };
};

const nudge = async (request: APIRequestContext, cardId: string, to: string) => {
  const res = await request.post(`/api/cards/${cardId}/nudge`, { data: { to: [to], template: 'think' } });
  expect(res.status(), await res.text()).toBe(201);
};

const statusOf = async (request: APIRequestContext, channelId: string) =>
  ((await (await request.get('/api/house/channels')).json()) as { channels: { id: string; status: { result: string } | null }[] }).channels.find((c) => c.id === channelId)?.status?.result ?? null;

test.beforeAll(async ({ request }) => {
  const all = await people(request);
  rene = all.find((p) => p.name === 'Rene')!;
  conny = all.find((p) => p.name === 'Conny')!;
  for (const p of [rene, conny]) {
    await request.patch(`/api/access/people/${p.id}`, { data: { notifyServices: [`mobile_app_${p.name.toLowerCase()}_e2e`], quietOff: true } });
  }
  const board = (await (await request.post('/api/boards', { data: { name: `Haus ${Date.now().toString(36)}` } })).json()) as { id: string };
  boardId = board.id;
  const view = (await (await request.get(`/api/boards/${boardId}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  openId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
});

test.afterEach(async ({ request }) => {
  const { channels } = (await (await request.get('/api/house/channels')).json()) as { channels: { id: string }[] };
  for (const c of channels) await request.delete(`/api/house/channels/${c.id}`);
  for (const p of await people(request)) if (p.name.startsWith('Gast')) await request.delete(`/api/access/people/${p.id}`);
  await setHome(request, 'home');
  await request.post(`${MOCK}/mock/calls/clear`);
});

test('Einrichten in den Einstellungen: Sprachdienst wählen, Ansage-Kanal anlegen, testen', async ({ page, request }) => {
  // Sprachdienst: Home Assistant › Ansage und Lampe
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ansage und Lampe' }).click();
  const tts = page.getByLabel('Sprachdienst für Ansagen');
  await tts.selectOption('tts.piper');
  await expect(tts).toHaveValue('tts.piper');
  await page.getByRole('button', { name: 'Zurück zu den Einstellungen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Personen und Zugriff/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Zugriff' })).toBeVisible();

  await page.getByRole('dialog').getByRole('button', { name: /Conny.*Push-Gerät/ }).click();
  const house = page.getByTestId(`house-${conny.id}`);
  await house.getByRole('button', { name: 'Kanal hinzufügen' }).click();
  await house.getByLabel('Typ des Kanals').selectOption('speak');
  await house.getByLabel('Entität des Kanals').selectOption('media_player.kinderzimmer');
  await house.getByRole('button', { name: 'Hinzufügen' }).click();
  const ch = house.locator('[data-testid^=house-channel-]');
  await expect(ch).toContainText('Ansage: Kinderzimmer');
  // Vorgaben: nur Stupse, abwesend verwerfen
  await expect(ch.getByLabel('Stupse im Kanal Kinderzimmer')).toBeChecked();
  await expect(ch.getByLabel('Fälligkeiten im Kanal Kinderzimmer')).not.toBeChecked();
  await expect(ch.getByLabel('Wenn nicht zu Hause, Kanal Kinderzimmer')).toHaveValue('skip');

  await ch.getByRole('button', { name: 'Kanal Kinderzimmer testen' }).click();
  await expect(page.getByText('Test gesendet')).toBeVisible();
  const spoken = (await speaks(request)).at(-1)!;
  expect(spoken.data).toMatchObject({ entity_id: 'tts.piper', media_player_entity_id: 'media_player.kinderzimmer', message: 'Das ist ein Test von Stups.', language: 'de' });
  await expect(ch.locator('[data-testid^=house-status-]')).toContainText('Zugestellt');
});

test('Ein Stups an jemanden ohne Handy kommt als Ansage an, mit Lautstärke und Rückstellung', async ({ request }) => {
  const g = await guest(request);
  await request.put('/api/house/settings', { data: { tts: 'tts.piper' } });
  await channel(request, g.id, { type: 'speak', entityId: 'media_player.kinderzimmer', volume: 50 });
  const c = await card(request, 'Müll rausbringen');
  await nudge(request, c.id, g.id);

  await expect.poll(async () => (await speaks(request)).length, { timeout: 15_000 }).toBe(1);
  const message = (await speaks(request))[0]!.data.message as string;
  expect(message).toBe(`${g.displayName}, Rene stupst dich: ${c.title}. Denkst du dran?`);
  const volumes = (await calls(request)).filter((x) => x.service === 'volume_set').map((x) => x.data.volume_level);
  expect(volumes).toEqual([0.5]); // erst gesetzt …
  await expect.poll(async () => (await calls(request)).filter((x) => x.service === 'volume_set').map((x) => x.data.volume_level), { timeout: 20_000 }).toEqual([0.5, 0.3]); // … dann zurück
});

test('Lampe: leuchtet in der Akzentfarbe und ist danach wieder aus', async ({ request }) => {
  const g = await guest(request);
  await channel(request, g.id, { type: 'light', entityId: 'light.flur' });
  const c = await card(request, 'Fenster schließen');
  await nudge(request, c.id, g.id);

  await expect.poll(async () => (await calls(request)).some((x) => x.domain === 'light' && x.service === 'turn_on'), { timeout: 15_000 }).toBe(true);
  const all = await calls(request);
  expect(all.map((x) => `${x.domain}.${x.service}`).slice(0, 2)).toEqual(['scene.create', 'light.turn_on']);
  const on = all.find((x) => x.service === 'turn_on')!.data;
  expect(on).toMatchObject({ entity_id: 'light.flur', brightness_pct: 100 });
  expect(on.rgb_color).toHaveLength(3);
  expect((await entity(request, 'light.flur'))?.state).toBe('on');

  // nach 5 Sekunden zurück: Szene abspielen und löschen, die Lampe ist wieder aus
  await expect.poll(async () => (await calls(request)).some((x) => x.domain === 'scene' && x.service === 'delete'), { timeout: 15_000 }).toBe(true);
  expect((await entity(request, 'light.flur'))?.state).toBe('off');
});

test('Nicht zu Hause: verwerfen oder warten, bis die Person heimkommt', async ({ request }) => {
  await request.put('/api/house/settings', { data: { tts: 'tts.piper' } });
  const ch = await channel(request, conny.id, { type: 'speak', entityId: 'media_player.kinderzimmer', whenAway: 'skip' });
  await setHome(request, 'not_home');

  await nudge(request, (await card(request, 'Verworfen')).id, conny.id);
  await expect.poll(() => statusOf(request, ch.id), { timeout: 15_000 }).toBe('skipped_away');
  expect(await speaks(request)).toEqual([]);

  // „warten": der Stups bleibt in der Warteschlange, bis Conny nach Hause kommt
  await request.patch(`/api/house/channels/${ch.id}`, { data: { whenAway: 'wait', waitMinutes: 30 } });
  const c = await card(request, 'Wartet');
  await nudge(request, c.id, conny.id);
  await expect.poll(() => statusOf(request, ch.id), { timeout: 15_000 }).toBe('queued');
  expect(await speaks(request)).toEqual([]);

  await setHome(request, 'home');
  await expect.poll(async () => (await speaks(request)).length, { timeout: 20_000 }).toBe(1);
  expect((await speaks(request))[0]!.data.message).toContain(`stupst dich: ${c.title}`);
});

test('Ein Mitglied sieht den Haus-Block nicht und darf die Schnittstelle nicht benutzen', async ({ browser, baseURL, request }) => {
  const ctx = await browser.newContext({ baseURL: String(baseURL), extraHTTPHeaders: connyHeaders });
  try {
    expect((await ctx.request.get('/api/house/channels')).status()).toBe(403);
    expect((await ctx.request.post('/api/house/channels', { data: { userId: conny.id, type: 'speak', entityId: 'media_player.kinderzimmer' } })).status()).toBe(403);
    const page = await ctx.newPage();
    await page.goto('/');
    await openBoards(page);
    await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
    const settings = page.getByRole('dialog');
    await expect(settings.getByRole('button', { name: 'Sprache und Farbe' })).toBeVisible();
    await expect(settings.getByRole('button', { name: /Personen und Zugriff/ })).toHaveCount(0);
    await expect(settings.getByRole('button', { name: 'Ansage und Lampe' })).toHaveCount(0);
    await expect(page.locator('[data-testid^=house-]')).toHaveCount(0);
  } finally {
    await ctx.close();
  }
  expect((await request.get('/api/house/channels')).status()).toBe(200); // der Administrator darf
});
