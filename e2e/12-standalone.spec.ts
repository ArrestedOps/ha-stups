import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Betriebsart 3: eigener Container ohne Home Assistant (e2e/server-standalone.mjs), Anmeldung mit eigenem Konto.
// Die Tests bauen aufeinander auf: erst die Einrichtung, dann Anmeldung, Benutzer, Mitglied.
test.describe.configure({ mode: 'serial' });

const CODE_FILE = join(tmpdir(), 'stups-e2e-standalone-code.txt');
const PW = 'ein-langes-passwort';
const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });

async function melden(page: Page, user: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Benutzername').fill(user);
  await page.getByLabel('Passwort', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
}

async function einstellungen(page: Page) {
  await openBoards(page);
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  return page.getByRole('dialog');
}

test('Erster Start: ohne Konto sperrt die API, die Einrichtung verlangt den Code aus dem Protokoll', async ({ page, request }) => {
  expect((await request.get('/api/boards')).status()).toBe(401);
  // gefälschte Ingress-Kopfzeilen helfen nicht
  expect((await request.get('/api/boards', { headers: { 'x-remote-user-id': 'admin', 'x-remote-user-name': 'admin' } })).status()).toBe(401);

  await page.goto('/');
  await expect(page.getByTestId('setup')).toBeVisible();
  await expect(page.getByText('Willkommen! Richte den ersten Administrator ein.')).toBeVisible();
  await expect(nav(page)).toHaveCount(0);

  const form = page.getByRole('form', { name: 'Einrichtung' });
  await form.getByLabel('Einrichtungscode').fill('ZZZZ-ZZZZ');
  await form.getByLabel('Benutzername').fill('anna');
  await form.getByLabel('Name in Stups').fill('Anna');
  await form.getByLabel('Passwort', { exact: true }).fill(PW);
  await form.getByLabel('Passwort wiederholen').fill(PW);
  await form.getByRole('button', { name: 'Einrichten' }).click();
  await expect(page.getByRole('alert')).toContainText('Einrichtungscode stimmt nicht');

  const code = readFileSync(CODE_FILE, 'utf8').trim();
  expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await form.getByLabel('Einrichtungscode').fill(code);
  await form.getByLabel('Passwort wiederholen').fill('anderes-passwort-1');
  await form.getByRole('button', { name: 'Einrichten' }).click();
  await expect(page.getByRole('alert')).toContainText('nicht gleich');

  await form.getByLabel('Passwort wiederholen').fill(PW);
  await form.getByRole('button', { name: 'Einrichten' }).click();
  await expect(nav(page)).toBeVisible(); // gleich angemeldet
});

test('Ohne Home Assistant: zwei Reiter (Aufgaben, Boards), kein Dashboard-Button, nichts von Home Assistant in den Einstellungen', async ({ page }) => {
  await melden(page, 'anna', PW);
  await expect(nav(page).getByRole('button')).toHaveText(['Aufgaben', 'Boards']);
  await expect(nav(page).getByRole('button', { name: 'Wächter' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);

  const dialog = await einstellungen(page);
  await dialog.getByRole('button', { name: 'Konto und Anmeldung' }).click();
  await expect(dialog.getByText('Passwort ändern', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Angemeldet als')).toBeVisible();
  for (const weg of ['Zurück zum Dashboard', 'Darstellung', 'Wächter', 'Bubble Card', 'Umzug', 'Diagnose-Seite', 'Notify-Dienste']) {
    await expect(dialog.getByText(weg, { exact: false })).toHaveCount(0);
  }
  // Passkeys gehen nicht mit einer IP-Adresse als STUPS_PUBLIC_URL: weder Verwaltung noch Anmelde-Routen
  await expect(dialog.getByText('Passkeys', { exact: true })).toHaveCount(0);
  // Push gibt es hier über ntfy (der Testserver hat einen eingerichtet)
  await dialog.getByRole('button', { name: 'Zurück zu den Einstellungen' }).click();
  await expect(dialog.getByRole('button', { name: 'Benachrichtigungen' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Umzug/ })).toHaveCount(0);
  // kein Fehler, keine leere Gruppe
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
  expect((await page.request.get('/api/capabilities').then((r) => r.json())).passkeys).toBe(false);
  expect((await page.request.post('/api/auth/passkey/options', { headers: { 'x-stups-client': 'e2e' } })).status()).toBe(404);
});

test('Anmelden, Karte anlegen, nach dem Neuladen noch angemeldet; Abmelden sperrt wieder', async ({ page }) => {
  await melden(page, 'anna', 'falsches-passwort');
  await expect(page.getByRole('alert')).toContainText('Benutzername oder Passwort stimmt nicht');
  await page.getByLabel('Passwort', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(nav(page)).toBeVisible();
  await openBoards(page);

  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await page.getByLabel('Was steht an?').fill('Fenster putzen');
  await page.getByRole('button', { name: 'Aufgabe anlegen' }).click();
  // in der Liste suchen: Solange das Fenster „Neue Karte" ausblendet, steht der Titel noch einmal im Eingabefeld
  await expect(page.getByRole('list').getByText('Fenster putzen')).toBeVisible();

  await page.reload();
  await openBoards(page);
  await expect(page.getByRole('list').getByText('Fenster putzen')).toBeVisible();

  const dialog = await einstellungen(page);
  await dialog.getByRole('button', { name: 'Konto und Anmeldung' }).click();
  await dialog.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByTestId('login')).toBeVisible();
  await expect(page.getByText('Fenster putzen')).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByTestId('login')).toBeVisible(); // das Cookie ist weg
});

test('Administrator legt Ben an; Ben meldet sich an und sieht keine Verwaltung', async ({ page, browser, baseURL }) => {
  await melden(page, 'anna', PW);
  const dialog = await einstellungen(page);
  await dialog.getByRole('button', { name: 'Personen und Zugriff' }).click();

  const form = page.getByRole('form', { name: 'Benutzer anlegen' });
  await form.getByLabel('Name der neuen Person').fill('Ben');
  await form.getByLabel('Benutzername').fill('ben');
  await form.getByLabel('Passwort').fill('kurz');
  await expect(form.getByRole('button', { name: 'Benutzer anlegen' })).toBeDisabled(); // zu kurz
  await form.getByLabel('Passwort').fill('bens-passwort-1');
  await form.getByRole('button', { name: 'Benutzer anlegen' }).click();
  await expect(page.getByRole('button', { name: /Ben.*Benutzername ben/ })).toBeVisible();
  await expect(page.getByText('Wer darf Stups öffnen?')).toHaveCount(0);
  await expect(page.getByText('Push-Geräte')).toHaveCount(0);

  const ctx = await browser.newContext({ baseURL: String(baseURL), locale: 'de-DE' });
  const ben = await ctx.newPage();
  try {
    await melden(ben, 'ben', 'bens-passwort-1');
    await expect(nav(ben)).toBeVisible();
    await openBoards(ben);
    await expect(ben.getByText('Fenster putzen').first()).toBeVisible(); // gemeinsame Boards

    const d = await einstellungen(ben);
    // ein Mitglied sieht keine Verwaltung der Personen
    await expect(d.getByRole('button', { name: 'Personen und Zugriff' })).toHaveCount(0);
    await expect(ben.getByRole('form', { name: 'Benutzer anlegen' })).toHaveCount(0);
    // die Verwaltung der Benutzer ist auch per API zu
    expect((await ctx.request.get('/api/auth/users')).status()).toBe(403);
  } finally {
    await ctx.close();
  }
});

test('Passwort ändern: das neue gilt, das alte nicht mehr', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL: String(baseURL), locale: 'de-DE' });
  const page = await ctx.newPage();
  try {
    await melden(page, 'ben', 'bens-passwort-1');
    const dialog = await einstellungen(page);
    await dialog.getByRole('button', { name: 'Konto und Anmeldung' }).click();
    await dialog.getByRole('button', { name: 'Ändern', exact: true }).click();
    const form = page.getByRole('form', { name: 'Passwort ändern' });
    await form.getByLabel('Aktuelles Passwort').fill('bens-passwort-1');
    await form.getByLabel('Neues Passwort', { exact: true }).fill('bens-neues-passwort');
    await form.getByLabel('Neues Passwort wiederholen').fill('bens-neues-passwort');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Passwort geändert')).toBeVisible();
    await dialog.getByRole('button', { name: 'Abmelden' }).click();
    await expect(page.getByTestId('login')).toBeVisible();

    await melden(page, 'ben', 'bens-passwort-1');
    await expect(page.getByRole('alert')).toContainText('stimmt nicht');
    await page.getByLabel('Passwort', { exact: true }).fill('bens-neues-passwort');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(nav(page)).toBeVisible();
  } finally {
    await ctx.close();
  }
});


// ---------- Push über ntfy (nachgebauter Server auf PORT+1, siehe server-standalone.mjs) ----------

/** Anmelden und warten, bis die App steht (bevor Tests die API des angemeldeten Browsers aufrufen) */
async function anmelden(page: Page) {
  await melden(page, 'anna', PW);
  await expect(nav(page)).toBeVisible();
}

const NTFY = 'http://127.0.0.1:18431';
const API = { 'x-stups-client': 'e2e' };

interface Published {
  topic: string;
  title: string;
  message: string;
  priority: number;
  click?: string;
  sequence_id?: string;
  authorization: string | null;
  actions?: { action: string; label: string; url: string; method: string; headers: Record<string, string>; body: string; clear: boolean }[];
}

const published = async (request: import('@playwright/test').APIRequestContext): Promise<Published[]> => (await request.get(`${NTFY}/__published`)).json();

/** So tippt die ntfy-App auf einen Knopf: die Anfrage steht fertig in der Nachricht, ohne Sitzung und ohne Kopfzeile des Clients */
async function tap(request: import('@playwright/test').APIRequestContext, button: NonNullable<Published['actions']>[number]) {
  return request.fetch(button.url, { method: button.method, headers: button.headers, data: button.body });
}

test('ntfy: Thema eintragen, Test-Nachricht kommt an, der Knopf meldet sich zurück', async ({ page, request }) => {
  await anmelden(page);
  const dialog = await einstellungen(page);
  await dialog.getByRole('button', { name: 'Benachrichtigungen' }).click();

  // Thema prüfen und speichern
  const field = page.getByLabel('ntfy-Thema von Anna');
  await field.fill('kein gültiges thema');
  await expect(page.getByText('Erlaubt sind Buchstaben')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  await page.getByRole('button', { name: 'Zufälliges Thema' }).click();
  await expect(field).toHaveValue(/^stups-[a-z0-9]{20}$/);
  await field.fill('anna-e2e-topf');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('ntfy-Thema gespeichert')).toBeVisible();
  await expect(page.getByText('http://127.0.0.1:18431').first()).toBeVisible(); // die Anleitung nennt den Server

  // Test-Nachricht aus den Einstellungen
  await request.get(`${NTFY}/__reset`);
  await page.goto('/');
  const settings = await einstellungen(page);
  await settings.getByRole('button', { name: 'Benachrichtigungen' }).click();
  await settings.getByRole('button', { name: 'An mich senden' }).click();
  await expect(page.getByText('Test-Nachricht gesendet.')).toBeVisible();

  const [msg] = await published(request);
  expect(msg).toMatchObject({
    topic: 'anna-e2e-topf',
    title: 'Stups: Test',
    authorization: 'Bearer tk_e2e',
    click: 'http://127.0.0.1:18430/',
    actions: [{ action: 'http', label: 'Rückweg prüfen', url: 'http://127.0.0.1:18430/api/push/action', method: 'POST', clear: true }],
  });

  // Der Knopf funktioniert ohne Anmeldung; ein veränderter nicht
  expect((await request.fetch(msg!.actions![0]!.url, { method: 'POST', headers: { 'content-type': 'text/plain' }, data: `${msg!.actions![0]!.body}x` })).status()).toBe(403);
  const ok = await tap(request, msg!.actions![0]!);
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toEqual({ result: 'test' });

  await settings.getByRole('button', { name: 'Etwas kommt nicht an? Prüfen' }).click();
  await expect(settings.getByTestId('ntfy-status')).toContainText('Rückweg der Knöpfe zuletzt geprüft');
  await expect(settings.getByTestId('ntfy-status')).toContainText('Anna: Thema eingetragen');
});

test('ntfy: ein Stups kommt mit drei Knöpfen an, „Erledigt" erledigt die Karte und räumt die Nachricht weg', async ({ page, request }) => {
  await anmelden(page);
  const people = (await (await page.request.get('/api/people')).json()) as { id: string; name: string }[];
  const ben = people.find((p) => p.name === 'Ben')!;
  const boards = (await (await page.request.get('/api/boards')).json()) as { id: string }[];
  const view = (await (await page.request.get(`/api/boards/${boards[0]!.id}`)).json()) as { columns: { id: string }[] };

  // Ben richtet sein Thema selbst ein, Anna (Administratorin) hätte es auch gekonnt
  const bens = await (await page.request.patch(`/api/access/people/${ben.id}`, { headers: API, data: { ntfyTopic: 'ben-e2e-topf', quietOff: true } })).json(); // ohne Ruhezeit, sonst hält der Server Stupse zwischen 22 und 7 Uhr zurück
  expect(bens.ntfy).toBe(true);
  expect(bens.ntfyTopic).toBeUndefined();

  const card = await (
    await page.request.post(`/api/boards/${boards[0]!.id}/cards`, { headers: API, data: { columnId: view.columns[0]!.id, title: 'Müll rausbringen', assigneeIds: [ben.id] } })
  ).json();
  await request.get(`${NTFY}/__reset`);
  const nudge = await page.request.post(`/api/cards/${card.id}/nudge`, { headers: API, data: { to: [ben.id], template: 'think' } });
  expect(nudge.status()).toBe(201);

  await expect.poll(async () => (await published(request)).length).toBe(1);
  const [msg] = await published(request);
  expect(msg).toMatchObject({
    topic: 'ben-e2e-topf',
    title: 'Anna stupst dich',
    message: 'Müll rausbringen · Denkst du dran?',
    click: `http://127.0.0.1:18430/?card=${card.id}`,
    sequence_id: `stups-card-${card.id}`,
  });
  expect(msg!.actions!.map((a) => a.label)).toEqual(['Erledigt', 'Mach ich', 'Später']);

  const done = await tap(request, msg!.actions![0]!);
  expect(await done.json()).toEqual({ result: 'completed' });
  expect(((await (await page.request.get(`/api/cards/${card.id}`)).json()) as { completedAt: string | null }).completedAt).not.toBeNull();
  // die Nachricht wird auf dem Gerät entfernt (ältere Server ignorieren das)
  await expect.poll(async () => (await (await request.get(`${NTFY}/__deleted`)).json()) as string[]).toContain(`/ben-e2e-topf/stups-card-${card.id}`);
  // ein zweiter Tipp ist kein Fehler
  expect((await tap(request, msg!.actions![0]!)).status()).toBe(200);
});

test('ntfy: „Mach ich" meldet dem Absender zurück, und der Link der Nachricht öffnet die Karte', async ({ page, request }) => {
  await anmelden(page);
  const people = (await (await page.request.get('/api/people')).json()) as { id: string; name: string }[];
  const ben = people.find((p) => p.name === 'Ben')!;
  const boards = (await (await page.request.get('/api/boards')).json()) as { id: string }[];
  const view = (await (await page.request.get(`/api/boards/${boards[0]!.id}`)).json()) as { columns: { id: string }[] };
  const card = await (
    await page.request.post(`/api/boards/${boards[0]!.id}/cards`, { headers: API, data: { columnId: view.columns[0]!.id, title: 'Pfand wegbringen', assigneeIds: [ben.id] } })
  ).json();

  await request.get(`${NTFY}/__reset`);
  await page.request.post(`/api/cards/${card.id}/nudge`, { headers: API, data: { to: [ben.id], template: 'today' } });
  await expect.poll(async () => (await published(request)).length).toBe(1);
  const [msg] = await published(request);
  const ack = msg!.actions!.find((a) => a.label === 'Mach ich')!;
  expect(await (await tap(request, ack)).json()).toEqual({ result: 'acked' });

  // Anna bekommt die leise Rückmeldung auf ihr Thema
  await expect.poll(async () => (await published(request)).map((m) => m.topic)).toContain('anna-e2e-topf');
  const feedback = (await published(request)).find((m) => m.topic === 'anna-e2e-topf')!;
  expect(feedback).toMatchObject({ title: 'Pfand wegbringen', message: "Ben macht's 👍", priority: 2 });
  expect(feedback.actions).toBeUndefined();

  // Der Link aus der Nachricht öffnet die Karte (angemeldet)
  await page.goto(msg!.click!);
  await expect(page.getByRole('dialog').getByLabel('Titel')).toHaveValue('Pfand wegbringen');
});

test('ntfy: ein Token für eine andere Person oder ohne Token erledigt nichts', async ({ page, request }) => {
  await anmelden(page);
  const people = (await (await page.request.get('/api/people')).json()) as { id: string; name: string }[];
  const ben = people.find((p) => p.name === 'Ben')!;
  const boards = (await (await page.request.get('/api/boards')).json()) as { id: string }[];
  const view = (await (await page.request.get(`/api/boards/${boards[0]!.id}`)).json()) as { columns: { id: string }[] };
  const card = await (
    await page.request.post(`/api/boards/${boards[0]!.id}/cards`, { headers: API, data: { columnId: view.columns[0]!.id, title: 'Keller aufräumen', assigneeIds: [ben.id] } })
  ).json();
  await request.get(`${NTFY}/__reset`);
  await page.request.post(`/api/cards/${card.id}/nudge`, { headers: API, data: { to: [ben.id], template: 'help' } });
  await expect.poll(async () => (await published(request)).length).toBe(1);
  const [msg] = await published(request);
  const button = msg!.actions![0]!;

  // Inhalt ändern (andere Person), Signatur behalten: abgewiesen
  const [payload, sig] = button.body.split('.') as [string, string];
  const parts = JSON.parse(Buffer.from(payload, 'base64url').toString()) as [string, string, number];
  parts[0] = people.find((p) => p.name === 'Anna')!.id;
  const forged = `${Buffer.from(JSON.stringify(parts)).toString('base64url')}.${sig}`;
  expect((await request.fetch(button.url, { method: 'POST', headers: button.headers, data: forged })).status()).toBe(403);
  expect((await request.fetch(button.url, { method: 'POST', headers: button.headers, data: '' })).status()).toBe(403);
  expect((await request.fetch(button.url, { method: 'GET' })).status()).not.toBe(200);
  expect(((await (await page.request.get(`/api/cards/${card.id}`)).json()) as { completedAt: string | null }).completedAt).toBeNull();
});

// Zuletzt: die Sperre gilt für die Adresse, alle Anmeldungen danach würden warten
test('Nach fünf Fehlversuchen heißt es warten', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL: String(baseURL), locale: 'de-DE' });
  const page = await ctx.newPage();
  try {
    await page.goto('/');
    for (let i = 0; i < 5; i += 1) {
      await page.getByLabel('Benutzername').fill('gast-versuch');
      await page.getByLabel('Passwort', { exact: true }).fill(`falsch-falsch-${i}`);
      await page.getByRole('button', { name: 'Anmelden' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
    }
    await page.getByLabel('Passwort', { exact: true }).fill('noch-ein-versuch');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(page.getByRole('alert')).toContainText('Zu viele Versuche');
  } finally {
    await ctx.close();
  }
});
