import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

// Läuft nur in den Projekten „onboarding-*": eigener Server mit nachgebautem Home Assistant und leerer Datenbank, ohne den Schalter
// DEV_NO_ONBOARDING (e2e/server-onboarding.mjs). Home Assistant kennt Rene (Administrator), Conny und Mia; Mia hat kein Handy.
// Handy und Desktop, hell und dunkel. Jeder Test setzt den Stand selbst zurück: Die Projekte laufen hintereinander auf demselben Server.
const MOCK = 'http://127.0.0.1:18461';
test.describe.configure({ timeout: 90_000, mode: 'serial' });

const connyHeaders = {
  'x-remote-user-id': 'ha-conny-e2e',
  'x-remote-user-name': 'conny',
  'x-remote-user-display-name': 'Conny',
  'x-stups-language': 'de',
};

interface Me {
  onboarding: 'done' | 'skipped' | null;
  needsOnboarding: boolean;
  onboardingProgress: { step: string } | null;
}
const me = async (request: APIRequestContext, headers?: Record<string, string>): Promise<Me> => (await request.get('/api/me', { headers })).json();

/** Wie ein frisch installiertes Stups: keine Personen, keine Wächter; der Administrator fängt wieder beim Willkommen an */
async function reset(request: APIRequestContext) {
  const watchers = (await (await request.get('/api/watchers')).json()) as { items: { id: string }[] };
  for (const w of watchers.items) await request.delete(`/api/watchers/${w.id}`);
  const people = (await (await request.get('/api/people')).json()) as { id: string }[];
  for (const p of people) await request.delete(`/api/access/people/${p.id}`);
  await request.post(`${MOCK}/mock/pushes/clear`);
  expect((await request.delete('/api/me/onboarding')).status()).toBe(204);
}

/** Conny fängt neu an (ihr Status überlebt das Entfernen der Person, wie bei einem echten Haushalt) */
const resetConny = async (request: APIRequestContext) => {
  expect((await request.delete('/api/me/onboarding', { headers: connyHeaders })).status()).toBe(204);
};

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Einrichtung' });
const heading = (page: Page, name: string | RegExp) => dialog(page).getByRole('heading', { level: 1, name });
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test('Administrator: alles durchlaufen bis „Zu den Aufgaben"', async ({ page, request }) => {
  await page.goto('/');
  await expect(heading(page, 'Dein Zuhause merkt, was zu tun ist.')).toBeVisible();
  await expect(page.getByTestId('welcome-example')).toBeVisible();
  await expect(tabs(page)).toHaveCount(0); // statt der Reiter
  await page.getByRole('button', { name: /Los geht/ }).click();

  // Personen: alle vorgewählt, Du oben, Mia ohne Handy mit Links zur Companion App
  await expect(heading(page, 'Wer wohnt hier?')).toBeVisible();
  const rows = page.getByTestId('people-list').getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(/rene/i);
  await expect(rows.first()).toContainText('Du');
  await expect(rows.first().getByRole('checkbox')).toBeDisabled();
  await expect(page.locator('[data-testid^="person-"]', { hasText: 'Mia' })).toContainText('Kein Handy gefunden');
  const links = page.getByTestId('companion-links');
  await expect(links).toHaveCount(1);
  await expect(links.getByRole('link', { name: /App Store/ })).toHaveAttribute('href', 'https://apps.apple.com/app/home-assistant/id1099568401');
  await expect(links.getByRole('link', { name: /Google Play/ })).toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=io.homeassistant.companion.android');
  await expect(links.getByRole('link', { name: /Google Play/ })).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: 'Weiter mit 3 Personen' }).click();

  // Wächter: bester Treffer groß (Waschmaschine), Zähler am Knopf
  await expect(heading(page, 'Das haben wir bei dir gefunden')).toBeVisible();
  await expect(page.getByTestId('best-hit')).toContainText('Waschmaschine fertig');
  await expect(page.getByTestId('other-hit').first()).toBeVisible();
  const enable = dialog(page).getByRole('button', { name: /Wächter einschalten/ });
  await expect(enable).toBeVisible();
  const wanted = Number((await enable.innerText()).match(/\d+/)?.[0]);
  expect(wanted).toBeGreaterThanOrEqual(1);
  await enable.click();

  // Test: Vorschau, senden, die Nachricht kommt mit den Knöpfen Erledigt und Später am Handy von Rene an
  await expect(heading(page, 'Probier es gleich aus')).toBeVisible();
  await expect(page.getByTestId('onboarding-preview')).toHaveCount(1);
  await expect(page.getByTestId('preview-title')).toContainText('Waschmaschine');
  await dialog(page).getByRole('button', { name: 'Testnachricht senden' }).click();
  await expect(page.getByTestId('test-sent')).toBeVisible();
  const pushes = (await (await request.get(`${MOCK}/mock/pushes`)).json()) as { service: string; title: string; message: string; data: { actions?: { title: string }[] } }[];
  const toRene = pushes.find((p) => p.service === 'mobile_app_rene_e2e' && /Waschmaschine/.test(p.title));
  expect(toRene, JSON.stringify(pushes)).toBeTruthy();
  expect(toRene!.data.actions?.map((a) => a.title)).toEqual(['Erledigt', 'Später']);
  await dialog(page).getByRole('button', { name: 'Ja, weiter' }).click();

  // Fertig: nur, was passiert ist; dann zu den Aufgaben
  await expect(heading(page, 'Stups läuft.')).toBeVisible();
  const done = page.getByTestId('done-list');
  await expect(done).toContainText('3 Personen eingerichtet');
  await expect(done).toContainText(/Wächter aktiv/);
  await expect(done).toContainText('Testnachricht gesendet');
  expect((await me(request)).onboarding).toBeNull();
  await dialog(page).getByRole('button', { name: 'Zu den Aufgaben' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(tabs(page).getByRole('button', { name: 'Aufgaben' })).toHaveAttribute('aria-current', 'page');
  expect(await me(request)).toMatchObject({ onboarding: 'done', needsOnboarding: false });

  // die Wächter und Personen sind wirklich da, Mia ist ein Mitglied ohne Gerät, Rene hat sein Handy
  const people = (await (await request.get('/api/people')).json()) as { displayName: string; notifyServices: string[] }[];
  expect(people.map((p) => p.displayName.toLowerCase()).sort()).toEqual(['conny', 'mia', 'rene']);
  expect(people.find((p) => /rene/i.test(p.displayName))!.notifyServices).toEqual(['mobile_app_rene_e2e']);
  expect(people.find((p) => p.displayName === 'Mia')!.notifyServices).toEqual([]);
  const watchers = (await (await request.get('/api/watchers')).json()) as { items: { assign: { mode: string; personIds: string[] } }[] };
  expect(watchers.items.length).toBe(wanted);
  expect(watchers.items[0]!.assign).toMatchObject({ mode: 'rotation_present' });
  expect(watchers.items[0]!.assign.personIds).toHaveLength(3);
});

test('überspringen im ersten Schritt öffnet die App normal und erscheint nicht wieder', async ({ page, request }) => {
  await page.goto('/');
  await expect(heading(page, 'Dein Zuhause merkt, was zu tun ist.')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Überspringen' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(tabs(page)).toBeVisible();
  expect(await me(request)).toMatchObject({ onboarding: 'skipped', needsOnboarding: false });
  await page.reload();
  await expect(tabs(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
});

test('Abbruch und Wiederaufnahme: nach dem Neuladen geht es beim richtigen Schritt weiter, die Personen sind nicht doppelt', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Los geht/ }).click();
  await expect(heading(page, 'Wer wohnt hier?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter mit 3 Personen' }).click();
  await expect(heading(page, 'Das haben wir bei dir gefunden')).toBeVisible();

  // Der Stand liegt auf dem Server: ein anderes Gerät (neue Seite) macht beim Wächter weiter
  await expect.poll(async () => (await me(request)).onboardingProgress?.step).toBe('watcher');
  await page.reload();
  await expect(heading(page, 'Das haben wir bei dir gefunden')).toBeVisible();
  // Zurück zu den Personen: sie stehen schon in Stups, nichts wird doppelt angelegt
  await dialog(page).getByRole('button', { name: 'Zurück' }).click();
  await expect(heading(page, 'Wer wohnt hier?')).toBeVisible();
  await expect(page.getByTestId('people-list').getByRole('listitem')).toHaveCount(3);
  await page.getByRole('button', { name: 'Weiter mit 3 Personen' }).click();
  await expect(heading(page, 'Das haben wir bei dir gefunden')).toBeVisible();
  expect(((await (await request.get('/api/people')).json()) as unknown[]).length).toBe(3);
});

async function asConny(browser: Browser, baseURL: string, colorScheme: 'dark' | 'light', viewport: { width: number; height: number } | null) {
  return browser.newContext({ baseURL, colorScheme, locale: 'de-DE', timezoneId: 'Europe/Berlin', extraHTTPHeaders: connyHeaders, ...(viewport ? { viewport } : {}) });
}

test('Mitglied sieht nur „Handy verbinden" und „Farbe wählen"', async ({ browser, request }, info) => {
  // Conny ist eine Person (der Administrator hat sie angelegt), hat aber die Einrichtung noch nicht gesehen
  const conny = (await (await request.post('/api/access/people', { data: { name: 'Conny', haUserId: 'ha-conny-e2e' } })).json()) as { id: string };
  expect(conny.id).toBeTruthy();
  await resetConny(request);
  const ctx = await asConny(browser, String(info.project.use.baseURL), info.project.use.colorScheme === 'light' ? 'light' : 'dark', info.project.use.viewport ?? null);
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(heading(page, 'Handy verbinden')).toBeVisible();
  await expect(dialog(page).getByText('Wer wohnt hier?')).toHaveCount(0);
  // das Handy wird am Namen erkannt und eingetragen
  await expect(page.getByTestId('phone-state')).toContainText('Dein Handy ist verbunden.');
  await dialog(page).getByRole('button', { name: 'Ohne Test weiter' }).click();
  await expect(heading(page, 'Farbe wählen')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Zu den Aufgaben' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(tabs(page)).toBeVisible();
  expect(await me(ctx.request)).toMatchObject({ onboarding: 'done', needsOnboarding: false });
  await ctx.close();
});

test('Kind sieht nur „Handy verbinden"', async ({ browser, request }, info) => {
  const conny = (await (await request.post('/api/access/people', { data: { name: 'Conny', haUserId: 'ha-conny-e2e' } })).json()) as { id: string };
  await request.patch(`/api/access/people/${conny.id}`, { data: { isChild: true } });
  await resetConny(request);
  const ctx = await asConny(browser, String(info.project.use.baseURL), info.project.use.colorScheme === 'light' ? 'light' : 'dark', info.project.use.viewport ?? null);
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(heading(page, 'Handy verbinden')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Ohne Test weiter' }).click();
  await expect(dialog(page)).toHaveCount(0); // kein zweiter Schritt
  expect(await me(ctx.request)).toMatchObject({ onboarding: 'done' });
  await ctx.close();
});

test('Bestandsinstallation: wer schon da ist, sieht die Einrichtung nicht; nochmal durchgehen steht in den Einstellungen', async ({ page, request }) => {
  // Eine Installation mit Personen und Karte, der Administrator hat die Einrichtung früher durchlaufen
  await request.post('/api/access/people', { data: { name: 'Conny', haUserId: 'ha-conny-e2e' } });
  const board = (await (await request.get('/api/boards')).json()) as { id: string }[];
  const view = (await (await request.get(`/api/boards/${board[0]!.id}`)).json()) as { columns: { id: string }[] };
  await request.post(`/api/boards/${board[0]!.id}/cards`, { data: { columnId: view.columns[0]!.id, title: 'Müll raus' } });
  expect((await request.put('/api/me/onboarding', { data: { status: 'done' } })).status()).toBe(204);

  await page.goto('/');
  await expect(tabs(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);

  // „Einrichtung nochmal durchgehen" (Einstellungen › Hilfe und Daten) öffnet sie wieder
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Einrichtung nochmal durchgehen' }).click();
  await expect(heading(page, 'Dein Zuhause merkt, was zu tun ist.')).toBeVisible();
  expect(await me(request)).toMatchObject({ onboarding: null, needsOnboarding: true });
  await dialog(page).getByRole('button', { name: 'Überspringen' }).click();
  await expect(tabs(page)).toBeVisible();
});
