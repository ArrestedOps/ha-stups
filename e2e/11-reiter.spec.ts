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

test('In den Einstellungen führt „Wächter" zum Reiter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Wächter/ }).click();
  await expect(nav(page).getByRole('button', { name: 'Wächter' })).toHaveAttribute('aria-current', 'page');
});
