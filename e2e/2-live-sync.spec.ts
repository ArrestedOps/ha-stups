import { expect, test } from '@playwright/test';

test('Live-Sync: Änderung auf Gerät A erscheint auf Gerät B ohne Neuladen', async ({ browser }) => {
  const a = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
  const b = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
  for (const p of [a, b]) {
    await p.goto('/');
    await p.getByRole('tab', { name: /^Offen/ }).click();
  }
  // B ist verbunden, bevor A etwas ändert
  await expect(b.getByText('Offline')).toHaveCount(0);

  const title = `Sync ${Date.now().toString(36)}`;
  await a.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await a.getByLabel('Titel').fill(title);
  await a.getByRole('button', { name: 'Anlegen' }).click();

  await expect(b.locator('[role=presentation]').filter({ hasText: title })).toBeVisible({ timeout: 8000 });

  // und wieder zurück: A erledigt, B sieht die Karte nicht mehr in „Offen"
  await a.getByRole('button', { name: `„${title}“ erledigen` }).click();
  await expect(b.locator('[role=presentation]').filter({ hasText: title })).toHaveCount(0, { timeout: 8000 });
});

