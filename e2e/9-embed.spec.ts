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

// Home Assistant ab 2026.8: Das App-Panel polstert den iframe selbst. Stups meldet sich mit handleSafeArea an, bekommt die Abstände
// als `home-assistant/properties` zurück, und die Leiste unten reicht bis zum Rand und hält den Home-Balken frei.
// Die Elternseite spielt das Panel nach (Anmeldung prüfen, Polsterung des iframes entfernen, Antwort senden).
const panelPage = (src: string, insets: object | null) => `
  <style>html,body{margin:0;background:#222}iframe{display:block;box-sizing:border-box;width:390px;height:700px;border:0;padding:0 0 34px}</style>
  <iframe id="f" src="${src}"></iframe>
  <script>
    window.subscribed = [];
    window.addEventListener('message', (e) => {
      const f = document.getElementById('f');
      if (e.source !== f.contentWindow || !e.data || e.data.type !== 'home-assistant/subscribe-properties') return;
      window.subscribed.push(e.data);
      if (e.data.handleSafeArea) f.style.padding = '0';
      ${insets ? `f.contentWindow.postMessage({ type: 'home-assistant/properties', narrow: true, route: {}, safeAreaInsets: ${JSON.stringify(insets)} }, '*');` : ''}
    });
  </script>`;

test('Home Assistant 2026.8: Stups übernimmt die Sicherheitsabstände, die Leiste füllt bis zum unteren Rand ohne Streifen', async ({ page, baseURL }) => {
  await page.setContent(panelPage(`${baseURL}/`, { top: '47px', right: '0px', bottom: '34px', left: '0px' }));
  const frame = page.frameLocator('#f');
  await expect(frame.getByRole('navigation', { name: 'Ansicht' })).toBeVisible();
  const inner = await (await (await page.locator('#f').elementHandle())!.contentFrame())!;
  await expect.poll(() => inner.evaluate(() => document.documentElement.classList.contains('safe-managed'))).toBe(true);

  // angemeldet mit handleSafeArea
  expect(await page.evaluate(() => (window as unknown as { subscribed: unknown[] }).subscribed)).toEqual([{ type: 'home-assistant/subscribe-properties', handleSafeArea: true }]);

  const m = await inner.evaluate(() => {
    const root = document.documentElement;
    const nav = document.querySelector('nav[aria-label]') as HTMLElement;
    const navBox = nav.getBoundingClientRect();
    const lowest = Math.max(...[...nav.querySelectorAll('button')].map((b) => b.getBoundingClientRect().bottom));
    const atBottom = document.elementFromPoint(20, window.innerHeight - 1);
    return {
      top: getComputedStyle(root).getPropertyValue('--safe-top').trim(),
      bottom: getComputedStyle(root).getPropertyValue('--safe-bottom').trim(),
      viewport: window.innerHeight,
      navBottom: navBox.bottom,
      padBottom: parseFloat(getComputedStyle(nav).paddingBottom),
      belowButtons: window.innerHeight - lowest,
      bottomPixelIsNav: !!atBottom && nav.contains(atBottom),
    };
  });
  expect(m.top).toBe('47px');
  expect(m.bottom).toBe('34px');
  // der iframe ist 700 px hoch (Polsterung entfernt): die Leiste endet genau am unteren Rand und deckt den letzten Pixel ab
  expect(m.viewport).toBe(700);
  expect(m.navBottom).toBe(700);
  expect(m.bottomPixelIsNav).toBe(true);
  // die Knöpfe stehen über der Home-Balken-Zone
  expect(m.padBottom).toBeGreaterThanOrEqual(34);
  expect(m.belowButtons).toBeGreaterThanOrEqual(34);
});

test('Home Assistant vor 2026.8 (keine Antwort): wie bisher, kleiner Rand und keine Abstände von Stups', async ({ page, baseURL }) => {
  await page.setContent(panelPage(`${baseURL}/`, null));
  await expect(page.frameLocator('#f').getByRole('navigation', { name: 'Ansicht' })).toBeVisible();
  const inner = (await (await page.locator('#f').elementHandle())!.contentFrame())!;
  await page.waitForTimeout(500);
  const m = await inner.evaluate(() => ({
    managed: document.documentElement.classList.contains('safe-managed'),
    top: getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim(),
    pad: parseFloat(getComputedStyle(document.querySelector('nav[aria-label]')!).paddingBottom),
  }));
  expect(m).toEqual({ managed: false, top: '0px', pad: 8 });
});

test('Home Assistant mit eigener Leiste oben: der Abstand oben wird nicht doppelt gezählt (gleicher Ursprung)', async ({ page, baseURL }) => {
  // gleicher Ursprung wie Stups: so kann Stups die Lage des iframes lesen (wie im Ingress)
  await page.goto(`${baseURL}/healthz`);
  await page.evaluate(() => {
    document.body.innerHTML = '<div style="height:87px;background:#333"></div><iframe id="f" src="/" style="display:block;width:390px;height:600px;border:0"></iframe>';
    window.addEventListener('message', (e) => {
      const f = document.getElementById('f') as HTMLIFrameElement;
      if (e.source !== f.contentWindow || e.data?.type !== 'home-assistant/subscribe-properties') return;
      f.contentWindow!.postMessage({ type: 'home-assistant/properties', narrow: true, route: {}, safeAreaInsets: { top: '47px', right: '0px', bottom: '0px', left: '0px' } }, '*');
    });
  });
  const inner = (await (await page.locator('#f').elementHandle())!.contentFrame())!;
  await expect.poll(() => inner.evaluate(() => document.documentElement.classList.contains('safe-managed'))).toBe(true);
  expect(await inner.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim())).toBe('0px');
});
