import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Schnell-Eingabe im Fenster „Neue Karte": eine Zeile Text wird zur fertigen Karte.
const unique = (base: string) => `${base} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

async function ownBoard(request: APIRequestContext, page: Page, name: string) {
  const board = (await (await request.post('/api/boards', { data: { name } })).json()) as { id: string };
  await request.post(`/api/boards/${board.id}/categories`, { data: { name: 'Haushalt', color: 'green' } });
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  return board.id;
}

async function openNew(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  return page.getByLabel('Titel');
}

test('Eine Zeile wird zur Karte: Titel, Termin, Zuständige, Kategorie, Wiederholung, Priorität', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Schnell'));
  const input = await openNew(page);
  const title = unique('Müll raus');
  await input.fill(`${title} morgen 19 Uhr @Conny #Haushalt jede Woche !!`);

  // Vorschau: Chips, Text hervorgehoben
  const chips = page.getByTestId('quick-chips');
  await expect(chips.getByTestId('quick-chip')).toHaveCount(6);
  await expect(chips.locator('[data-kind=person]')).toContainText('@Conny');
  await expect(chips.locator('[data-kind=category]')).toContainText('Haushalt');
  await expect(chips.locator('[data-kind=priority]')).toContainText('Priorität hoch');
  await expect(chips.locator('[data-kind=time]')).toHaveText(/19:00/);
  await expect(page.getByTestId('quick-mirror').locator('mark')).toHaveCount(6);

  // die Eigenschaften darunter zeigen die erkannten Werte
  const props = page.getByRole('group', { name: 'Eigenschaften' });
  await expect(props.getByRole('button', { name: /Conny/ })).toBeVisible();
  await expect(props.getByRole('button', { name: /19:00/ })).toBeVisible();

  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();

  const view = (await (await request.get(`/api/boards/${boardId}`)).json()) as {
    cards: { id: string; title: string; dueAt: string; priority: string; assigneeIds: string[]; categoryIds: string[]; recurrence: unknown }[];
  };
  const card = view.cards.find((c) => c.title === title)!;
  expect(card, 'Karte mit sauberem Titel (ohne die erkannten Wörter)').toBeTruthy();
  expect(card.priority).toBe('high');
  expect(card.assigneeIds).toHaveLength(1);
  expect(card.categoryIds).toHaveLength(1);
  expect(card.recurrence).toMatchObject({ type: 'fixed', freq: 'weekly', every: 1 });
  // morgen 19:00 in der Zeitzone des Browsers
  const local = await page.evaluate((iso) => new Date(iso as string).getHours(), card.dueAt);
  expect(local).toBe(19);
});

test('Ein Tipp auf einen Chip nimmt ihn zurück: „Montag" gehört dann zum Titel', async ({ page, request }) => {
  await ownBoard(request, page, unique('Zurück'));
  const input = await openNew(page);
  await input.fill('Montag Besprechung vorbereiten');
  await expect(page.getByTestId('quick-chip')).toHaveCount(1);
  await page.getByTestId('quick-chip').click();
  await expect(page.getByTestId('quick-chip')).toHaveCount(0);
  await expect(page.getByTestId('quick-mirror').locator('mark')).toHaveCount(0);
  await expect(input).toHaveValue('Montag Besprechung vorbereiten');
  // der Titel bleibt vollständig
  const title = unique('Montag Besprechung');
  await input.fill(title);
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
});

test('Von Hand geänderte Felder überschreibt die Schnell-Eingabe nicht mehr', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Hand'));
  const input = await openNew(page);
  await input.fill('Paket abholen !');
  const props = page.getByRole('group', { name: 'Eigenschaften' });
  // „!" ist als „Mittel" erkannt und steht schon im Eigenschaften-Chip; von Hand auf „Hoch" setzen
  await props.getByRole('button', { name: /Mittel/ }).click();
  await page.getByRole('group', { name: 'Priorität' }).getByRole('button', { name: 'Hoch' }).click();
  // weiter tippen: das „!" ist noch da, soll aber „Hoch" nicht mehr auf „Mittel" zurücksetzen
  await input.fill('Paket abholen ! heute 23 Uhr');
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
  const view = (await (await request.get(`/api/boards/${boardId}`)).json()) as { cards: { title: string; priority: string }[] };
  expect(view.cards.find((c) => c.title === 'Paket abholen')!.priority).toBe('high');
});

test('Unbekannte Person: Warnung, Anlegen gesperrt, bis man sie weglässt', async ({ page, request }) => {
  await ownBoard(request, page, unique('Person'));
  const input = await openNew(page);
  await input.fill('Müll raus @Niemand');
  await expect(page.getByTestId('quick-chip').filter({ hasText: /unbekannt/ })).toBeVisible();
  await expect(page.locator('p[role=alert]')).toContainText('Niemand');
  await expect(page.getByRole('button', { name: 'Anlegen', exact: true })).toBeDisabled();
  await page.getByTestId('quick-chip').filter({ hasText: /unbekannt/ }).click();
  await expect(page.getByRole('button', { name: 'Anlegen', exact: true })).toBeEnabled();
});

test('Unbekannte Kategorie: Rückfrage, dann wird sie angelegt und der Karte gegeben', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Kategorie'));
  const input = await openNew(page);
  const title = unique('Reise planen');
  await input.fill(`${title} #Reisen`);
  await expect(page.getByTestId('quick-chip')).toContainText('neu: Reisen');
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('„Reisen“ gibt es in diesem Board noch nicht');
  await dialog.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
  const view = (await (await request.get(`/api/boards/${boardId}`)).json()) as { categories: { id: string; name: string }[]; cards: { title: string; categoryIds: string[] }[] };
  const reisen = view.categories.find((c) => c.name === 'Reisen')!;
  expect(reisen).toBeTruthy();
  expect(view.cards.find((c) => c.title === title)!.categoryIds).toEqual([reisen.id]);
});

test('Ohne besondere Wörter ist es das alte Titelfeld: nichts wird verändert', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Alt'));
  const input = await openNew(page);
  const title = unique('Kauf 2 Kisten Wasser');
  await input.fill(title);
  await expect(page.getByTestId('quick-chip')).toHaveCount(0);
  await input.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
  const view = (await (await request.get(`/api/boards/${boardId}`)).json()) as { cards: { title: string; dueAt: string | null }[] };
  expect(view.cards.find((c) => c.title === title)).toMatchObject({ dueAt: null });
});

test('Standard-Uhrzeit: nur ein Datum bekommt die eingestellte Uhrzeit', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Uhrzeit'));
  expect((await request.put('/api/settings', { data: { defaultDueTime: '07:30' } })).status()).toBe(200);
  try {
    const input = await openNew(page);
    const title = unique('Zeitung holen');
    await input.fill(`${title} übermorgen`);
    await expect(page.getByTestId('quick-chip')).toContainText('07:30');
    await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
    const view = (await (await request.get(`/api/boards/${boardId}`)).json()) as { cards: { title: string; dueAt: string }[] };
    const due = view.cards.find((c) => c.title === title)!.dueAt;
    const [h, m] = await page.evaluate((iso) => [new Date(iso as string).getHours(), new Date(iso as string).getMinutes()], due);
    expect([h, m]).toEqual([7, 30]);
  } finally {
    await request.put('/api/settings', { data: { defaultDueTime: null } });
  }
});
