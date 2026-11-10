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
  const people = (await (await request.get('/api/people')).json()) as { id: string; displayName: string }[];
  for (const p of people) {
    // die Handys gehören zur Benutzerzeile und überleben das Entfernen der Person
    // (Connys Handy bleibt: der Mitglieds-Test erkennt es am Namen)
    if (p.displayName !== 'Conny') await request.patch(`/api/access/people/${p.id}`, { data: { notifyServices: [] } });
    await request.delete(`/api/access/people/${p.id}`);
  }
  // das eigene Handy des Administrators (Testschritt) steht in seiner Zeile
  const self = (await (await request.get('/api/me')).json()) as { user: { id: string } };
  await request.patch(`/api/access/people/${self.user.id}`, { data: { notifyServices: [] } });
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

/** Den Wächter einrichten wie in der App: „Einrichten" bei der Waschmaschine, am Handy durch den Assistenten, am Desktop im Editor */
async function setupWatcher(page: Page, desktop: boolean) {
  const hit = page.getByTestId('found-hit').filter({ hasText: 'Waschmaschine' }).first();
  await hit.getByRole('button', { name: 'Einrichten' }).click();
  if (desktop) {
    const desk = page.getByTestId('onboarding-desk');
    await expect(desk).toBeVisible();
    await desk.getByRole('button', { name: 'Wächter anlegen' }).click();
  } else {
    const wizard = page.getByRole('dialog', { name: 'Neuer Wächter' });
    await expect(wizard).toBeVisible();
    for (let i = 0; i < 3; i += 1) await wizard.getByRole('button', { name: /^Weiter/ }).click();
    await wizard.getByRole('button', { name: 'Wächter anlegen' }).click();
  }
}

test('Administrator: alles durchlaufen bis „Zu den Aufgaben"', async ({ page, request }, info) => {
  const desktop = (info.project.use.viewport?.width ?? 0) >= 1024;
  await page.goto('/');
  await expect(heading(page, 'Dein Zuhause merkt, was zu tun ist.')).toBeVisible();
  await expect(page.getByTestId('welcome-example')).toBeVisible();
  await expect(tabs(page)).toHaveCount(0); // statt der Reiter
  await page.getByRole('button', { name: /Los geht/ }).click();

  // Personen: der Administrator ist keine Person und steht nicht in der Liste; Mia hat kein Handy, mit Links zur Companion App
  await expect(heading(page, 'Wer wohnt hier?')).toBeVisible();
  const rows = page.getByTestId('people-list').getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('person-self')).toHaveCount(0);
  await expect(page.getByTestId('admin-note')).toContainText('Du bist Administrator');
  await expect(page.getByTestId('person-ha:ha-conny-e2e')).toContainText('Handy erkannt');
  await expect(page.locator('[data-testid^="person-"]', { hasText: 'Mia' })).toContainText('Kein Handy gefunden');
  const links = page.getByTestId('companion-links');
  await expect(links).toHaveCount(1);
  await expect(links.getByRole('link', { name: /App Store/ })).toHaveAttribute('href', 'https://apps.apple.com/app/home-assistant/id1099568401');
  await expect(links.getByRole('link', { name: /Google Play/ })).toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=io.homeassistant.companion.android');
  await expect(links.getByRole('link', { name: /Google Play/ })).toHaveAttribute('target', '_blank');
  // „Wer ist ein Kind?": Mia ist ein Kind
  const kids = page.getByTestId('kids');
  await kids.getByRole('button', { name: 'Mia ist ein Kind' }).click();
  await expect(kids.getByRole('button', { name: 'Mia ist ein Kind' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Weiter mit 2 Personen' }).click();

  // Wächter: die „Gefunden"-Liste und der Assistent (Handy) bzw. Editor (Desktop) der App
  await expect(heading(page, 'Dein erster Wächter')).toBeVisible();
  await setupWatcher(page, desktop);

  // Test: nach dem Speichern geht es hier weiter; die Vorschau zeigt die echte Nachricht, Conny ist der Empfänger (der Administrator hat kein Handy)
  await expect(heading(page, 'Testnachricht')).toBeVisible();
  await expect(page.getByTestId('test-recipients').getByRole('radio', { name: 'Conny' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('onboarding-preview')).toHaveCount(1);
  await expect(page.getByTestId('preview-title')).toContainText('Waschmaschine');
  await expect(page.getByTestId('preview-body')).toContainText('Neue Karte für dich · fällig');
  await dialog(page).getByRole('button', { name: 'Testnachricht an Conny senden' }).click();
  await expect(page.getByTestId('test-sent')).toBeVisible();
  const pushes = (await (await request.get(`${MOCK}/mock/pushes`)).json()) as { service: string; title: string; message: string; data: { actions?: { title: string }[] } }[];
  const toConny = pushes.find((p) => p.service === 'mobile_app_conny_e2e' && /Waschmaschine/.test(p.title));
  expect(toConny, JSON.stringify(pushes)).toBeTruthy();
  // Conny hat zwei Anmeldungen der Companion App: Home Assistant ordnet beide ihr zu, die Nachricht geht an beide
  expect(pushes.filter((p) => /Waschmaschine/.test(p.title)).map((p) => p.service).sort()).toEqual(['mobile_app_conny_e2e', 'mobile_app_conny_e2e_2']);
  expect(toConny!.message).toMatch(/^Neue Karte für dich · fällig /);
  // nur Erledigt: „Später" gibt es bei Wächter-Karten nicht
  expect(toConny!.data.actions?.map((a) => a.title)).toEqual(['Erledigt']);
  await dialog(page).getByRole('button', { name: 'Ja, weiter' }).click();

  // Fertig: nur, was passiert ist; dann zu den Aufgaben
  await expect(heading(page, 'Stups läuft.')).toBeVisible();
  const done = page.getByTestId('done-list');
  await expect(done).toContainText('2 Personen eingerichtet');
  await expect(done).toContainText(/Wächter aktiv/);
  await expect(done).toContainText('Testnachricht gesendet');
  expect((await me(request)).onboarding).toBeNull();
  await dialog(page).getByRole('button', { name: 'Zu den Aufgaben' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(tabs(page).getByRole('button', { name: 'Aufgaben' })).toHaveAttribute('aria-current', 'page');
  expect(await me(request)).toMatchObject({ onboarding: 'done', needsOnboarding: false });

  // Der Administrator ist keine Person; Conny hat ihr Handy, Mia ist ein Kind ohne Gerät
  const people = (await (await request.get('/api/people')).json()) as { id: string; displayName: string; notifyServices: string[]; isChild: boolean }[];
  expect(people.map((p) => p.displayName).sort()).toEqual(['Conny', 'Mia']);
  expect(people.find((p) => p.displayName === 'Conny')!.notifyServices).toEqual(['mobile_app_conny_e2e_2', 'mobile_app_conny_e2e']);
  expect(people.find((p) => p.displayName === 'Mia')).toMatchObject({ notifyServices: [], isChild: true });
  // Der Wächter ist da, „Wer kommt infrage?" waren die Personen aus dem ersten Schritt ohne das Kind
  const watchers = (await (await request.get('/api/watchers')).json()) as { items: { assign: { personIds: string[] } }[] };
  expect(watchers.items).toHaveLength(1);
  expect(watchers.items[0]!.assign.personIds).toEqual([people.find((p) => p.displayName === 'Conny')!.id]);
});

test('„Mich auch hinzufügen": der Administrator wird eine Person; Wächter und Test lassen sich überspringen', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Los geht/ }).click();
  await expect(heading(page, 'Wer wohnt hier?')).toBeVisible();
  await page.getByRole('switch', { name: 'Mich auch als Person hinzufügen' }).click();
  await expect(page.getByTestId('person-self')).toContainText('Du');
  await page.getByRole('button', { name: 'Weiter mit 3 Personen' }).click();
  await dialog(page).getByRole('button', { name: 'Ohne Wächter weiter' }).click();
  await dialog(page).getByRole('button', { name: 'Ohne Test weiter' }).click();
  await expect(heading(page, 'Stups läuft.')).toBeVisible();
  await expect(page.getByTestId('done-list')).toContainText('3 Personen eingerichtet');
  await dialog(page).getByRole('button', { name: 'Zu den Aufgaben' }).click();
  await expect(tabs(page)).toBeVisible();
  const people = (await (await request.get('/api/people')).json()) as { displayName: string }[];
  expect(people.map((p) => p.displayName.toLowerCase()).sort()).toEqual(['conny', 'mia', 'rene']);
});

test('Testschritt: der Administrator trägt sein eigenes Handy ein und schickt die Nachricht an sich', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Los geht/ }).click();
  await page.getByRole('button', { name: /Weiter mit 2 Personen/ }).click();
  await dialog(page).getByRole('button', { name: 'Ohne Wächter weiter' }).click();
  await expect(heading(page, 'Testnachricht')).toBeVisible();
  // Conny ist Empfängerin; das Handy des Administrators fehlt, er ist keine Person
  const recipients = page.getByTestId('test-recipients');
  await expect(recipients.getByRole('radio')).toHaveCount(1);
  await page.getByTestId('own-phone').getByRole('button', { name: 'Mein Handy dazunehmen' }).click();
  const own = page.getByTestId('own-phone');
  // Home Assistant ordnet das Gerät dem Administrator zu: es ist vorgewählt
  await expect(own.getByRole('checkbox', { name: /rene e2e/i })).toHaveAttribute('aria-checked', 'true');
  await own.getByRole('button', { name: 'Mein Handy verbinden' }).click();
  await expect(recipients.getByRole('radio')).toHaveCount(2);
  await expect(recipients.getByRole('radio', { name: /Rene/i })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('own-phone')).toHaveCount(0);
  await dialog(page).getByRole('button', { name: /Testnachricht an Rene/i }).click();
  await expect(page.getByTestId('test-sent')).toBeVisible();
  const pushes = (await (await request.get(`${MOCK}/mock/pushes`)).json()) as { service: string }[];
  expect(pushes.map((p) => p.service)).toEqual(['mobile_app_rene_e2e']);
  // er bleibt keine Person
  const people = (await (await request.get('/api/people')).json()) as { displayName: string }[];
  expect(people.map((p) => p.displayName.toLowerCase()).sort()).toEqual(['conny', 'mia']);
});

test('Handy von Hand wählen: Mia bekommt ein Gerät aus der Liste, die Zuordnung von Home Assistant steht oben', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Los geht/ }).click();
  const mia = page.locator('[data-testid^="person-"]', { hasText: 'Mia' });
  await expect(mia).toContainText('Kein Handy gefunden');
  await mia.getByRole('button', { name: 'Handy wählen' }).click();
  const list = mia.locator('[data-testid^="devices-"]');
  const boxes = list.getByRole('checkbox');
  // alle Geräte der Companion App stehen zur Auswahl; wer ein Gerät schon hat, steht dabei
  await expect(boxes).toHaveCount(3);
  await expect(list.getByRole('checkbox', { name: /Conny e2e 2/ })).toContainText('bei Conny');
  await list.getByRole('checkbox', { name: /^Rene e2e/ }).click();
  await expect(mia).toContainText('Handy gewählt · Rene e2e');
  // Conny behält ihre erkannten Geräte, auch nach dem Aufklappen und Ändern bei Mia
  await expect(page.getByTestId('person-ha:ha-conny-e2e')).toContainText('Handy erkannt');
  await page.getByRole('button', { name: 'Weiter mit 2 Personen' }).click();
  await dialog(page).getByRole('button', { name: 'Ohne Wächter weiter' }).click();
  await dialog(page).getByRole('button', { name: 'Ohne Test weiter' }).click();
  await dialog(page).getByRole('button', { name: 'Zu den Aufgaben' }).click();
  const people = (await (await request.get('/api/people')).json()) as { displayName: string; notifyServices: string[] }[];
  expect(people.find((p) => p.displayName === 'Mia')!.notifyServices).toEqual(['mobile_app_rene_e2e']);
  expect(people.find((p) => p.displayName === 'Conny')!.notifyServices).toEqual(['mobile_app_conny_e2e_2', 'mobile_app_conny_e2e']);
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
  await page.getByRole('button', { name: 'Weiter mit 2 Personen' }).click();
  await expect(heading(page, 'Dein erster Wächter')).toBeVisible();

  // Der Stand liegt auf dem Server: ein anderes Gerät (neue Seite) macht beim Wächter weiter
  await expect.poll(async () => (await me(request)).onboardingProgress?.step).toBe('watcher');
  await page.reload();
  await expect(heading(page, 'Dein erster Wächter')).toBeVisible();
  // Zurück zu den Personen: sie stehen schon in Stups, nichts wird doppelt angelegt
  await dialog(page).getByRole('button', { name: 'Zurück' }).click();
  await expect(heading(page, 'Wer wohnt hier?')).toBeVisible();
  await expect(page.getByTestId('people-list').getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Weiter mit 2 Personen' }).click();
  await expect(heading(page, 'Dein erster Wächter')).toBeVisible();
  expect(((await (await request.get('/api/people')).json()) as unknown[]).length).toBe(2);
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
