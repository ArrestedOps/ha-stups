import { expect, test } from '@playwright/test';
import { openBoards } from './helpers';

test('Viele Spalten: Tabs überlappen nicht und lassen sich scrollen', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'dunkel', 'die Spalten bleiben im Board, einmal reicht');

  const boards = await (await request.get('/api/boards')).json();
  for (const name of ['Zu besprechen', 'Bestellt und unterwegs']) {
    expect((await request.post(`/api/boards/${boards[0].id}/columns`, { data: { name } })).status()).toBe(201);
  }

  await page.goto('/');

  await openBoards(page);
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(6);

  const boxes = await tabs.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, textFits: el.scrollWidth <= el.clientWidth + 1 };
    }),
  );
  boxes.forEach((b, i) => {
    expect(b.textFits, `Text von Tab ${i} passt in den Tab`).toBe(true);
    if (i > 0) expect(b.left, `Tab ${i} beginnt nach Tab ${i - 1}`).toBeGreaterThanOrEqual(boxes[i - 1]!.right - 1);
  });

  // der letzte Tab ist erreichbar
  await tabs.last().click();
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
});

test('Neues Board: Name eingeben und mit dem sichtbaren Knopf anlegen', async ({ page }, info) => {
  test.skip(info.project.name !== 'dunkel', 'ein Board reicht');

  await page.goto('/');

  await openBoards(page);
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Neues Board erstellen' }).click();
  const name = `Zweites Board ${Date.now().toString(36)}`;
  await page.getByLabel('Name des neuen Boards').fill(name);
  await page.getByRole('button', { name: 'Board anlegen' }).click();

  await expect(page.getByTestId('board-name')).toHaveText(name);
  // das neue Board bekommt die Standard-Spalten
  await expect(page.getByRole('tab')).toHaveCount(4);

  // zurück zum ersten Board, damit die weiteren Tests ihre Aufgaben dort finden
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: /Haushalt/ }).click();
  await expect(page.getByTestId('board-name')).toHaveText('Haushalt');
});
