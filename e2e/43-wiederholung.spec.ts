import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { newTaskSheet, openBoards } from './helpers';

// Wiederholung ohne Termin-Pflicht, Stündlich, Verspätung (Plan bleibt fest / Kleine Verspätung / Neu zählen).
const unique = (base: string) => `${base} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

type ApiCard = { id: string; title: string; dueAt: string | null; recurrence: Record<string, unknown> | null };

async function ownBoard(request: APIRequestContext, page: Page, name: string) {
  const board = (await (await request.post('/api/boards', { data: { name } })).json()) as { id: string };
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  return board.id;
}
const cardOf = async (request: APIRequestContext, boardId: string, title: string) =>
  ((await (await request.get(`/api/boards/${boardId}`)).json()).cards as ApiCard[]).find((c) => c.title === title);

async function openNew(page: Page) {
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Neue Aufgabe', exact: true }).click();
  return page.getByLabel('Was steht an?');
}
const repeatSheet = (page: Page) => page.getByRole('dialog', { name: 'Wiederholung' });

/** Genau „Sa“ gewählt, egal welcher Wochentag heute vorbelegt ist (der Test darf nicht vom Tag der Ausführung abhängen) */
async function onlySaturday(rep: Locator) {
  const days = rep.getByRole('group', { name: 'Wochentage' }).getByRole('button');
  // Erst „Sa“ einschalten: der letzte gewählte Tag lässt sich nicht abwählen
  const all = await days.all();
  const isSat = async (d: Locator) => ((await d.textContent()) ?? '').trim() === 'Sa';
  for (const d of all) if ((await isSat(d)) && (await d.getAttribute('aria-pressed')) !== 'true') await d.click();
  for (const d of all) {
    const on = (await d.getAttribute('aria-pressed')) === 'true';
    const sat = ((await d.textContent()) ?? '').trim() === 'Sa';
    if (on !== sat) await d.click();
  }
}

test('Neue Aufgabe: Wiederholung ohne Termin wählbar, der erste Termin wird automatisch gesetzt', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Wdh'));
  const input = await openNew(page);
  const title = unique('Ohne Termin');
  await input.fill(title);
  const sheet = newTaskSheet(page);
  await expect(sheet.getByRole('button', { name: /^Termin wählen, gerade: Kein Termin/ })).toBeVisible();

  // die Zeile ist ohne Termin antippbar
  await sheet.getByRole('button', { name: /^Wiederholung wählen, gerade: Nicht wiederholen/ }).click();
  const rep = repeatSheet(page);
  await expect(rep.getByText('Und wenn ich später fertig werde?')).toHaveCount(0);
  await rep.getByRole('button', { name: 'Wöchentlich', exact: true }).click();
  await expect(rep.getByTestId('recurrence-preview')).toContainText('Erster Termin wird automatisch gesetzt:');
  await onlySaturday(rep);
  await expect(rep.getByRole('group', { name: 'Wochentage' }).getByRole('button', { name: 'Sa', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await rep.getByRole('button', { name: 'Fertig', exact: true }).click();

  await expect(sheet.getByRole('button', { name: /^Termin wählen, gerade: (?!Kein Termin)/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Aufgabe anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Aufgabe angelegt' })).toBeVisible();

  const card = (await cardOf(request, boardId, title))!;
  expect(card.dueAt).not.toBeNull();
  expect(card.recurrence).toMatchObject({ type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] });
  // der automatische Termin ist ein Samstag in der Zukunft, um die Standardzeit
  const due = new Date(card.dueAt!);
  expect(due.getTime()).toBeGreaterThan(Date.now());
  expect(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' }).format(due)).toBe('Sat');
});

test('„Nie“ entfernt nur die Regel, der Termin bleibt', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Wdh'));
  const input = await openNew(page);
  const title = unique('Nie');
  await input.fill(title);
  const sheet = newTaskSheet(page);
  await sheet.getByRole('button', { name: /^Wiederholung wählen/ }).click();
  const rep = repeatSheet(page);
  await rep.getByRole('button', { name: 'Täglich', exact: true }).click();
  await rep.getByRole('button', { name: 'Nie', exact: true }).click();
  await rep.getByRole('button', { name: 'Fertig', exact: true }).click();
  await expect(sheet.getByRole('button', { name: /^Wiederholung wählen, gerade: Nicht wiederholen/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Aufgabe anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Aufgabe angelegt' })).toBeVisible();
  const card = (await cardOf(request, boardId, title))!;
  expect(card.recurrence).toBeNull();
  expect(card.dueAt).not.toBeNull();
});

test('Verspätung: drei Aufgaben mit Beispielen aus der echten Regel, Toleranz wird gespeichert', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Wdh'));
  const input = await openNew(page);
  const title = unique('Bad putzen');
  await input.fill(title);
  const sheet = newTaskSheet(page);
  await sheet.getByRole('button', { name: /^Wiederholung wählen/ }).click();
  const rep = repeatSheet(page);
  await rep.getByRole('button', { name: 'Alle 2 Wochen', exact: true }).click();
  await onlySaturday(rep);

  const group = rep.getByRole('radiogroup', { name: 'Und wenn ich später fertig werde?' });
  await expect(group.getByRole('radio')).toHaveCount(3);
  await expect(group.getByRole('radio', { name: /Plan bleibt fest/ })).toHaveAttribute('aria-checked', 'true');
  // Beispiele stehen in allen drei Aufgaben
  await expect(rep.getByTestId('example-fixed')).toContainText(/Erledigt \S+ \d+\.\d+\. → nächstes Mal Sa \d+\.\d+\./);
  await expect(rep.getByTestId('example-after')).toContainText(/Erledigt \S+ \d+\.\d+\. → nächstes Mal \S+ \d+\.\d+\./);

  await group.getByRole('radio', { name: /Kleine Verspätung ist okay/ }).click();
  await expect(rep.getByText('Toleranz', { exact: true })).toBeVisible();
  await expect(rep.getByText('so viele Tage darfst du zu spät sein')).toBeVisible();
  await expect(rep.getByTestId('example-tolerant-ok')).toContainText('Bis 3 Tage zu spät: Plan bleibt.');
  await expect(rep.getByTestId('example-tolerant-late')).toContainText('Mehr als 3 Tage zu spät: Plan beginnt neu, nächster Samstag nach 2 Wochen.');
  const tol = rep.getByLabel('Toleranz in Tagen');
  await expect(tol).toHaveValue('3');
  await tol.fill('5');
  await expect(rep.getByTestId('example-tolerant-ok')).toContainText('Bis 5 Tage zu spät: Plan bleibt.');
  await rep.getByRole('button', { name: 'Fertig', exact: true }).click();
  await sheet.getByRole('button', { name: 'Aufgabe anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Aufgabe angelegt' })).toBeVisible();

  const card = (await cardOf(request, boardId, title))!;
  expect(card.recurrence).toMatchObject({ type: 'fixed', freq: 'weekly', every: 2, weekdays: [6], lateTolerance: 5 });
});

test('Stündlich: nur zwei Aufgaben, Zeitfenster, „Neu zählen“ in Stunden', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Wdh'));
  const input = await openNew(page);
  const title = unique('Trinken');
  await input.fill(title);
  const sheet = newTaskSheet(page);
  await sheet.getByRole('button', { name: /^Wiederholung wählen/ }).click();
  const rep = repeatSheet(page);
  await rep.getByRole('button', { name: 'Stündlich', exact: true }).click();
  const group = rep.getByRole('radiogroup', { name: 'Und wenn ich später fertig werde?' });
  await expect(group.getByRole('radio')).toHaveCount(2);
  await expect(rep.getByText('„Kleine Verspätung ist okay“ gibt es nur bei wöchentlich und monatlich.')).toBeVisible();

  await rep.getByRole('switch', { name: 'Nur zwischen bestimmten Uhrzeiten' }).click();
  await expect(rep.getByLabel('Fensteranfang')).toHaveValue('08:00');
  await expect(rep.getByLabel('Fensterende')).toHaveValue('20:00');
  await rep.getByRole('button', { name: 'Fertig', exact: true }).click();
  await expect(sheet.getByRole('button', { name: /^Wiederholung wählen, gerade: stündlich 08:00–20:00/ })).toBeVisible();
  await sheet.getByRole('button', { name: 'Aufgabe anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Aufgabe angelegt' })).toBeVisible();
  const card = (await cardOf(request, boardId, title))!;
  expect(card.recurrence).toEqual({ type: 'fixed', freq: 'hourly', every: 1, window: { from: '08:00', to: '20:00' } });
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' }).format(new Date(card.dueAt!)));
  expect(hour).toBeGreaterThanOrEqual(8);
  expect(hour).toBeLessThanOrEqual(20);
});

test('Aufgabe: Wiederholung ohne Termin setzen, die Aufgabe bekommt den ersten Termin', async ({ page, request }) => {
  const boardId = await ownBoard(request, page, unique('Wdh'));
  const view = await (await request.get(`/api/boards/${boardId}`)).json();
  const title = unique('Aufgabe ohne Termin');
  const made = await (await request.post(`/api/boards/${boardId}/cards`, { data: { title, columnId: view.columns[0].id } })).json();
  expect(made.dueAt).toBeNull();

  await page.goto('/');
  await openBoards(page);
  await page.locator('[role=presentation]').filter({ hasText: title }).getByText(title).click();
  const props = page.getByRole('group', { name: 'Eigenschaften' });
  await props.getByRole('button', { name: /^Wiederholung:/ }).click();
  await page.getByRole('button', { name: 'Monatlich', exact: true }).click();
  await expect(page.getByTestId('recurrence-preview')).toContainText('monatlich');

  await expect
    .poll(async () => (await cardOf(request, boardId, title))?.recurrence)
    .toMatchObject({ type: 'fixed', freq: 'monthly', every: 1 });
  expect((await cardOf(request, boardId, title))!.dueAt).not.toBeNull();
  await expect(page.getByTestId('recurrence-preview')).toContainText('Erster Termin wird automatisch gesetzt:');
});
