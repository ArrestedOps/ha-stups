import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { openSettingsPage } from './helpers';

// Berechtigungen je Person: Ein Administrator (Rene, DEV_ADMINS) gibt einem Mitglied einzelne Rechte; die Oberfläche des Mitglieds folgt
// ohne Neuladen (Live-Abgleich), der Server entscheidet. Läuft auf dem gemeinsamen Server (dunkel und hell nacheinander): eindeutige Namen,
// alles Angelegte wird am Ende entfernt.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const NAME = `Perm${tag}`;
// Mit PERM_SHOTS=<Ordner> entstehen Bildschirmfotos (390 × 844) zum Ansehen; sonst keine
const SHOTS = process.env.PERM_SHOTS;
const headers = { 'x-remote-user-id': `ha-perm-${tag}`, 'x-remote-user-name': `perm${tag}`, 'x-remote-user-display-name': NAME, 'x-stups-language': 'de' };

let memberId = '';
let oldDueTime: string | null = null;

async function member(browser: Browser, baseURL: string) {
  const ctx = await browser.newContext({ baseURL, locale: 'de-DE', extraHTTPHeaders: headers });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Einstellungen öffnen' })).toBeVisible();
  return { ctx, page };
}

async function openPeople(page: Page) {
  await openSettingsPage(page, /Personen & Zugriff/);
  await expect(page.getByRole('radiogroup', { name: 'Zugriff' })).toBeVisible();
}

const toggle = (page: Page, title: string) => page.getByRole('switch', { name: `${title} für ${NAME}` });
const rightsOf = async (request: APIRequestContext) => {
  const info = (await (await request.get('/api/access')).json()) as { people: { id: string; permissions: string[] }[] };
  return info.people.find((p) => p.id === memberId)!.permissions;
};

test.beforeAll(async ({ request }) => {
  oldDueTime = ((await (await request.get('/api/settings')).json()) as { defaultDueTime: string }).defaultDueTime;
  const res = await request.post('/api/access/people', { data: { haUserId: headers['x-remote-user-id'], name: NAME } });
  expect(res.status()).toBe(201);
  memberId = (await res.json()).id;
});

test.afterAll(async ({ request }) => {
  await request.put('/api/settings', { data: { defaultDueTime: oldDueTime === '09:00' ? null : oldDueTime } });
  await request.patch(`/api/access/people/${memberId}`, { data: { permissions: [] } });
  await request.delete(`/api/access/people/${memberId}`);
});

test('ohne Berechtigung sieht ein Mitglied keine Schalter, keine Seiten und der Server sagt nein', async ({ browser, baseURL }) => {
  const { ctx, page } = await member(browser, String(baseURL));
  try {
    await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Sprache und Farbe' })).toBeVisible();
    for (const name of ['Personen & Zugriff', 'Termine', 'Symbole', 'Vorlagen', 'Wächter', 'Ansage und Lampe']) {
      await expect(dialog.getByRole('button', { name: new RegExp(`^${name}`) }), name).toHaveCount(0);
    }
    await expect(page.getByTestId(/^permissions-/)).toHaveCount(0);
    expect((await ctx.request.put('/api/settings', { data: { defaultDueTime: '07:45' } })).status()).toBe(403);
    expect((await ctx.request.patch(`/api/access/people/${memberId}`, { data: { permissions: ['settings'] } })).status()).toBe(403);
    expect(((await (await ctx.request.get('/api/me')).json()) as { permissions: string[] }).permissions).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test('der Administrator sieht je Person „Berechtigungen“ (Administrator: Hinweis) und gibt „App-Einstellungen“; das Mitglied folgt sofort', async ({ page, browser, baseURL }) => {
  const { ctx, page: mem } = await member(browser, String(baseURL));
  if (SHOTS) await Promise.all([page.setViewportSize({ width: 390, height: 844 }), mem.setViewportSize({ width: 390, height: 844 })]);
  try {
    await page.goto('/');
    await openPeople(page);
    // Administrator: nur der Hinweis
    await page.getByRole('dialog').getByRole('button', { name: /Rene/ }).first().click();
    await expect(page.getByText('Administratoren dürfen alles.')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: /Rene/ }).first().click();
    // Mitglied: sechs Schalter, alle aus
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(NAME) }).first().click();
    const box = page.getByTestId(`permissions-${memberId}`);
    await expect(box).toBeVisible();
    await expect(box.getByRole('switch')).toHaveCount(6);
    await expect(box.getByRole('switch', { checked: true })).toHaveCount(0);
    await expect(box).toContainText('Nicht dabei: Dashboard und Panel-Pfad');
    await box.scrollIntoViewIfNeeded();
    if (SHOTS) {
      await box.getByRole('switch').last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/berechtigungen-admin-${test.info().project.name}.png` });
    }

    await toggle(page, 'App-Einstellungen').click();
    await expect(toggle(page, 'App-Einstellungen')).toHaveAttribute('aria-checked', 'true');
    expect(await rightsOf(page.request)).toEqual(['settings']);

    // Das Mitglied hat die Seite nicht neu geladen und sieht trotzdem die neuen Seiten
    await mem.getByRole('button', { name: 'Einstellungen öffnen' }).click();
    const dialog = mem.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: /^Termine/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Symbole/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Personen & Zugriff/ })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /^Dashboard-Button/ })).toHaveCount(0); // Panel-Pfad bleibt bei Administratoren
    await dialog.getByRole('button', { name: /^Termine/ }).click();
    const time = mem.getByLabel('Standard-Uhrzeit für Termine');
    await expect(time).toBeEnabled();
    // WebKit löst bei fill() an einem Zeitfeld kein „change“ aus: Ereignis von Hand
    await time.evaluate((el: HTMLInputElement) => {
      el.value = '07:45';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect.poll(async () => ((await (await page.request.get('/api/settings')).json()) as { defaultDueTime: string }).defaultDueTime).toBe('07:45');
    // Panel-Pfad: auch mit dem Recht verboten
    expect((await ctx.request.put('/api/settings', { data: { panelPath: '/stups' } })).status()).toBe(403);

    // Entzogen: der Server sagt wieder nein, die Seite verschwindet
    await toggle(page, 'App-Einstellungen').click();
    await expect(toggle(page, 'App-Einstellungen')).toHaveAttribute('aria-checked', 'false');
    await expect(mem.getByLabel('Standard-Uhrzeit für Termine')).toBeDisabled();
    expect((await ctx.request.put('/api/settings', { data: { defaultDueTime: '06:00' } })).status()).toBe(403);
  } finally {
    await ctx.close();
  }
});

test('mit „Personen“ sieht das Mitglied die Liste ohne Berechtigungen, Rollen und Entfernen; Rechte vergeben bleibt verboten', async ({ page, browser, baseURL }) => {
  const { ctx, page: mem } = await member(browser, String(baseURL));
  if (SHOTS) await Promise.all([page.setViewportSize({ width: 390, height: 844 }), mem.setViewportSize({ width: 390, height: 844 })]);
  try {
    await page.goto('/');
    await openPeople(page);
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(NAME) }).first().click();
    await toggle(page, 'Personen').click();
    await expect(toggle(page, 'Personen')).toHaveAttribute('aria-checked', 'true');

    await openPeopleAsMember(mem);
    await mem.getByRole('dialog').getByRole('button', { name: /Rene/ }).first().click();
    await expect(mem.getByLabel('Anzeigename von Rene')).toBeVisible();
    await expect(mem.getByRole('heading', { name: 'Person hinzufügen' })).toBeVisible();
    await expect(mem.getByTestId(/^permissions-/)).toHaveCount(0);
    await expect(mem.getByTestId('child-setup')).toHaveCount(0);
    await expect(mem.getByRole('button', { name: 'Aus Stups entfernen' })).toHaveCount(0);
    await expect(mem.getByRole('radio', { name: 'Nur diese Personen' })).toBeDisabled();
    if (SHOTS) {
      await mem.screenshot({ path: `${SHOTS}/berechtigungen-mitglied-personen-${test.info().project.name}.png` });
    }

    // Der Server: kein Rechte-Vergeben, keine Rolle, kein Entfernen
    for (const data of [{ permissions: ['watchers'] }, { isChild: true }]) {
      expect((await ctx.request.patch(`/api/access/people/${memberId}`, { data })).status()).toBe(403);
    }
    expect((await ctx.request.delete(`/api/access/people/${memberId}`)).status()).toBe(403);
    expect(await rightsOf(page.request)).toEqual(['people']);
  } finally {
    await ctx.close();
    await page.request.patch(`/api/access/people/${memberId}`, { data: { permissions: [] } });
  }
});

async function openPeopleAsMember(page: Page) {
  await page.reload();
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Personen & Zugriff/ }).click();
  await expect(page.getByRole('heading', { name: 'Personen', exact: true })).toBeVisible();
}

test('ein Kind bekommt keine Berechtigungen: kein Bereich in der Liste, der Server lehnt ab', async ({ page, request }) => {
  expect((await request.patch(`/api/access/people/${memberId}`, { data: { isChild: true } })).status()).toBe(200);
  try {
    await page.goto('/');
    await openPeople(page);
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(NAME) }).first().click();
    await expect(page.getByTestId(`child-setup`)).toBeVisible();
    await expect(page.getByTestId(`permissions-${memberId}`)).toHaveCount(0);
    expect((await request.patch(`/api/access/people/${memberId}`, { data: { permissions: ['watchers'] } })).status()).toBe(409);
  } finally {
    await request.patch(`/api/access/people/${memberId}`, { data: { isChild: false } });
  }
});
