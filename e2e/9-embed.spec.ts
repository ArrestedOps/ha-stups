import { expect, test } from '@playwright/test';
import { openBoards } from './helpers';

// Das iPhone meldet Statusleisten- und Home-Balken-Abstand auch an Seiten im iframe, Home Assistant hält ihn aber schon frei.
// Eingebettet darf Stups ihn deshalb nicht noch einmal einrechnen (sonst leere Streifen oben und unten).
test('Eingebettet in einem iframe zählt Stups die Sicherheitsabstände nicht doppelt', async ({ page, baseURL }) => {
  await page.goto('/');
  await openBoards(page);
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

// Die Leiste unten hat im Browser Platz für den Home-Balken (mindestens 30 px). In Home Assistant hält die Companion App
// diesen Platz schon frei: Dort darf die Leiste keinen eigenen Leerraum mehr lassen, sonst steht sie zu hoch.
test('Leiste unten: im Browser mit Platz für den Home-Balken, in Home Assistant (iframe) ohne zusätzlichen Leerraum', async ({ page, baseURL }) => {
  const gap = () => {
    const nav = document.querySelector('nav[aria-label]') as HTMLElement;
    const labels = [...nav.querySelectorAll('button')].map((b) => b.getBoundingClientRect().bottom);
    return { lowestButton: Math.max(...labels), viewport: window.innerHeight, padBottom: parseFloat(getComputedStyle(nav).paddingBottom) };
  };

  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Ansicht' })).toBeVisible();
  const direct = await page.evaluate(gap);
  expect(direct.padBottom).toBeGreaterThanOrEqual(30);
  expect(direct.viewport - direct.lowestButton).toBeGreaterThanOrEqual(30);

  await page.setContent(`<iframe id="f" src="${baseURL}/" style="width:390px;height:700px;border:0"></iframe>`);
  await expect(page.frameLocator('#f').getByRole('navigation', { name: 'Ansicht' })).toBeVisible();
  const handle = await page.locator('#f').elementHandle();
  const inner = await (await handle!.contentFrame())!.evaluate(gap);
  expect(inner.padBottom).toBeLessThanOrEqual(12);
  expect(inner.viewport - inner.lowestButton).toBeLessThanOrEqual(12);
});
