import { expect, test, type Page } from '@playwright/test';

// Läuft in den normalen Projekten (Server ohne Home Assistant): der Reiter „Wächter" für Administratoren und Mitglieder
const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });

test('Reiter „Wächter": ohne Home Assistant erklärt er, warum es nichts zu sehen gibt', async ({ page }) => {
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await expect(page.getByText('Keine Verbindung zu Home Assistant')).toBeVisible();
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
    await expect(page.getByRole('button', { name: 'Wächter hinzufügen' })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test('Zahnrad oben rechts: auf jedem Reiter öffnet es die Einstellungen, ohne die Seite zu verbreitern', async ({ page }) => {
  await page.goto('/');
  for (const tab of ['Boards', 'Agenda', 'Kalender', 'Wächter']) {
    await nav(page).getByRole('button', { name: tab }).click();
    const gear = page.getByRole('button', { name: 'Einstellungen öffnen' });
    await expect(gear).toBeVisible();
    const box = (await gear.boundingBox())!;
    const width = page.viewportSize()!.width;
    expect(box.x + box.width).toBeLessThanOrEqual(width); // nicht abgeschnitten
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await gear.click();
    await expect(page.getByRole('dialog').getByText('Einstellungen', { exact: true }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('In den Einstellungen führt „Wächter" zum Reiter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Wächter/ }).click();
  await expect(nav(page).getByRole('button', { name: 'Wächter' })).toHaveAttribute('aria-current', 'page');
});
