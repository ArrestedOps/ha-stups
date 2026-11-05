import { expect, test, type Browser, type Page } from '@playwright/test';

// Home-Knopf im Kopf aller Reiter (neben der Glocke) und die Dashboard-Wahl pro Person (Einstellungen › Home Assistant › Dashboard).
// Wie im Ingress: Die Elternseite hat denselben Ursprung wie Stups (hier /healthz) und hält Stups in einem iframe; der Knopf setzt
// die Adresse der Elternseite (history.pushState wie bei goToDashboard).
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

/** Elternseite mit Stups im iframe; `defaultPanel` ist, was Home Assistant im Browser-Speicher als Standard-Dashboard hält */
async function embedded(page: Page, baseURL: string | undefined, defaultPanel: string | null): Promise<ReturnType<Page['frameLocator']>> {
  await page.goto(`${baseURL}/healthz`);
  await page.evaluate((panel) => {
    if (panel === null) localStorage.removeItem('defaultPanel');
    else localStorage.setItem('defaultPanel', JSON.stringify(panel));
    document.body.style.margin = '0';
    document.body.innerHTML = '<iframe id="f" src="/" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>';
  }, defaultPanel);
  const frame = page.frameLocator('#f');
  await expect(frame.getByRole('navigation', { name: 'Ansicht' })).toBeVisible();
  return frame;
}

const parentPath = (page: Page) => page.evaluate(() => window.location.pathname);

test('Kopfzeile: auf allen drei Reitern steht Home links neben der Glocke, dann Zahnrad und Profil, jeder Knopf 44 × 44', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Ansicht' });
  for (const tab of ['Aufgaben', 'Boards', 'Wächter']) {
    await nav.getByRole('button', { name: tab }).click();
    await expect(page.getByRole('heading', { name: tab, exact: true })).toBeVisible();
    const boxes = [];
    for (const name of ['Zurück zu Home Assistant', /^Mitteilungen/, 'Einstellungen öffnen', 'Profil öffnen']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box, String(name)).not.toBeNull();
      boxes.push(box!);
    }
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.x).toBeGreaterThan(boxes[i - 1]!.x + boxes[i - 1]!.width - 1);
    for (const b of boxes) {
      expect(b.width).toBeGreaterThanOrEqual(43.5);
      expect(b.height).toBeGreaterThanOrEqual(43.5);
    }
    // alle in einer Zeile, rechts vom Logo und der Wortmarke
    expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1);
    const mark = await page.getByText('stups', { exact: false }).first().boundingBox();
    expect(boxes[0]!.x).toBeGreaterThan(mark!.x + mark!.width);
  }
});

test('Home-Knopf: ein Tipp führt das Elternfenster zum Standard-Dashboard aus Home Assistant (defaultPanel)', async ({ page, baseURL }) => {
  const frame = await embedded(page, baseURL, 'dashboard-wohnung');
  await frame.getByRole('button', { name: 'Zurück zu Home Assistant' }).click();
  await expect.poll(() => parentPath(page)).toBe('/dashboard-wohnung');
});

test('ohne Angabe in Home Assistant: die Option der App, sonst die Startseite', async ({ page, baseURL, request }) => {
  const settings = (await (await request.get('/api/settings')).json()) as { effectiveDashboardPath: string };
  const frame = await embedded(page, baseURL, null);
  await frame.getByRole('button', { name: 'Zurück zu Home Assistant' }).click();
  await expect.poll(() => parentPath(page)).toBe(settings.effectiveDashboardPath);
});

test('Dashboard wählen: Standard ist vorausgewählt und beschriftet; die eigene Wahl gilt, bleibt nach dem Neuladen und wird wieder zurückgesetzt', async ({ page, baseURL, request }) => {
  try {
    const frame = await embedded(page, baseURL, 'dashboard-wohnung');
    await frame.getByRole('button', { name: 'Einstellungen öffnen' }).click();
    const dialog = frame.getByRole('dialog', { name: 'Einstellungen' });
    await dialog.getByRole('button', { name: 'Dashboard', exact: true }).click();
    const choose = frame.getByRole('dialog', { name: 'Dashboard' }); // die Unterseite heißt wie ihr Titel
    const def = choose.getByRole('button', { name: /^Standard \(Home Assistant: /, pressed: true });
    await expect(def).toBeVisible();
    await expect(def).toContainText('dashboard-wohnung');

    // eigener Pfad
    await choose.getByRole('button', { name: /^Eigener Pfad/ }).click();
    await choose.getByLabel('Eigener Pfad', { exact: true }).fill('https://evil.example');
    await choose.getByRole('button', { name: 'Speichern' }).click();
    await expect(choose.getByRole('button', { name: /^Eigener Pfad/, pressed: true })).toHaveCount(0); // abgelehnt, nichts gespeichert
    await choose.getByLabel('Eigener Pfad', { exact: true }).fill(`/dashboard-${tag}`);
    await choose.getByRole('button', { name: 'Speichern' }).click();
    await expect(choose.getByRole('button', { name: /^Eigener Pfad/, pressed: true })).toContainText(`/dashboard-${tag}`);
    expect(((await (await request.get('/api/me')).json()) as { user: { dashboardPath: string | null } }).user.dashboardPath).toBe(`/dashboard-${tag}`);

    // nach dem Neuladen wiedergefunden, und der Home-Knopf folgt der eigenen Wahl (nicht dem Standard von Home Assistant)
    const again = await embedded(page, baseURL, 'dashboard-wohnung');
    await again.getByRole('button', { name: 'Einstellungen öffnen' }).click();
    await again.getByRole('dialog', { name: 'Einstellungen' }).getByRole('button', { name: 'Dashboard', exact: true }).click();
    await expect(again.getByRole('dialog', { name: 'Dashboard' }).getByRole('button', { name: /^Eigener Pfad/, pressed: true })).toContainText(`/dashboard-${tag}`);
    await page.keyboard.press('Escape'); // der Fokus liegt im iframe
    await again.getByRole('button', { name: 'Zurück zu Home Assistant' }).click();
    await expect.poll(() => parentPath(page)).toBe(`/dashboard-${tag}`);
  } finally {
    expect((await request.put('/api/me/dashboard', { data: { path: null } })).status()).toBe(204);
  }
});

test('Server prüft den Pfad: Falsches gibt 400, nie 500', async ({ request }) => {
  for (const path of ['https://evil.example', '//evil.example', 'kein-schraegstrich', '/a\\b', `/${'x'.repeat(250)}`, 5]) {
    const res = await request.put('/api/me/dashboard', { data: { path } });
    expect(res.status(), String(path)).toBe(400);
  }
});

async function kidContext(browser: Browser, baseURL: string | undefined, id: string, name: string) {
  const ctx = await browser.newContext({
    baseURL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 390, height: 780 },
    extraHTTPHeaders: { 'x-remote-user-id': `ha-kid-${id}`, 'x-remote-user-name': `kid${id}`, 'x-remote-user-display-name': name, 'x-stups-language': 'de' },
  });
  return { ctx, page: await ctx.newPage() };
}

test('Kind: Home-Knopf mit dem Standard, keine Dashboard-Wahl, die Route ist verboten', async ({ browser, baseURL, request }) => {
  const name = `Kind${tag}`;
  const kid = (await (await request.post('/api/access/people', { data: { name, haUserId: `ha-kid-${tag}` } })).json()) as { id: string };
  await request.patch(`/api/access/people/${kid.id}`, { data: { isChild: true, childScope: 'assigned', quietOff: true } });
  const { ctx, page } = await kidContext(browser, baseURL, tag, name);
  try {
    // das Kind hat nichts gewählt (kann es nicht) und bekommt den Standard von Home Assistant
    const frame = await embedded(page, baseURL, 'dashboard-kinder');
    await frame.getByRole('button', { name: 'Einstellungen öffnen' }).click();
    const dialog = frame.getByRole('dialog', { name: 'Einstellungen' });
    await expect(dialog.getByRole('button', { name: 'Sprache und Farbe' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Dashboard', exact: true })).toHaveCount(0);
    expect((await ctx.request.put('/api/me/dashboard', { data: { path: '/lovelace' } })).status()).toBe(403);
    expect((await ctx.request.get('/api/ha/dashboards')).status()).toBe(403);
    await page.keyboard.press('Escape');
    await frame.getByRole('button', { name: 'Zurück zu Home Assistant' }).click();
    await expect.poll(() => parentPath(page)).toBe('/dashboard-kinder');
  } finally {
    await ctx.close();
    await request.delete(`/api/access/people/${kid.id}`);
  }
});
