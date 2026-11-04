import { expect, test, type Page } from '@playwright/test';

// Läuft in den normalen Projekten (Server ohne Home Assistant-Verbindung): die drei Reiter und die gemeinsame Kopfzeile
const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });

// Dieser Test prüft den Start auf „Aufgaben", nicht die Boards
test.describe('Start', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Drei Reiter, die App startet auf „Aufgaben"; Wächter und alte Namen werden abgebildet, nur Boards wird gemerkt', async ({ page }) => {
    await page.goto('/');
    await expect(nav(page).getByRole('button')).toHaveText(['Aufgaben', 'Boards', 'Wächter']);
    await expect(nav(page).getByRole('button', { name: 'Aufgaben' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Aufgaben' })).toBeVisible();
    // alte gemerkte Namen: Heute, Agenda und Kalender sind jetzt Aufgaben; Zuhause und „watchers" führen auch zu Aufgaben (Start)
    for (const old of ['today', 'agenda', 'calendar', 'home', 'watchers', 'unsinn']) {
      await page.evaluate((v) => localStorage.setItem('stups.tab', v), old);
      await page.reload();
      await expect(nav(page).getByRole('button', { name: 'Aufgaben' }), old).toHaveAttribute('aria-current', 'page');
    }
    // Wächter wird nicht gemerkt
    await nav(page).getByRole('button', { name: 'Wächter' }).click();
    await page.reload();
    await expect(nav(page).getByRole('button', { name: 'Aufgaben' })).toHaveAttribute('aria-current', 'page');
    // Boards wird gemerkt
    await nav(page).getByRole('button', { name: 'Boards' }).click();
    await page.reload();
    await expect(nav(page).getByRole('button', { name: 'Boards' })).toHaveAttribute('aria-current', 'page');
  });

  test('Die frühere Kalenderansicht bleibt lesbar: gemerkte Woche öffnet Aufgaben in der Wochenansicht', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('stups.calmode', 'week'));
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Woche' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('calendar-grid')).toBeVisible();
  });
});

test('Reiter „Wächter": ohne Home Assistant erklärt er, warum es nichts zu sehen gibt', async ({ page }) => {
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await expect(page.getByText('Keine Verbindung zu Home Assistant').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wächter hinzufügen' })).toHaveCount(0);
  await expect(nav(page).getByRole('button', { name: 'Wächter' })).toHaveAttribute('aria-current', 'page');
});

test('Reiter „Wächter": auch Mitglieder (keine Administratoren) sehen ihn, nur lesend', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({
    baseURL: String(baseURL),
    extraHTTPHeaders: { 'x-remote-user-id': 'ha-conny-e2e', 'x-remote-user-name': 'conny', 'x-remote-user-display-name': 'Conny' },
  });
  const page = await ctx.newPage();
  try {
    await page.goto('/');
    await expect(nav(page).getByRole('button', { name: 'Wächter' })).toBeVisible();
    await nav(page).getByRole('button', { name: 'Wächter' }).click();
    await expect(nav(page).getByRole('button', { name: 'Wächter' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Wächter einrichten' })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test('Kopfzeile: auf jedem Reiter der Avatar oben rechts öffnet die Einstellungen, ohne die Seite zu verbreitern', async ({ page }) => {
  await page.goto('/');
  for (const tab of ['Aufgaben', 'Boards', 'Wächter']) {
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
