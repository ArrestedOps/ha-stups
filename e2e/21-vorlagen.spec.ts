import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Board-Vorlagen: ein neues Board aus einer eingebauten Vorlage anlegen und ein eigenes Board als Vorlage speichern.
// Läuft auf dem gemeinsamen Server (dunkel und hell nacheinander): Namen sind eindeutig, alles Angelegte wird am Ende entfernt.
test.describe.configure({ mode: 'serial' });

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const boardIds: string[] = [];
const templateIds: string[] = [];

test.afterAll(async ({ request }) => {
  for (const id of boardIds) await request.delete(`/api/boards/${id}`);
  for (const id of templateIds) await request.delete(`/api/templates/${id}`);
});

const boardByName = async (request: APIRequestContext, name: string) => {
  const boards = (await (await request.get('/api/boards')).json()) as { id: string; name: string }[];
  return boards.find((b) => b.name === name);
};

async function openSwitcher(page: Page) {
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Board wechseln' }).click();
}

/** Die Board-Auswahl, darin „Neues Board erstellen" (Name, Vorlage, Sichtbarkeit) */
async function openCreate(page: Page) {
  await openSwitcher(page);
  await page.getByRole('button', { name: 'Neues Board erstellen' }).click();
}

test('neues Board aus der Vorlage „Haushalt": Vorschau, Spalten und Aufgaben kommen mit', async ({ page, request }) => {
  const name = `Haus ${unique()}`;
  await openCreate(page);
  const templates = page.getByRole('radiogroup', { name: 'Vorlage für das neue Board' });
  await templates.getByRole('radio', { name: 'Haushalt' }).click();
  const preview = page.getByTestId('template-preview');
  await expect(preview).toContainText('4 Spalten');
  await expect(preview).toContainText('5 Kategorien');
  await expect(preview).toContainText('7 Aufgaben');

  await page.getByLabel('Name des neuen Boards').fill(name);
  await page.getByLabel('Name des neuen Boards').press('Enter');
  await expect(page.getByTestId('board-name')).toHaveText(name);

  const created = (await boardByName(request, name))!;
  boardIds.push(created.id);
  const view = (await (await request.get(`/api/boards/${created.id}`)).json()) as {
    columns: { name: string; isDone: boolean }[];
    categories: unknown[];
    cards: { title: string; recurrence: unknown; effort: string | null }[];
  };
  expect(view.columns.map((c) => c.name)).toEqual(['Offen', 'Geplant', 'In Arbeit', 'Erledigt']);
  expect(view.categories).toHaveLength(5);
  expect(view.cards).toHaveLength(7);
  expect(view.cards.find((c) => c.title === 'Müll rausbringen')).toMatchObject({ effort: 'small' });
  expect(view.cards.find((c) => c.title === 'Müll rausbringen')!.recurrence).not.toBeNull();

  // Die Aufgabe ohne Termin liegt in „Offen" und ist zu sehen
  await expect(page.getByRole('button', { name: /Frühjahrsputz/ }).first()).toBeVisible();
});

test('ein leeres Board bleibt leer, auch wenn die Vorlagen-Auswahl vorher benutzt wurde', async ({ page, request }) => {
  const name = `Leer ${unique()}`;
  await openCreate(page);
  const templates = page.getByRole('radiogroup', { name: 'Vorlage für das neue Board' });
  await templates.getByRole('radio', { name: 'Haushalt' }).click();
  await templates.getByRole('radio', { name: 'Leer', exact: true }).click();
  await expect(page.getByTestId('template-preview')).toHaveCount(0);
  await page.getByLabel('Name des neuen Boards').fill(name);
  await page.getByLabel('Name des neuen Boards').press('Enter');
  await expect(page.getByTestId('board-name')).toHaveText(name);
  const created = (await boardByName(request, name))!;
  boardIds.push(created.id);
  const view = (await (await request.get(`/api/boards/${created.id}`)).json()) as { cards: unknown[] };
  expect(view.cards).toEqual([]);
});

test('eigenes Board als Vorlage speichern, daraus ein neues Board anlegen, die Vorlage löschen', async ({ page, request }) => {
  const source = `Quelle ${unique()}`;
  const tplName = `Meine Vorlage ${unique()}`;
  const board = (await (await request.post('/api/boards', { data: { name: source } })).json()) as { id: string };
  boardIds.push(board.id);
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string }[] };
  await request.post(`/api/boards/${board.id}/cards`, { data: { title: 'Vorlagen-Aufgabe', columnId: view.columns[0]!.id } });

  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  await openSwitcher(page);
  await page.getByRole('button', { name: 'Board-Einstellungen' }).click();
  await page.getByRole('button', { name: /^Als Vorlage speichern/ }).click();
  const dialog = page.getByTestId('board-template-dialog');
  const field = dialog.getByLabel('Vorlagenname');
  await field.fill(tplName);
  await field.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Vorlage gespeichert' })).toBeVisible();

  const list = (await (await request.get('/api/templates')).json()) as { id: string; name: string; builtin: boolean; cards: number; columns: number }[];
  const saved = list.find((x) => x.name === tplName)!;
  templateIds.push(saved.id);
  // nur Spalten und Kategorien, keine Aufgaben
  expect(saved).toMatchObject({ builtin: false, cards: 0 });
  expect(saved.columns).toBeGreaterThan(0);

  // Daraus ein neues Board
  const name = `Aus Vorlage ${unique()}`;
  await page.keyboard.press('Escape');
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Neues Board erstellen' }).click();
  await page.getByRole('radiogroup', { name: 'Vorlage für das neue Board' }).getByRole('radio', { name: tplName }).click();
  await expect(page.getByTestId('template-preview')).toContainText('0 Aufgaben');
  await page.getByLabel('Name des neuen Boards').fill(name);
  await page.getByLabel('Name des neuen Boards').press('Enter');
  await expect(page.getByTestId('board-name')).toHaveText(name);
  const created = (await boardByName(request, name))!;
  boardIds.push(created.id);
  const copy = (await (await request.get(`/api/boards/${created.id}`)).json()) as { cards: unknown[]; columns: unknown[] };
  expect(copy.cards).toEqual([]);
  expect(copy.columns.length).toBe(saved.columns);

  // Löschen mit Rückfrage
  const res = await request.delete(`/api/templates/${saved.id}`);
  expect(res.status()).toBe(204);
  templateIds.length = 0;
});
