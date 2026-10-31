import { expect, test } from '@playwright/test';

// Das iPhone meldet Statusleisten- und Home-Balken-Abstand auch an Seiten im iframe, Home Assistant hält ihn aber schon frei.
// Eingebettet darf Stups ihn deshalb nicht noch einmal einrechnen (sonst leere Streifen oben und unten).
test('Eingebettet in einem iframe zählt Stups die Sicherheitsabstände nicht doppelt', async ({ page, baseURL }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Ansicht' })).toBeVisible();
  const direct = await page.evaluate(() => document.documentElement.classList.contains('embedded'));
  expect(direct).toBe(false);

  await page.setContent(`<iframe id="f" src="${baseURL}/" style="width:390px;height:700px;border:0"></iframe>`);
  const frame = page.frameLocator('#f');
  await expect(frame.getByRole('navigation', { name: 'Ansicht' })).toBeVisible();
  const handle = await page.locator('#f').elementHandle();
  const inner = await (await handle!.contentFrame())!.evaluate(() => {
    const root = document.documentElement;
    return { embedded: root.classList.contains('embedded'), top: getComputedStyle(root).getPropertyValue('--safe-top').trim() };
  });
  expect(inner).toEqual({ embedded: true, top: '0px' });
});
