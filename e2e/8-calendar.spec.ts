import { openTasksView, openBoards } from './helpers';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

test.describe.configure({ timeout: 90_000 });

const HOUR_PX = 44;

async function seed(request: APIRequestContext) {
  const tag = Date.now().toString(36);
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string }[];
  const conny = people.find((p) => p.name === 'Conny')!;
  const boardName = `Kalender ${tag}`;
  const boardId = (await (await request.post('/api/boards', { data: { name: boardName } })).json()).id as string;
  const columns = (await (await request.get(`/api/boards/${boardId}`)).json()).columns as { id: string }[];
  const mk = async (title: string, assigneeIds: string[]) => {
    const res = await request.post(`/api/boards/${boardId}/cards`, {
      data: { title, columnId: columns[0]!.id, dueAt: new Date().toISOString(), assigneeIds },
    });
    return (await res.json()).id as string;
  };
  const t = { conny: `Friseur ${tag}`, offen: `Paket ${tag}` };
  await mk(t.conny, [conny.id]);
  await mk(t.offen, []);
  return { t, boardName };
}

const block = (page: Page, title: string, board: string) => page.getByRole('button', { name: `${title}, ${board}` });

test('Kalender: Tagesansicht zeigt die Aufgabe zur Uhrzeit, Filter nach Person', async ({ page, request }) => {
  const s = await seed(request);
  await page.goto('/');
  await openBoards(page);
  await openTasksView(page, 'Tag');

  await expect(block(page, s.t.conny, s.boardName)).toBeVisible();
  await expect(block(page, s.t.offen, s.boardName)).toBeVisible();

  // der Filter-Knopf steht auch auf der Kalenderseite (die Chips Meine/Alle/Personen nicht)
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByTestId('filter-sheet').getByRole('group', { name: 'Personen' }).getByRole('button', { name: /Conny/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Aufgaben? anzeigen/ }).click();
  await expect(block(page, s.t.conny, s.boardName)).toBeVisible();
  await expect(block(page, s.t.offen, s.boardName)).toBeHidden();

  // Aufgabe öffnen
  await block(page, s.t.conny, s.boardName).click();
  await expect(page.getByRole('dialog').locator('input, textarea').first()).toHaveValue(s.t.conny);
});

test('Kalender: Monatsansicht, Tipp auf einen Tag zeigt seine Aufgaben, „Tagesansicht öffnen" die Tagesansicht', async ({ page, request }) => {
  const s = await seed(request);
  await page.goto('/');
  await openBoards(page);
  await openTasksView(page, 'Monat');

  const today = page.locator('[data-testid="calendar-month"] [data-today]');
  await expect(today).toBeVisible();
  await expect(today).toHaveAttribute('aria-label', /[2-9]\d* Aufgaben|[1-9]\d+ Aufgaben/);
  await today.click();
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  // die Aufgaben des Tages stehen unter dem Monat
  await expect(page.getByTestId('calendar-daylist').getByText(s.t.conny)).toBeVisible();
  await page.getByRole('button', { name: 'Tagesansicht öffnen' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Ansicht' }).getByRole('radio', { name: 'Tag' })).toHaveAttribute('aria-checked', 'true');
  await expect(block(page, s.t.conny, s.boardName)).toBeVisible();
});

test('Kalender: auf einen freien Zeitpunkt tippen legt eine Aufgabe mit diesem Termin an', async ({ page, request }, info) => {
  // Die angelegte Aufgabe bleibt in der Datenbank: jeder Lauf (Theme, Wiederholung) nimmt eine eigene Stunde
  // jedes Projekt eine eigene Stunde: Sie teilen sich den Server und seine Daten
  const hour = 5 + info.repeatEachIndex * 2 + (({ hell: 1, 'chromium-handy': 7 } as Record<string, number>)[info.project.name] ?? 0);
  const s = await seed(request);
  const title = `Elektriker ${Date.now().toString(36)}`;
  await page.goto('/');
  await openBoards(page);
  await openTasksView(page, 'Tag');
  await expect(block(page, s.t.conny, s.boardName)).toBeVisible();

  // auf die Stunde scrollen und die Spalte dort antippen (erst warten, bis die Ansicht ihren Startpunkt angesprungen ist)
  await page.waitForTimeout(400);
  const grid = page.getByTestId('calendar-grid');
  await grid.evaluate((el, [px, h]) => (el.scrollTop = h * px), [HOUR_PX, hour - 1]);
  const column = page.getByRole('button', { name: /^Neue Aufgabe am/ });
  const box = (await column.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + hour * HOUR_PX + 14);

  await expect(page.getByTestId('slot-time')).toContainText(`${String(hour).padStart(2, '0')}:00`);
  await page.getByRole('textbox', { name: 'Titel' }).fill(title);
  await page.getByRole('group', { name: 'Board' }).getByRole('button', { name: s.boardName }).click();
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByText('Aufgabe angelegt')).toBeVisible();
  await expect(block(page, title, s.boardName)).toBeVisible();
});
