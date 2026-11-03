import { expect, test, type Page } from '@playwright/test';

// Läuft in den normalen Projekten (Server ohne Home Assistant): die vier Reiter und die gemeinsame Kopfzeile
const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });

// Dieser Test prüft den Start auf „Heute", nicht die Boards
test.describe('Start', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Die App startet auf „Heute"; Zuhause und alte Namen werden nicht gemerkt', async ({ page }) => {
    await page.goto('/');
    await expect(nav(page).getByRole('button', { name: 'Heute' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Heute' })).toBeVisible();
    await page.evaluate(() => localStorage.setItem('stups.tab', 'agenda'));
    await page.reload();
    await expect(nav(page).getByRole('button', { name: 'Heute' })).toHaveAttribute('aria-current', 'page');
    // Zuhause wird nicht gemerkt: die App startet auf Heute (auch mit dem alten Namen „watchers")
    await page.evaluate(() => localStorage.setItem('stups.tab', 'watchers'));
    await page.reload();
    await expect(nav(page).getByRole('button', { name: 'Heute' })).toHaveAttribute('aria-current', 'page');
    await nav(page).getByRole('button', { name: 'Zuhause' }).click();
    await page.reload();
    await expect(nav(page).getByRole('button', { name: 'Heute' })).toHaveAttribute('aria-current', 'page');
    // Boards und Kalender werden gemerkt
    await nav(page).getByRole('button', { name: 'Kalender' }).click();
    await page.reload();
    await expect(nav(page).getByRole('button', { name: 'Kalender' })).toHaveAttribute('aria-current', 'page');
    await page.evaluate(() => localStorage.setItem('stups.tab', 'unsinn'));
    await page.reload();
    await expect(nav(page).getByRole('button', { name: 'Heute' })).toHaveAttribute('aria-current', 'page');
  });
});

test('Reiter „Zuhause": ohne Home Assistant erklärt er, warum es nichts zu sehen gibt', async ({ page }) => {
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Zuhause' }).click();
  await expect(page.getByText('Keine Verbindung zu Home Assistant').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wächter hinzufügen' })).toHaveCount(0);
  await expect(nav(page).getByRole('button', { name: 'Zuhause' })).toHaveAttribute('aria-current', 'page');
});

test('Reiter „Zuhause": auch Mitglieder (keine Administratoren) sehen ihn, nur lesend', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({
    baseURL: String(baseURL),
    extraHTTPHeaders: { 'x-remote-user-id': 'ha-conny-e2e', 'x-remote-user-name': 'conny', 'x-remote-user-display-name': 'Conny' },
  });
  const page = await ctx.newPage();
  try {
    await page.goto('/');
    await expect(nav(page).getByRole('button', { name: 'Zuhause' })).toBeVisible();
    await nav(page).getByRole('button', { name: 'Zuhause' }).click();
    await expect(nav(page).getByRole('button', { name: 'Zuhause' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Wächter einrichten' })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test('Kopfzeile: auf jedem Reiter der Avatar oben rechts öffnet die Einstellungen, ohne die Seite zu verbreitern', async ({ page }) => {
  await page.goto('/');
  for (const tab of ['Heute', 'Boards', 'Kalender', 'Zuhause']) {
    await nav(page).getByRole('button', { name: tab }).click();
    const avatar = page.getByRole('button', { name: 'Einstellungen öffnen' });
    await expect(avatar).toBeVisible();
    const box = (await avatar.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); // Trefferfläche
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width); // nicht abgeschnitten
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await avatar.click();
    await expect(page.getByRole('dialog').getByText('Einstellungen', { exact: true }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('In den Einstellungen steht „Wächter" unter Haushalt', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Wächter/ }).click();
  await expect(page.getByRole('dialog').getByText('Karten, die von selbst aus Home Assistant entstehen')).toBeVisible();
});
