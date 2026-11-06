import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Läuft nur im Projekt „waechter" (nachgebautes Home Assistant). Nach dem Speichern fragt die App, ob die Karte jetzt entstehen soll,
// wenn die Bedingung schon erfüllt ist und der Wächter nicht von selbst auslöst (Zustand, Vorgang). Pegel (Batterie) lösen selbst aus.
const MOCK = 'http://127.0.0.1:18411';
test.describe.configure({ timeout: 90_000, mode: 'serial' });

const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });

async function setup(request: APIRequestContext) {
  const tag = Date.now().toString(36);
  const board = (await (await request.post('/api/boards', { data: { name: `Nachfrage ${tag}` } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const columnId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  return { tag, boardId: board.id, columnId };
}

const setState = (request: APIRequestContext, entityId: string, state: string, attributes: Record<string, unknown>) =>
  request.post(`${MOCK}/mock/state`, { data: { entityId, state, attributes } });

const cardsOf = async (request: APIRequestContext, boardId: string) =>
  ((await (await request.get(`/api/boards/${boardId}`)).json()) as { cards: { title: string }[] }).cards;

/** Assistent bis zum Speichern: Entität wählen, Bedingung, Titel, Board; Wer und Feinschliff bleiben, wie sie vorgeschlagen sind */
async function createWatcher(page: Page, s: { boardId: string }, o: { search: string; entity: RegExp; state?: string; threshold?: string; wait?: string; title: string }) {
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), s.boardId);
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await page.getByRole('button', { name: 'Neuer Wächter', exact: true }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Entität wählen' }).click();
  await d.getByLabel('Entität suchen').fill(o.search);
  await d.getByRole('button', { name: o.entity }).first().click();
  if (o.state !== undefined) {
    await d.getByRole('radiogroup', { name: 'Bedingung' }).getByRole('radio', { name: 'Zustand' }).click();
    await d.getByLabel('Zielzustand').fill(o.state);
  } else {
    await d.getByLabel('Schwellwert').fill(o.threshold ?? '20');
  }
  if (o.wait) await d.getByRole('group', { name: 'Wartezeit in Minuten' }).getByRole('button', { name: o.wait }).click();
  await d.getByRole('button', { name: 'Weiter: Dann' }).click();
  await d.getByLabel('Titel der Karte').fill(o.title);
  await d.getByLabel('Board', { exact: true }).selectOption(s.boardId);
  await d.getByRole('button', { name: 'Weiter: Wer' }).click();
  await d.getByRole('button', { name: 'Weiter: Feinschliff' }).click();
  await d.getByRole('button', { name: 'Wächter anlegen' }).click();
  await expect(page.getByText('Wächter gespeichert')).toBeVisible();
}

const door = async (request: APIRequestContext, tag: string, state = 'off') => {
  await setState(request, `binary_sensor.nachfrage_${tag}`, state, { friendly_name: `Nachfrage Tür ${tag}` });
};

test('Zustand schon erreicht: Frage mit Gerät, Zustand und Kartentitel; „Nein“ legt keine Karte an', async ({ page, request }) => {
  const s = await setup(request);
  await door(request, s.tag);
  const title = `Tür schließen ${s.tag}`;
  await createWatcher(page, s, { search: `nachfrage tür ${s.tag}`, entity: /Nachfrage Tür/, state: 'off', title });

  const ask = page.getByRole('alertdialog');
  await expect(ask).toBeVisible();
  await expect(ask).toContainText(`Nachfrage Tür ${s.tag} ist gerade aus – die Bedingung ist also schon erfüllt. Soll jetzt eine Karte „${title}“ erstellt werden?`);
  await expect(ask.getByRole('button', { name: 'Ja, Karte erstellen' })).toBeVisible();
  await ask.getByRole('button', { name: 'Nein, erst beim nächsten Mal' }).click();
  await expect(ask).toHaveCount(0);
  expect(await cardsOf(request, s.boardId)).toHaveLength(0);
});

test('„Ja, Karte erstellen“ legt die Karte an (mit Hinweis im Lauf), und das nur einmal', async ({ page, request }) => {
  const s = await setup(request);
  await door(request, s.tag);
  const title = `Tür schließen ${s.tag}`;
  await createWatcher(page, s, { search: `nachfrage tür ${s.tag}`, entity: /Nachfrage Tür/, state: 'off', title });

  const ask = page.getByRole('alertdialog');
  await ask.getByRole('button', { name: 'Ja, Karte erstellen' }).click();
  await expect(ask).toHaveCount(0);
  await expect(page.getByText('Karte angelegt', { exact: true })).toBeVisible();
  await expect.poll(async () => (await cardsOf(request, s.boardId)).map((c) => c.title)).toEqual([`${title}: Nachfrage Tür ${s.tag}`]);

  const watcher = ((await (await request.get('/api/watchers')).json()) as { items: { id: string; card: { title: string } }[] }).items.find((w) => w.card.title === title)!;
  const runs = (await (await request.get(`/api/watchers/${watcher.id}/runs`)).json()) as { result: string; note: string | null }[];
  expect(runs[0]).toMatchObject({ result: 'created', note: 'beim Anlegen, auf Nachfrage' });
  // ein zweites „Ja“ (etwa aus einem alten Dialog) gibt es nicht: eine offene Karte genügt
  expect((await request.post(`/api/watchers/${watcher.id}/fire-now`)).status()).toBe(409);
  expect(await cardsOf(request, s.boardId)).toHaveLength(1);
});

test('Escape heißt „Nein“', async ({ page, request }) => {
  const s = await setup(request);
  await door(request, s.tag);
  await createWatcher(page, s, { search: `nachfrage tür ${s.tag}`, entity: /Nachfrage Tür/, state: 'off', title: `Tür schließen ${s.tag}` });
  const ask = page.getByRole('alertdialog');
  await expect(ask).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  expect(await cardsOf(request, s.boardId)).toHaveLength(0);
});

test('Zustand noch nicht erreicht: keine Frage', async ({ page, request }) => {
  const s = await setup(request);
  await door(request, s.tag, 'on');
  await createWatcher(page, s, { search: `nachfrage tür ${s.tag}`, entity: /Nachfrage Tür/, state: 'off', title: `Tür schließen ${s.tag}` });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await cardsOf(request, s.boardId)).toHaveLength(0);
});

test('Vorgang (Leistung) unter der Schwelle: auch hier die Frage, mit dem Wert und der Einheit', async ({ page, request }) => {
  const s = await setup(request);
  await setState(request, `sensor.nachfrage_leistung_${s.tag}`, '2.4', { friendly_name: `Nachfrage Trockner ${s.tag}`, unit_of_measurement: 'W', device_class: 'power' });
  await createWatcher(page, s, { search: `nachfrage trockner ${s.tag}`, entity: /Nachfrage Trockner/, threshold: '5', title: `Trockner leeren ${s.tag}` });
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText(`Nachfrage Trockner ${s.tag} ist gerade 2,4 W`);
  await ask.getByRole('button', { name: 'Nein, erst beim nächsten Mal' }).click();
  expect(await cardsOf(request, s.boardId)).toHaveLength(0);
});

test('Pegel (Batterie) unter der Grenze: keine Frage, die Karte kommt sofort', async ({ page, request }) => {
  const s = await setup(request);
  await setState(request, `sensor.nachfrage_batterie_${s.tag}`, '4', { friendly_name: `Nachfrage Knopf ${s.tag}`, unit_of_measurement: '%', device_class: 'battery' });
  const title = `Batterie wechseln ${s.tag}`;
  await createWatcher(page, s, { search: `nachfrage knopf ${s.tag}`, entity: /Nachfrage Knopf/, threshold: '20', wait: 'sofort', title });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect.poll(async () => (await cardsOf(request, s.boardId)).map((c) => c.title)).toEqual([`${title}: Nachfrage Knopf ${s.tag}`]);
});
