import { expect, test } from '@playwright/test';
import { openBoards } from './helpers';

// Spec: Ein Board mit 300 Karten bleibt flüssig, die erste Anzeige steht schnell.
test('Board mit 300 Karten: lädt zügig und scrollt flüssig', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'dunkel', 'einmal reicht, die Daten bleiben im Board');
  test.setTimeout(90_000);

  // Eigenes Board, damit die 300 Karten die übrigen Browser-Tests nicht verlangsamen
  const board = await (await request.post('/api/boards', { data: { name: 'Performance' } })).json();
  const view = await (await request.get(`/api/boards/${board.id}`)).json();
  const openId = view.columns[0].id;
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  // in Päckchen anlegen, damit der Server nicht gleichzeitig noch beschäftigt ist, wenn gemessen wird
  for (let block = 0; block < 3; block++) {
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        request.post(`/api/boards/${board.id}/cards`, { data: { title: `Masse ${block}${String(i).padStart(2, '0')}`, columnId: openId } }),
      ),
    );
  }
  await page.waitForTimeout(2000);

  // mittlere Ladezeit aus drei Versuchen (der erste ist durch kalte Caches immer langsamer)
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    await page.goto('/');
    await openBoards(page);
    await page.locator('[role=presentation]').first().waitFor();
    times.push(Date.now() - t0);
  }
  const median = [...times].sort((a, b) => a - b)[1]!;
  console.log(`300 Karten: Laden ${times.join('/')} ms`);
  // Grobe Schranke gegen Ausreißer nach oben (z. B. quadratischer Aufwand), keine Leistungsmessung:
  // Auf dem belasteten Entwicklungsrechner schwankten die Werte zwischen 0,5 und 3,7 s Laden und 9 bis 52 Bildern/s.
  expect(median).toBeLessThan(8000);

  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const list =
          [...document.querySelectorAll<HTMLElement>('*')].find((e) => e.scrollHeight > e.clientHeight + 200 && getComputedStyle(e).overflowY !== 'visible') ??
          document.scrollingElement!;
        let frames = 0;
        const start = performance.now();
        const step = () => {
          frames++;
          list.scrollTop += 40;
          if (performance.now() - start < 1000) requestAnimationFrame(step);
          else resolve(frames);
        };
        requestAnimationFrame(step);
      }),
  );
  console.log(`300 Karten: Scrollen ${fps} Bilder/s`);
  // Hier wird auf dem Hauptthread bei jedem Bild gescrollt, das ist härter als echtes Wischen auf dem iPhone
  expect(fps).toBeGreaterThan(4);
});

// Spec 1.13.0: Eine Änderung auf einem anderen Gerät holt nur die geänderte Karte, nicht das ganze Board.
test('Änderung auf einem zweiten Gerät: nur die geänderte Karte wird nachgeladen', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'dunkel', 'einmal reicht, die Daten bleiben im Board');
  test.setTimeout(120_000);

  const board = await (await request.post('/api/boards', { data: { name: 'Live-Sync 300' } })).json();
  const view = await (await request.get(`/api/boards/${board.id}`)).json();
  const openId = view.columns[0].id;
  const ids: string[] = [];
  for (let block = 0; block < 3; block++) {
    const made = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        request.post(`/api/boards/${board.id}/cards`, { data: { title: `Sync ${block}${String(i).padStart(2, '0')}`, columnId: openId } }).then((r) => r.json()),
      ),
    );
    ids.push(...made.map((c) => c.id));
  }
  await page.waitForTimeout(2000);
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  await page.goto('/');
  await openBoards(page);
  await expect(page.getByText('Sync 000', { exact: true })).toBeVisible();

  // Vorher (was jede Meldung bisher geladen hat): Boards, Personen, Board mit allen Karten, Wächter
  const full = async () => {
    const t0 = Date.now();
    const bodies = await Promise.all(['api/boards', 'api/people', `api/boards/${board.id}`, 'api/watchers'].map((u) => request.get(u).then((r) => r.body())));
    return { ms: Date.now() - t0, bytes: bodies.reduce((n, b) => n + b.length, 0) };
  };
  await full(); // kalt
  const before = await full();

  const seen: { url: string; bytes: number }[] = [];
  page.on('response', async (res) => {
    if (!res.url().includes('/api/')) return;
    const body = await res.body().catch(() => Buffer.alloc(0));
    seen.push({ url: new URL(res.url()).pathname + new URL(res.url()).search, bytes: body.length });
  });

  // Gerät 2 ändert eine Karte
  const t0 = Date.now();
  const patched = await request.patch(`/api/cards/${ids[0]}`, { data: { title: 'Auf Gerät 2 geändert' } });
  expect(patched.ok()).toBe(true);
  await expect(page.getByText('Auf Gerät 2 geändert', { exact: true })).toBeVisible();
  const delta = Date.now() - t0;
  await page.waitForTimeout(500); // Nachzügler abwarten

  const loads = seen.filter((s) => !s.url.startsWith('/api/events'));
  const deltaBytes = loads.reduce((n, s) => n + s.bytes, 0);
  console.log(`300 Karten, eine Änderung: vorher ${before.bytes} Byte in ${before.ms} ms; jetzt ${deltaBytes} Byte (${loads.map((s) => s.url).join(' ')}); sichtbar nach ${delta} ms`);
  expect(loads.some((s) => s.url.startsWith('/api/cards?ids='))).toBe(true);
  expect(loads.some((s) => s.url === `/api/boards/${board.id}`)).toBe(false);
  expect(deltaBytes).toBeLessThan(before.bytes / 5);

  // Gerät 2 legt ein Board an („alles"): dann wird wie bisher alles neu geladen
  seen.length = 0;
  await request.post('/api/boards', { data: { name: 'Zweites Board' } });
  await expect.poll(() => seen.some((s) => s.url === `/api/boards/${board.id}`)).toBe(true);

  // Gerät 2 löscht die Karte: sie verschwindet ohne Neuladen des ganzen Boards
  seen.length = 0;
  await request.delete(`/api/cards/${ids[0]}`);
  await expect(page.getByText('Auf Gerät 2 geändert', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(seen.some((s) => s.url === `/api/boards/${board.id}`)).toBe(false);
});
