import { expect, test, type APIRequestContext } from '@playwright/test';
import { openBoards } from './helpers';

// Aufgaben: was ist für mich dran, was haben die anderen. Der Test-Server meldet jeden als „rene" an (eine Person, ohne Home Assistant Administrator).
// Der Server wird mit anderen Tests geteilt: eindeutige Titel, Termine mit festem Abstand zu „jetzt" (nicht abhängig von der Tageszeit:
// „vor einer Stunde" ist überfällig, „in einem Tag" ist morgen, beides liegt in jedem Fall im Fenster bis Ende morgen).
const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const boardIds: string[] = [];

test.afterAll(async ({ request }) => {
  for (const id of boardIds) await request.delete(`/api/boards/${id}`);
});

async function seed(request: APIRequestContext) {
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string; isPerson: boolean }[];
  const me = ((await (await request.get('/api/me')).json()) as { user: { id: string } }).user.id;
  const other = people.find((p) => p.isPerson && p.id !== me)!;
  const tag = unique();
  const board = (await (await request.post('/api/boards', { data: { name: `Heute ${tag}` } })).json()) as { id: string };
  boardIds.push(board.id);
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const columnId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  const mk = async (title: string, extra: Record<string, unknown>) =>
    ((await (await request.post(`/api/boards/${board.id}/cards`, { data: { title, columnId, ...extra } })).json()) as { id: string });
  return { me, other, tag, boardId: board.id, mk };
}

test('Aufgaben: meine Aufgaben in Gruppen (Überfällig, Heute, Diese Woche, Später), die der anderen nicht; Erledigen nimmt sie weg', async ({ page, request }) => {
  const s = await seed(request);
  const overdue = `Überfällig ${s.tag}`;
  const tomorrow = `Morgen ${s.tag}`;
  const later = `Später ${s.tag}`;
  const foreign = `Fremd ${s.tag}`;
  await s.mk(overdue, { assigneeIds: [s.me], dueAt: new Date(Date.now() - 3_600_000).toISOString() });
  await s.mk(tomorrow, { assigneeIds: [s.me], dueAt: new Date(Date.now() + 86_400_000).toISOString() });
  await s.mk(later, { assigneeIds: [s.me], dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString() });
  await s.mk(foreign, { assigneeIds: [s.other.id], dueAt: new Date(Date.now() - 3_600_000).toISOString() });

  await page.goto('/');

  await openBoards(page);
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' }).click();
  // Die Liste ist die Startseite und zeigt zuerst „Meine"
  await expect(page.getByRole('heading', { name: 'Aufgaben' })).toBeVisible();
  const tasks = page.getByTestId('tasks');
  await expect(tasks.getByText(overdue)).toBeVisible();
  await expect(page.getByTestId('group-overdue').getByText(overdue)).toBeVisible();
  await expect(tasks.getByText(tomorrow)).toBeVisible();
  await expect(page.getByTestId('group-overdue').getByText(tomorrow)).toHaveCount(0);
  await expect(page.getByTestId('group-later').getByText(later)).toBeVisible(); // in 30 Tagen: an jedem Wochentag „Später"
  await expect(tasks.getByText(foreign)).toHaveCount(0);
  await expect(page.getByTestId('tasks-sub')).toHaveText('Deine Aufgaben, Termine und To-dos an einem Ort.');
  await expect(page.getByRole('group', { name: 'Deine Zahlen' })).toBeVisible();

  // „Alle" zeigt auch die der anderen
  await page.getByRole('group', { name: 'Personen' }).getByRole('button', { name: 'Alle', exact: true }).click();
  await expect(tasks.getByText(foreign)).toBeVisible();
  await page.getByRole('group', { name: 'Personen' }).getByRole('button', { name: 'Meine' }).click();

  // Erledigen per Kreis nimmt die Aufgabe weg
  await tasks.getByRole('checkbox', { name: `„${overdue}“ erledigen` }).click();
  await expect(tasks.getByText(overdue)).toHaveCount(0);
  const done = (await (await request.get(`/api/boards/${s.boardId}`)).json()) as { cards: { title: string; completedAt: string | null }[] };
  expect(done.cards.find((c) => c.title === overdue)?.completedAt).not.toBeNull();
});

test('Kalender: der Reiter „Kalender" öffnet ihn (Tag, 3 Tage, Woche, Monat), „‹ Aufgaben" führt zurück zur Liste', async ({ page }) => {
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' }).click();
  // Es gibt keinen Umschalter Liste/Tag/Woche/Monat in der Liste
  await expect(page.getByRole('radiogroup', { name: 'Ansicht' })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Kalender' }).click();
  const views = page.getByRole('radiogroup', { name: 'Ansicht' });
  await expect(page.getByRole('heading', { name: 'Kalender' })).toBeVisible();
  // auf dem Handy öffnet der Kalender mit 3 Tagen
  await expect(views.getByRole('radio', { name: '3 Tage' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('calendar-grid')).toBeVisible();
  await views.getByRole('radio', { name: 'Woche', exact: true }).click();
  await expect(page.getByTestId('calendar-grid')).toBeVisible();
  await views.getByRole('radio', { name: 'Monat', exact: true }).click();
  await expect(page.getByTestId('calendar-month')).toBeVisible();
  await views.getByRole('radio', { name: 'Tag', exact: true }).click();
  await expect(page.getByTestId('calendar-grid')).toBeVisible();
  await page.getByRole('button', { name: 'Aufgaben', exact: true }).first().click(); // „‹ Aufgaben" oben links
  await expect(page.getByTestId('tasks')).toBeVisible();
});

test('Aufgaben: von oben nach unten Kopf, Zahlenkacheln, Chips, dann die Gruppen (wie im Entwurf)', async ({ page, request }) => {
  const s = await seed(request);
  await s.mk(`Reihenfolge ${s.tag}`, { assigneeIds: [s.me], dueAt: new Date(Date.now() - 3_600_000).toISOString() });
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' }).click();
  await expect(page.getByTestId('group-overdue')).toBeVisible();
  const y = async (loc: ReturnType<typeof page.locator>) => (await loc.first().boundingBox())!.y;
  const order = [
    await y(page.getByRole('button', { name: 'Einstellungen öffnen' })),
    await y(page.getByRole('heading', { name: 'Aufgaben' })),
    await y(page.getByTestId('tasks-sub')),
    await y(page.getByRole('group', { name: 'Deine Zahlen' })),
    await y(page.getByRole('group', { name: 'Personen' })),
    await y(page.getByTestId('group-overdue')),
  ];
  expect(order, 'Reihenfolge der Bereiche von oben nach unten').toEqual([...order].sort((a, b) => a - b));
  // Die Zahlen stehen in vier Kacheln: Heute fällig, Überfällig, Diese Woche, Erledigt heute
  await expect(page.getByRole('group', { name: 'Deine Zahlen' }).getByText(/Heute fällig|Überfällig|Diese Woche|Erledigt/)).toHaveCount(4);
  // rechts neben den Chips der Filter-Knopf
  await expect(page.getByRole('button', { name: 'Filter' })).toBeVisible();
  // Zeile: Erledigt-Kreis, Titel, Mehr-Knopf
  const row = page.getByTestId('group-overdue').locator('li').first();
  await expect(row.getByRole('checkbox')).toBeVisible();
  await expect(row.getByRole('button', { name: /^Menü für/ })).toBeVisible();
});

test('Aufgaben: „Fairness diese Woche" und „Bei den anderen" führen zu „Diese Woche", ohne Rangliste', async ({ page, request }) => {
  const s = await seed(request);
  await s.mk(`Für andere ${s.tag}`, { assigneeIds: [s.other.id] });
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' }).click();
  await page.getByRole('button', { name: /Aufgaben? offen/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Diese Woche', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByTestId('fairness')).toBeVisible();
  await expect(dialog).not.toContainText(/Platz|Rang|Sieger|Punkte|%/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Fairness diese Woche/ }).click();
  await expect(page.getByRole('dialog').getByTestId('fairness')).toBeVisible();
});

test('Kopfzeile auf allen drei Reitern: Logo, Glocke, Zahnrad und Profilbild, kein „‹ Dashboard" mehr', async ({ page }) => {
  await page.goto('/');
  await openBoards(page);
  const nav = page.getByRole('navigation', { name: 'Ansicht' });
  for (const [tab, title] of [['Aufgaben', 'Aufgaben'], ['Boards', 'Boards'], ['Wächter', 'Wächter']] as const) {
    await nav.getByRole('button', { name: tab }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Mitteilungen/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Einstellungen öffnen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Profil öffnen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toHaveCount(0);
  }
});

test('Glocke: Zahnrad und Profilbild öffnen die Einstellungen, die Glocke die Mitteilungen (nach „Alle gelesen“ kein Punkt, Chips wie im Entwurf)', async ({ page, request }) => {
  // Andere Tests lassen Ereignisse für diese Person zurück: erst alles lesen, dann zählt nur, was jetzt dazukommt
  expect((await request.put('/api/me/inbox-seen', { data: {} })).status()).toBe(200);
  await page.goto('/');
  await openBoards(page);
  await expect(page.getByTestId('bell-dot')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mitteilungen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Mitteilungen' });
  const chips = dialog.getByRole('group', { name: 'Art der Mitteilung' });
  for (const name of ['Alle', 'Stupse', 'Wächter', 'Erledigt', 'Kommentare']) await expect(chips.getByRole('button', { name })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Alle gelesen' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  await expect(page.getByRole('dialog', { name: 'Einstellungen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Profil öffnen' }).click();
  await expect(page.getByRole('dialog', { name: 'Einstellungen' }).getByTestId('settings-head')).toBeVisible();
});

test('Einstellungen › Home Assistant: „Dashboard" (Ziel des Home-Knopfs) und „HA-Kopfzeile ausblenden" sind da (im Add-on für jeden), „Zurück zum Dashboard" steht nicht mehr doppelt', async ({ page }) => {
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' });
  await expect(dialog.getByText('Home Assistant', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Zurück zum Dashboard' })).toHaveCount(0);
  const toggle = dialog.getByRole('switch', { name: 'Kopfzeile von Home Assistant ausblenden' });
  await expect(toggle).toBeVisible();
  const before = await toggle.getAttribute('aria-checked');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
  await toggle.click(); // zurück, der Merkzettel gehört dem Gerät
});
