import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Betriebsart 2: eigener Container mit Verbindung zu Home Assistant (e2e/server-standalone-ha.mjs, nachgebautes Home Assistant
// auf PORT+1 mit Long-Lived-Token), Anmeldung mit eigenem Konto. Die Tests bauen aufeinander auf.
test.describe.configure({ mode: 'serial', timeout: 60_000 });

const CODE_FILE = join(tmpdir(), 'stups-e2e-standalone-ha-code.txt');
const MOCK = 'http://127.0.0.1:18441';
const APP = 'http://localhost:18440'; // STUPS_PUBLIC_URL des Testservers
const PW = 'ein-langes-passwort';
const API = { 'x-stups-client': 'e2e' };
const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });

const setState = (request: APIRequestContext, entityId: string, state: string) => request.post(`${MOCK}/mock/state`, { data: { entityId, state } });

async function einstellungen(page: Page) {
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  return page.getByRole('dialog');
}

async function anmelden(page: Page) {
  await page.goto('/');
  await page.getByLabel('Benutzername').fill('anna');
  await page.getByLabel('Passwort', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(nav(page)).toBeVisible();
}

interface Person {
  id: string;
  name: string;
  notifyServices: string[];
}
const people = async (page: Page) => (await (await page.request.get('/api/people')).json()) as Person[];

async function board(page: Page) {
  const boards = (await (await page.request.get('/api/boards')).json()) as { id: string }[];
  const view = (await (await page.request.get(`/api/boards/${boards[0]!.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  return { boardId: boards[0]!.id, columnId: view.columns.find((c) => !c.isDone && !c.isPlanned)!.id };
}

const cardsOf = async (page: Page, boardId: string) =>
  ((await (await page.request.get(`/api/boards/${boardId}`)).json()) as { cards: { id: string; title: string; assigneeIds: string[]; dueAt: string | null; watcherId: string | null }[] }).cards;

test('Erster Start mit Home Assistant: Einrichtung, dann Wächter-Reiter und Verbindung stehen, nichts aus der Add-on-Welt', async ({ page, request }) => {
  await page.goto('/');
  const form = page.getByRole('form', { name: 'Einrichtung' });
  await form.getByLabel('Einrichtungscode').fill(readFileSync(CODE_FILE, 'utf8').trim());
  await form.getByLabel('Benutzername').fill('anna');
  await form.getByLabel('Name in Stups').fill('Anna');
  await form.getByLabel('Passwort', { exact: true }).fill(PW);
  await form.getByLabel('Passwort wiederholen').fill(PW);
  await form.getByRole('button', { name: 'Einrichten' }).click();
  await expect(nav(page)).toBeVisible();

  // Was die Oberfläche anbietet, sagt der Server
  expect(await (await request.get('/api/capabilities')).json()).toMatchObject({
    mode: 'standalone-ha',
    auth: 'session',
    ha: true,
    watchers: true,
    sensors: true,
    push: ['ha-notify'],
  });
  await expect(nav(page).getByRole('button')).toHaveCount(3);
  await expect(nav(page).getByRole('button', { name: 'Wächter' })).toBeVisible();

  const dialog = await einstellungen(page);
  await expect(dialog.getByRole('button', { name: 'Benachrichtigungen' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Wächter' })).toBeVisible();
  // Stups sitzt hier nicht in Home Assistant: kein Dashboard-Button, keine Kopfzeile, kein Umzug zwischen Apps
  for (const weg of ['Zurück zum Dashboard', 'Darstellung', 'Bubble Card', 'Umzug', 'Diagnose-Seite']) {
    await expect(dialog.getByText(weg, { exact: false })).toHaveCount(0);
  }

  // Der Long-Lived-Token wurde vom nachgebauten Home Assistant angenommen (REST und WebSocket)
  expect(await (await request.get(`${MOCK}/mock/wrong-tokens`)).json()).toEqual({ count: 0 });
});

test('Personen aus Home Assistant werden vorgeschlagen; Ben kommt dazu und wählt sein Handy', async ({ page }) => {
  await anmelden(page);
  const dialog = await einstellungen(page);
  await dialog.getByRole('button', { name: 'Personen und Kinder' }).click();

  const group = page.getByText('Aus Home Assistant', { exact: true });
  await expect(group).toBeVisible();
  // Anna gibt es schon (gleicher Name), Ben fehlt noch
  const row = page.locator('div', { has: page.getByText('Ben', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Hinzufügen' }) }).last();
  await row.getByRole('button', { name: 'Hinzufügen' }).click();
  await expect(page.getByRole('button', { name: /Ben.*Ohne Anmeldung/ })).toBeVisible();
  await expect(group).toHaveCount(0); // niemand mehr übrig

  // Handys der Companion App stehen zur Wahl (Home Assistant liefert sie)
  await page.getByRole('button', { name: /Ben.*Ohne Anmeldung/ }).click();
  await page.getByLabel('ben_e2e').check();
  await expect.poll(async () => (await people(page)).find((p) => p.name === 'Ben')?.notifyServices).toEqual(['mobile_app_ben_e2e']);
});

test('Wächter: „wer ist zu Hause" findet die Personen über ihren Namen, die Push-Nachricht öffnet Stups unter der eigenen Adresse', async ({ page, request }) => {
  await anmelden(page);
  const { boardId, columnId } = await board(page);
  const [anna, ben] = [(await people(page)).find((p) => p.name === 'Anna')!, (await people(page)).find((p) => p.name === 'Ben')!];
  await request.post(`${MOCK}/mock/pushes/clear`);
  const watcher = (name: string, entity: string, title: string) =>
    page.request.post('/api/watchers', {
      headers: API,
      data: {
        name,
        trigger: { entityId: entity, kind: 'state', to: 'docked', forMin: 0, count: 1 },
        card: { boardId, columnId, title, due: { kind: 'in', minutes: 30 } },
        assign: { mode: 'all_present', personIds: [], fallback: 'none', waitFallback: 'none' },
        cooldownMin: 0,
      },
    });

  // Nur Anna ist zu Hause (sie hat ein Konto, ihre Kennung ist lokal: gefunden wird sie über den Namen)
  await setState(request, 'person.anna', 'home');
  await setState(request, 'person.ben', 'not_home');
  await setState(request, 'vacuum.s7', 'cleaning');
  expect((await watcher('Saugroboter', 'vacuum.s7', 'Staubbehälter leeren')).status()).toBe(201);
  await setState(request, 'vacuum.s7', 'docked');
  await expect.poll(async () => (await cardsOf(page, boardId)).filter((c) => c.title === 'Staubbehälter leeren').length, { timeout: 15_000 }).toBe(1);
  expect((await cardsOf(page, boardId)).find((c) => c.title === 'Staubbehälter leeren')!.assigneeIds).toEqual([anna.id]);

  // Jetzt nur Ben: Er bekommt die Karte und die Nachricht auf sein Handy, mit Link in Stups
  await setState(request, 'person.anna', 'not_home');
  await setState(request, 'person.ben', 'home');
  await setState(request, 'vacuum.s8', 'cleaning');
  expect((await watcher('Zweiter Roboter', 'vacuum.s8', 'Filter wechseln')).status()).toBe(201);
  await setState(request, 'vacuum.s8', 'docked');
  await expect.poll(async () => (await cardsOf(page, boardId)).filter((c) => c.title === 'Filter wechseln').length, { timeout: 15_000 }).toBe(1);
  const card = (await cardsOf(page, boardId)).find((c) => c.title === 'Filter wechseln')!;
  expect(card.assigneeIds).toEqual([ben.id]);

  await expect
    .poll(async () => ((await (await request.get(`${MOCK}/mock/pushes`)).json()) as { service: string; title: string }[]).map((p) => p.service), { timeout: 10_000 })
    .toEqual(['mobile_app_ben_e2e']);
  const [push] = (await (await request.get(`${MOCK}/mock/pushes`)).json()) as { title: string; message: string; data: { url: string; actions: unknown[] } }[];
  expect(push).toMatchObject({ title: 'Filter wechseln', data: { url: `${APP}/?card=${card.id}` } });
  expect(push!.message).toMatch(/^Neue Karte für dich/);
  expect(push!.data.actions).toHaveLength(1);

  // Tippt Ben in der Companion App auf „Erledigt", kommt das Ereignis über die Verbindung zu Home Assistant zurück
  const action = (push!.data.actions as { action: string }[])[0]!.action;
  await request.post(`${MOCK}/mock/event`, { data: { type: 'mobile_app_notification_action', data: { action } } });
  await expect
    .poll(async () => ((await (await page.request.get(`/api/cards/${card.id}`)).json()) as { completedAt: string | null }).completedAt, { timeout: 10_000 })
    .not.toBeNull();
});

test('Wächter zeigt beide Wächter, die Verwaltung steht in den Einstellungen', async ({ page }) => {
  await anmelden(page);
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await expect(page.getByTestId('home')).toContainText('Saugroboter');
  await expect(page.getByTestId('home')).toContainText('Zweiter Roboter');
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Wächter', exact: true }).click();
  await expect(page.getByTestId('watcher-card').filter({ hasText: 'Saugroboter' })).toBeVisible();
  await expect(page.getByTestId('watcher-card').filter({ hasText: 'Zweiter Roboter' })).toBeVisible();
  await expect(page.getByTestId('watcher-activity')).toContainText('Karte angelegt');
});

test('Sensoren: die Zähler stehen in Home Assistant (Zustände über den Token geschrieben)', async ({ request }) => {
  await expect
    .poll(async () => ((await (await request.get(`${MOCK}/mock/published`)).json()) as { entityId: string }[]).map((s) => s.entityId), { timeout: 15_000 })
    .toEqual(expect.arrayContaining(['sensor.stups_waechter_offen', 'sensor.stups_stupse_offen']));
  expect(await (await request.get(`${MOCK}/mock/wrong-tokens`)).json()).toEqual({ count: 0 });
});

// ---------- Passkeys ----------
// WebKit unter Linux hat keinen virtuellen Authenticator: hier prüfen wir nur, was die Oberfläche zeigt und wie sie
// auf ein abgelehntes Gerät reagiert. Den Ablauf mit Server und Signaturen prüfen die Server-Tests, den echten am Handy die Testliste.
test('Passkeys: Knopf auf der Anmeldeseite, Verwaltung in den Einstellungen, Abbrechen am Gerät ist kein Fehler', async ({ page, request }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'PublicKeyCredential', { value: class {}, configurable: true, writable: true });
    const abort = () => Promise.reject(new DOMException('abgebrochen', 'NotAllowedError'));
    Object.defineProperty(navigator, 'credentials', { value: { get: abort, create: abort }, configurable: true });
  });
  expect((await (await request.get('/api/capabilities')).json()).passkeys).toBe(true);

  await page.goto('/');
  await expect(page.getByTestId('login')).toBeVisible();
  await page.getByTestId('passkey-login').click();
  // Der Server lädt die Bibliothek beim ersten Passkey-Aufruf; unter Last dauert das länger als die üblichen 5 Sekunden
  await expect(page.getByRole('alert')).toContainText('Abgebrochen', { timeout: 30_000 });
  await expect(nav(page)).toHaveCount(0); // nicht angemeldet

  await anmelden(page);
  const dialog = await einstellungen(page);
  await dialog.getByRole('button', { name: 'Konto und Anmeldung' }).click();
  await expect(dialog.getByText('Passkeys', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Noch kein Passkey')).toBeVisible();
  await dialog.getByRole('button', { name: 'Passkey hinzufügen' }).click();
  await page.getByLabel('Name des Passkeys').fill('iPhone von Anna');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByText('Abgebrochen oder vom Gerät abgelehnt')).toBeVisible();
  expect(await (await page.request.get('/api/passkeys')).json()).toEqual([]);
});
