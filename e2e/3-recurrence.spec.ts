import { expect, test, type APIRequestContext } from '@playwright/test';

async function boardIds(request: APIRequestContext) {
  const boards = await (await request.get('/api/boards')).json();
  const view = await (await request.get(`/api/boards/${boards[0].id}`)).json();
  return { boardId: boards[0].id as string, openId: view.columns[0].id as string };
}

type ApiCard = { id: string; title: string; dueAt: string; completedAt: string | null; repeatedFrom: string | null };
const cardsWith = async (request: APIRequestContext, boardId: string, title: string) =>
  ((await (await request.get(`/api/boards/${boardId}`)).json()).cards as ApiCard[]).filter((c) => c.title === title);

test('Wiederkehrende Karte: erledigt landet sie in „Erledigt", die nächste wartet in „Geplant"', async ({ page, request }) => {
  const { boardId, openId } = await boardIds(request);
  const title = `Jede Woche ${Date.now().toString(36)}`;
  // Eine Minute überfällig: bleibt unabhängig von der Uhrzeit in „Offen" (ein Termin ab morgen ginge nach „Geplant")
  const due = new Date(Date.now() - 60_000).toISOString();
  const res = await request.post(`/api/boards/${boardId}/cards`, {
    data: {
      title,
      columnId: openId,
      dueAt: due,
      recurrence: { type: 'after_completion', every: 1, unit: 'weeks' },
    },
  });
  expect(res.status()).toBe(201);

  await page.goto('/');
  await page.getByRole('tab', { name: /^Offen/ }).click();
  await page.getByRole('button', { name: `„${title}“ erledigen` }).click();
  await expect(page.getByRole('status').filter({ hasText: /Erledigt · nächste Karte/ })).toBeVisible();

  // Die erledigte Karte liegt in „Erledigt", mit der Zeit und ohne „überfällig"
  await page.getByRole('tab', { name: /^Erledigt/ }).click();
  const done = page.locator('[role=presentation]').filter({ hasText: title });
  await expect(done).toBeVisible();
  await expect(done.getByTestId('card-done-at')).toContainText('Erledigt heute');

  // Die nächste Karte wartet mit dem Termin in einer Woche in „Geplant"
  await page.getByRole('tab', { name: /^Geplant/ }).click();
  await expect(page.locator('[role=presentation]').filter({ hasText: title })).toBeVisible();

  const cards = await cardsWith(request, boardId, title);
  expect(cards).toHaveLength(2);
  const next = cards.find((c) => c.completedAt === null)!;
  const old = cards.find((c) => c.completedAt !== null)!;
  expect(next.repeatedFrom).toBe(old.id);
  const days = (Date.parse(next.dueAt) - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(6.9);
  expect(days).toBeLessThan(7.1);
});

test('„Rückgängig" nimmt die nächste Karte wieder weg', async ({ page, request }) => {
  const { boardId, openId } = await boardIds(request);
  const title = `Rückgängig ${Date.now().toString(36)}`;
  await request.post(`/api/boards/${boardId}/cards`, {
    data: {
      title,
      columnId: openId,
      dueAt: new Date(Date.now() - 60_000).toISOString(),
      recurrence: { type: 'after_completion', every: 1, unit: 'weeks' },
    },
  });
  await page.goto('/');
  await page.getByRole('tab', { name: /^Offen/ }).click();
  await page.getByRole('button', { name: `„${title}“ erledigen` }).click();
  await page.getByRole('status').getByRole('button', { name: 'Rückgängig' }).click();

  await expect(page.getByRole('button', { name: `„${title}“ erledigen` })).toBeVisible();
  await expect.poll(async () => (await cardsWith(request, boardId, title)).length).toBe(1);
});

test('Wiederholen: zwei schnelle Klicks bei langsamem Server überschreiben sich nicht', async ({ page, request }) => {
  const { boardId, openId } = await boardIds(request);
  const title = `Schnell ${Date.now().toString(36)}`;
  const card = await (
    await request.post(`/api/boards/${boardId}/cards`, {
      data: { title, columnId: openId, dueAt: new Date(Date.now() - 60_000).toISOString(), recurrence: { type: 'after_completion', every: 1, unit: 'weeks' } },
    })
  ).json();

  await page.goto('/');
  await page.getByRole('tab', { name: /^Offen/ }).click();
  await page.locator('[role=presentation]').filter({ hasText: title }).getByText(title).click();
  await page.getByRole('group', { name: 'Eigenschaften' }).getByRole('button', { name: /jede Woche/ }).click();
  const fieldset = page.getByRole('group', { name: 'Für die nächste Karte übernehmen' });
  await expect(fieldset).toBeVisible();

  // Der Server antwortet langsam: Der zweite Klick kommt, bevor der erste gespeichert und neu geladen ist
  await page.route(`**/api/cards/${card.id}`, async (route) => {
    if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await fieldset.getByLabel('Fotos und PDFs in die nächste Karte übernehmen').check();
  await fieldset.getByLabel('Beschreibung in die nächste Karte übernehmen').uncheck();

  await expect
    .poll(async () => ((await (await request.get(`/api/cards/${card.id}`)).json()) as { carryOver: string[] }).carryOver, { timeout: 10_000 })
    .toEqual(['checklist', 'links', 'cost', 'attachments']);
  // und die Anzeige stimmt mit dem Gespeicherten überein
  await expect(fieldset.getByLabel('Fotos und PDFs in die nächste Karte übernehmen')).toBeChecked();
  await expect(fieldset.getByLabel('Beschreibung in die nächste Karte übernehmen')).not.toBeChecked();
});

test('Wiederholen: Auswahl, was die nächste Karte übernimmt, wird gespeichert', async ({ page, request }) => {
  const { boardId, openId } = await boardIds(request);
  const title = `Übernahme ${Date.now().toString(36)}`;
  const res = await request.post(`/api/boards/${boardId}/cards`, {
    data: {
      title,
      columnId: openId,
      description: 'Gelber Sack',
      dueAt: new Date(Date.now() - 60_000).toISOString(),
      recurrence: { type: 'after_completion', every: 1, unit: 'weeks' },
    },
  });
  const card = await res.json();
  expect(card.carryOver).toEqual(['description', 'checklist', 'links', 'cost']);

  await page.goto('/');
  await page.getByRole('tab', { name: /^Offen/ }).click();
  await page.locator('[role=presentation]').filter({ hasText: title }).getByText(title).click();
  await page.getByRole('group', { name: 'Eigenschaften' }).getByRole('button', { name: /jede Woche/ }).click();

  const fieldset = page.getByRole('group', { name: 'Für die nächste Karte übernehmen' });
  await expect(fieldset).toBeVisible();
  await expect(fieldset.getByLabel('Fotos und PDFs in die nächste Karte übernehmen')).not.toBeChecked();
  await fieldset.getByLabel('Fotos und PDFs in die nächste Karte übernehmen').check();
  await fieldset.getByLabel('Beschreibung in die nächste Karte übernehmen').uncheck();

  await expect
    .poll(async () => ((await (await request.get(`/api/cards/${card.id}`)).json()) as { carryOver: string[] }).carryOver)
    .toEqual(['checklist', 'links', 'cost', 'attachments']);
});
