import { expect, test } from '@playwright/test';
import { openBoards } from './helpers';

// Foto-Ansicht (Neues Design, Phase 5): „Sichern", „Original", „Entfernen" mit Rückfrage. Ein erfundenes Bild (1 × 1 Pixel), kein Foto.
test.describe.configure({ timeout: 90_000 });

const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const unique = () => Date.now().toString(36) + Math.floor(Math.random() * 1000);

test('Foto-Ansicht: Name und Größe, Sichern und Original als Links, Entfernen fragt nach und löscht den Anhang', async ({ page, request }) => {
  const tag = unique();
  const board = (await (await request.post('/api/boards', { data: { name: `Foto ${tag}` } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string }[] };
  const card = (await (await request.post(`/api/boards/${board.id}/cards`, { data: { title: `Mit Foto ${tag}`, columnId: view.columns[0]!.id } })).json()) as { id: string };
  const name = `Zaehler_${tag}.png`;
  const up = await request.post(`/api/cards/${card.id}/attachments`, { multipart: { file: { name, mimeType: 'image/png', buffer: PNG_1X1 } } });
  expect(up.status()).toBe(201);
  const att = (await up.json()) as { id: string };

  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  await page.goto('/');
  await openBoards(page);
  await page.getByText(`Mit Foto ${tag}`).first().click();
  await page.getByRole('button', { name: new RegExp(`^${name} ansehen`) }).click();

  const viewer = page.getByRole('dialog', { name });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('link', { name: 'Sichern', exact: true })).toHaveAttribute('download', name);
  await expect(viewer.getByRole('link', { name: 'Original im Browser öffnen' })).toHaveAttribute('target', '_blank');
  await expect(viewer.getByText(/\d+ B|KB|MB/).first()).toBeVisible();

  // Entfernen fragt zuerst nach
  await viewer.getByRole('button', { name: 'Entfernen' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Anhang entfernen?');
  await confirm.getByRole('button', { name: 'Abbrechen' }).first().click();
  expect((await request.get(`/api/attachments/${att.id}`)).status()).toBe(200);

  await viewer.getByRole('button', { name: 'Entfernen' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Entfernen' }).click();
  await expect(viewer).toHaveCount(0);
  await expect.poll(async () => (await request.get(`/api/attachments/${att.id}`)).status()).toBe(404);
});
