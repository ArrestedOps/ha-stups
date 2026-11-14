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
    return { lowestButton: Math.max(...labels), viewport: window.innerHeight, padBottom: parseFloat(getComputedStyle(document.querySelector('nav[aria-label]')!).bottom) + 12 };
  };

  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Ansicht' })).toBeVisible();
  const direct = await page.evaluate(gap);
  expect(direct.padBottom).toBeGreaterThanOrEqual(30);
  // die Leiste schwebt über dem Home-Balken: Platz unter den Knöpfen
  expect(direct.viewport - direct.lowestButton).toBeGreaterThanOrEqual(18);

  await page.setContent(`<iframe id="f" src="${baseURL}/" style="width:390px;height:700px;border:0"></iframe>`);
  await expect(page.frameLocator('#f').getByRole('navigation', { name: 'Ansicht' })).toBeVisible();
  const handle = await page.locator('#f').elementHandle();
  const inner = await (await handle!.contentFrame())!.evaluate(gap);
  expect(inner.padBottom).toBeLessThanOrEqual(12);
  expect(inner.viewport - inner.lowestButton).toBeLessThanOrEqual(20);
});

// Home Assistant ab 2026.8: Das App-Panel polstert den iframe selbst. Stups meldet sich mit handleSafeArea an, bekommt die Abstände
// als `home-assistant/properties` zurück, und die Leiste unten reicht bis zum Rand und hält den Home-Balken frei.
// Die Elternseite spielt das Panel nach (Anmeldung prüfen, Polsterung des iframes entfernen, Antwort senden).
const panelPage = (src: string, insets: object | null) => `
  <style>html,body{margin:0;background:#222}iframe{display:block;box-sizing:border-box;width:390px;height:700px;border:0;padding:47px 0 34px}</style>
  <iframe id="f" src="${src}"></iframe>
  <script>
    window.subscribed = [];
    window.addEventListener('message', (e) => {
      const f = document.getElementById('f');
      if (e.source !== f.contentWindow || !e.data || e.data.type !== 'home-assistant/subscribe-properties') return;
      window.subscribed.push(e.data);
      // wie ha-panel-app: handleSafeArea wird bei JEDER Anmeldung neu gelesen, die letzte Nachricht gilt
      f.style.padding = e.data.handleSafeArea ? '0' : '47px 0 34px';
      ${insets ? `f.contentWindow.postMessage({ type: 'home-assistant/properties', narrow: true, route: {}, safeAreaInsets: ${JSON.stringify(insets)} }, '*');` : ''}
    });
  </script>`;

test('Home Assistant 2026.8: Stups übernimmt die Sicherheitsabstände, die schwebende Leiste hält den Home-Balken frei', async ({ page, baseURL }) => {
  // Wie im Ingress: gleicher Ursprung wie Stups, der iframe füllt den Bildschirm (Home Assistant polstert ihn, solange es nicht anders gesagt wird)
  await page.goto(`${baseURL}/healthz`);
  await page.evaluate(() => {
    const w = window as unknown as { subscribed: { type: string; handleSafeArea?: boolean; kioskMode?: boolean }[] };
    w.subscribed = [];
    document.body.style.margin = '0';
    document.body.innerHTML = '<iframe id="f" src="/" style="position:fixed;inset:0;width:100%;height:100%;border:0;box-sizing:border-box;padding:47px 0 34px"></iframe>';
    window.addEventListener('message', (e) => {
      const f = document.getElementById('f') as HTMLIFrameElement;
      if (e.source !== f.contentWindow || e.data?.type !== 'home-assistant/subscribe-properties') return;
      w.subscribed.push(e.data);
      // wie ha-panel-app: handleSafeArea wird bei JEDER Anmeldung neu gelesen, die letzte Nachricht gilt
      f.style.padding = e.data.handleSafeArea ? '0' : '47px 0 34px';
      f.contentWindow!.postMessage({ type: 'home-assistant/properties', narrow: true, route: {}, safeAreaInsets: { top: '47px', right: '0px', bottom: '34px', left: '0px' } }, '*');
    });
  });
  const inner = (await (await page.locator('#f').elementHandle())!.contentFrame())!;
  await expect(inner.getByRole('navigation', { name: 'Ansicht' })).toBeVisible();
  await expect.poll(() => inner.evaluate(() => document.documentElement.classList.contains('safe-managed'))).toBe(true);

  // Jede Anmeldung (auch die für „HA-Kopfzeile ausblenden“) trägt handleSafeArea: true. Sonst schaltet die letzte Nachricht die Übernahme
  // wieder ab, das Panel polstert den iframe erneut, und die Abstände würden doppelt gezählt (viel Schwarz oben, Streifen unten).
  await page.waitForTimeout(2500); // die Kopfzeilen-Anmeldung folgt kurz nach dem Start
  const subs = await page.evaluate(() => (window as unknown as { subscribed: { type: string; handleSafeArea?: boolean; kioskMode?: boolean }[] }).subscribed);
  expect(subs.length).toBeGreaterThanOrEqual(2); // Abstände und Kiosk-Modus
  for (const s of subs) expect(s).toMatchObject({ type: 'home-assistant/subscribe-properties', handleSafeArea: true });
  expect(subs.some((s) => s.kioskMode === true)).toBe(true);
  // und das Panel polstert den iframe am Ende nicht
  expect(await page.locator('#f').evaluate((el) => getComputedStyle(el).padding)).toBe('0px');

  const screenH = await page.evaluate(() => window.innerHeight);
  const m = await inner.evaluate(() => {
    const root = document.documentElement;
    const nav = document.querySelector('nav[aria-label]') as HTMLElement;
    const lowest = Math.max(...[...nav.querySelectorAll('button')].map((b) => b.getBoundingClientRect().bottom));
    const atBottom = document.elementFromPoint(20, window.innerHeight - 1);
    const head = (document.querySelector('[data-testid=tasks] > *') as HTMLElement | null)?.getBoundingClientRect().top ?? -1;
    return {
      top: getComputedStyle(root).getPropertyValue('--safe-top').trim(),
      bottom: getComputedStyle(root).getPropertyValue('--safe-bottom').trim(),
      viewport: window.innerHeight,
      navBottom: nav.getBoundingClientRect().bottom,
      padBottom: parseFloat(getComputedStyle(nav).bottom) + 12,
      belowButtons: window.innerHeight - lowest,
      bottomPixelIsNav: !!atBottom && nav.contains(atBottom),
      contentTop: head,
    };
  });
  expect(m.top).toBe('47px');
  expect(m.bottom).toBe('34px');
  // der iframe füllt den Bildschirm: die Leiste endet genau am unteren Rand und deckt den letzten Pixel ab
  expect(Math.abs(m.viewport - screenH)).toBeLessThanOrEqual(1);
  // die Leiste schwebt (abgerundet, mit Abstand zum Rand); der Platz unter den Knöpfen hält die Home-Balken-Zone frei
  expect(m.navBottom).toBeLessThanOrEqual(m.viewport + 1);
  expect(m.padBottom).toBeGreaterThanOrEqual(34);
  expect(m.belowButtons).toBeGreaterThanOrEqual(22);
  // oben nur EINMAL der Abstand zur Statusleiste (47 px + 8 px Rand), nicht doppelt
  expect(m.contentTop).toBeGreaterThanOrEqual(47);
  expect(m.contentTop).toBeLessThan(47 + 40);
});

test('Home Assistant vor 2026.8 (keine Antwort): wie bisher, kleiner Rand und keine Abstände von Stups', async ({ page, baseURL }) => {
  await page.setContent(panelPage(`${baseURL}/`, null));
  await expect(page.frameLocator('#f').getByRole('navigation', { name: 'Ansicht' })).toBeVisible();
  const inner = (await (await page.locator('#f').elementHandle())!.contentFrame())!;
  await page.waitForTimeout(500);
  const m = await inner.evaluate(() => ({
    managed: document.documentElement.classList.contains('safe-managed'),
    top: getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim(),
    pad: parseFloat(getComputedStyle(document.querySelector('nav[aria-label]')!).bottom) + 12,
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
