import { expect, test } from '@playwright/test';

// Läuft in den normalen Projekten (Server ohne Home Assistant): der Reiter „Wächter" für Administratoren und andere
const nav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Ansicht' });

test('Reiter „Wächter": Administratoren sehen ihn immer, ohne Home Assistant mit einer Erklärung', async ({ page }) => {
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await expect(page.getByText('Keine Verbindung zu Home Assistant')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wächter hinzufügen' })).toHaveCount(0);
  await expect(nav(page).getByRole('button', { name: 'Wächter' })).toHaveAttribute('aria-current', 'page');
});

test('Reiter „Wächter": Wer kein Administrator ist und keinen Wächter hat, sieht den Reiter nicht', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({
    baseURL: String(baseURL),
    extraHTTPHeaders: { 'x-remote-user-id': 'ha-conny-e2e', 'x-remote-user-name': 'conny', 'x-remote-user-display-name': 'Conny' },
  });
  // ein vorher gemerkter Reiter „Wächter" darf nicht hängen bleiben
  await ctx.addInitScript(() => localStorage.setItem('stups.tab', 'watchers'));
  const page = await ctx.newPage();
  try {
    await page.goto('/');
    await expect(nav(page).getByRole('button', { name: 'Kalender' })).toBeVisible();
    await expect(nav(page).getByRole('button', { name: 'Wächter' })).toHaveCount(0);
    await expect(nav(page).getByRole('button', { name: 'Boards' })).toHaveAttribute('aria-current', 'page');
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
