import { expect, test } from '@playwright/test';
import { openBoards } from './helpers';

test('Live-Sync: Änderung auf Gerät A erscheint auf Gerät B ohne Neuladen', async ({ browser }) => {
  const contextA = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const contextB = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  // Beide Fenster müssen am Ende zu: Offen bleiben sie verbunden und laden bei jeder Änderung der folgenden Tests alles neu,
  // das machte die nächsten Tests so träge, dass sie in die Zeitgrenze liefen
  try {
    const a = await contextA.newPage();
    const b = await contextB.newPage();
    for (const p of [a, b]) {
      await p.goto('/');
      await openBoards(p);
      await p.getByRole('tab', { name: /^Offen/ }).click();
    }
    // B ist verbunden, bevor A etwas ändert
    await expect(b.getByText('Offline')).toHaveCount(0);

    const title = `Sync ${Date.now().toString(36)}`;
    await a.getByRole('button', { name: 'Neue Aufgabe', exact: true }).click();
    await a.getByLabel('Was steht an?').fill(title);
    await a.getByRole('button', { name: 'Aufgabe anlegen' }).click();

    await expect(b.locator('[role=presentation]').filter({ hasText: title })).toBeVisible({ timeout: 8000 });

    // und wieder zurück: A erledigt, B sieht die Aufgabe nicht mehr in „Offen"
    await a.getByRole('checkbox', { name: `„${title}“ erledigen` }).click();
    await expect(b.locator('[role=presentation]').filter({ hasText: title })).toHaveCount(0, { timeout: 8000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

