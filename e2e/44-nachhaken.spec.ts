import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { newTaskSheet, openBoards, pickDue } from './helpers';

// Nachhaken an einer Aufgabe: Block „Erinnerung“ (Vorher erinnern wie bisher, Nachhaken, Wiederholen, Uhrzeit, Höchstens, Ablauf als Text).
// Persönlich: nur die einstellende Person sieht es.
const unique = (base: string) => `${base} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const conny = { 'x-remote-user-id': 'ha-conny-e2e', 'x-remote-user-name': 'conny', 'x-remote-user-display-name': 'Conny' };

type Nag = { anchor: string; afterMin: number; everyMin: number | null; max: number; atTime: string | null };
type ApiCard = { id: string; title: string; dueAt: string | null; reminder: Nag | null };

async function ownBoard(request: APIRequestContext, page: Page, name: string) {
  const board = (await (await request.post('/api/boards', { data: { name } })).json()) as { id: string };
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  return board.id;
}
async function cardOf(request: APIRequestContext, boardId: string, title: string, headers?: Record<string, string>): Promise<ApiCard> {
  const cards = ((await (await request.get(`/api/boards/${boardId}`, { headers })).json()).cards as { id: string; title: string }[]).find((c) => c.title === title)!;
  return (await (await request.get(`/api/cards/${cards.id}`, { headers })).json()) as ApiCard;
}
/** Morgen 10:00 in Berlin als Eingabe für den Termin-Dialog */
const tomorrow = () => {
  const d = new Date(Date.now() + 36 * 3_600_000);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return `${p}T10:00`;
};
const reminderSheet = (page: Page) => page.getByRole('dialog', { name: 'Erinnerung' });

test('Neue Aufgabe: Nachhaken wählen, Ablauf als Text, gespeichert nur für mich', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Nachhaken'));
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  const title = unique('Fenster putzen');
  await page.getByLabel('Was steht an?').fill(title);
  await pickDue(page, tomorrow());

  const sheet = newTaskSheet(page);
  await sheet.getByRole('button', { name: /^Erinnerung wählen/ }).click();
  const dlg = reminderSheet(page);
  await expect(dlg.getByTestId('reminder-editor')).toContainText('Vorher erinnern');
  await expect(dlg.getByTestId('reminder-editor')).toContainText('Nachhaken, wenn nicht erledigt');
  for (const chip of ['Aus', 'Nach 1 Std.', 'Morgen', 'Nach 3 Tagen', 'Nach 1 Woche', 'Eigene …']) await expect(dlg.getByTestId('nag-first').getByRole('button', { name: chip, exact: true })).toBeVisible();
  // ohne Wahl nichts Weiteres, und es gibt weder ein zweites Auswahlfeld im Satz noch einen „bis erledigt“-Schalter
  await expect(dlg.getByTestId('nag-plan')).toHaveCount(0);
  await expect(dlg).not.toContainText(/bis erledigt/i);
  await expect(dlg.getByRole('switch')).toHaveCount(0);

  await dlg.getByTestId('nag-first').getByRole('button', { name: 'Nach 3 Tagen', exact: true }).click();
  await dlg.getByTestId('nag-repeat').getByRole('button', { name: 'Täglich', exact: true }).click();
  await expect(dlg.getByRole('textbox', { name: 'Uhrzeit' }).or(dlg.getByLabel('Uhrzeit'))).toBeVisible(); // nur bei Tagen
  await dlg.getByLabel('Höchstens so oft').fill('3');
  const plan = dlg.getByTestId('nag-plan');
  await expect(plan).toContainText('Dein Ablauf (Termin:');
  await expect(plan.locator('span.rounded-full')).toHaveCount(3);
  await expect(plan).toContainText('(letzte)');
  await expect(dlg.getByTestId('nag-hint')).toHaveText('Mit der Erledigung endet alles automatisch. Ruhezeiten gelten. Nur für dich.');
  await dlg.getByRole('button', { name: 'Fertig', exact: true }).click();

  await expect(sheet.getByRole('button', { name: /^Erinnerung wählen, gerade: Nachhaken, wenn nicht erledigt/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Aufgabe anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();

  const card = await cardOf(request, boardId, title);
  expect(card.reminder).toEqual({ anchor: 'due', afterMin: 4320, everyMin: 1440, max: 3, atTime: '18:00' });
  // persönlich: eine andere Person sieht es nicht
  expect((await cardOf(request, boardId, title, conny)).reminder).toBeNull();
});

test('Karte: Erinnerung öffnen, ändern und ausschalten; „Eigene …“ zeigt Nach [Zahl] [Einheit]', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Nachhaken'));
  const view = (await (await request.get(`/api/boards/${boardId}`)).json()) as { columns: { id: string }[] };
  const title = unique('Mit Nachhaken');
  const made = (await (await request.post(`/api/boards/${boardId}/cards`, {
    data: { columnId: view.columns[0]!.id, title, dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), reminder: { anchor: 'due', afterMin: 60, everyMin: null, max: 1, atTime: null } },
  })).json()) as ApiCard;
  expect(made.reminder).toMatchObject({ afterMin: 60 });

  await page.goto(`/?card=${made.id}`);
  await page.getByRole('button', { name: /^Nachhaken$/ }).click();
  const editor = page.getByTestId('reminder-editor');
  await expect(editor.getByTestId('nag-first').getByRole('button', { name: 'Nach 1 Std.', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await editor.getByTestId('nag-first').getByRole('button', { name: 'Eigene …', exact: true }).click();
  await expect(editor.getByTestId('nag-first-custom')).toBeVisible();
  await editor.getByLabel('Zeit bis zum Nachhaken').fill('2');
  await editor.getByTestId('nag-first-custom').getByLabel('Einheit').selectOption('d');
  await expect.poll(async () => (await cardOf(request, boardId, title)).reminder?.afterMin).toBe(2880);

  await editor.getByTestId('nag-first').getByRole('button', { name: 'Aus', exact: true }).click();
  await expect.poll(async () => (await cardOf(request, boardId, title)).reminder).toBeNull();
  await expect(page.getByRole('button', { name: /^Erinnerung$/ })).toBeVisible();
});

test('Ohne Termin zählt es ab dem Anlegen, der Ablauf sagt es', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Nachhaken'));
  const view = (await (await request.get(`/api/boards/${boardId}`)).json()) as { columns: { id: string }[] };
  const made = (await (await request.post(`/api/boards/${boardId}/cards`, { data: { columnId: view.columns[0]!.id, title: unique('Ohne Termin') } })).json()) as ApiCard;
  await page.goto(`/?card=${made.id}`);
  await page.getByRole('button', { name: /^Erinnerung$/ }).click();
  await page.getByTestId('nag-first').getByRole('button', { name: 'Nach 1 Std.', exact: true }).click();
  await expect(page.getByTestId('nag-plan')).toContainText('Dein Ablauf (ab jetzt)');
  await expect.poll(async () => ((await (await request.get(`/api/cards/${made.id}`)).json()) as ApiCard).reminder).toMatchObject({ anchor: 'created', afterMin: 60 });
});
