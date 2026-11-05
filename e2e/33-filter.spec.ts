import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Filter für Aufgaben und Kalender (Phase 6a): Wer, Wann, Boards, Priorität, Außerdem, Sortierung, Trefferzahl; die Wahl bleibt auf dem Gerät.
// Der Server wird mit anderen Tests geteilt: eigenes Board mit eindeutigem Namen, Termine mit großem Abstand zu „jetzt"
// (eine Stunde zurück ist überfällig, 30 Tage voraus ist immer „Später"), darum hängt nichts von der Tageszeit ab.
test.describe.configure({ timeout: 90_000 });

const DAY = 86_400_000;
const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const boardIds: string[] = [];

test.afterAll(async ({ request }) => {
  for (const id of boardIds) await request.delete(`/api/boards/${id}`);
});

async function seed(request: APIRequestContext) {
  const tag = unique();
  const me = ((await (await request.get('/api/me')).json()) as { user: { id: string } }).user.id;
  const board = (await (await request.post('/api/boards', { data: { name: `Filterboard ${tag}` } })).json()) as { id: string };
  boardIds.push(board.id);
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const columnId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  const mk = async (title: string, extra: Record<string, unknown>) => {
    const res = await request.post(`/api/boards/${board.id}/cards`, { data: { title, columnId, ...extra } });
    expect(res.status(), await res.text()).toBe(201);
  };
  const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();
  const t = { alt: `Alt ${tag}`, spaetNiedrig: `Spaet niedrig ${tag}`, spaetHoch: `Spaet hoch ${tag}`, ohne: `Ohne Termin ${tag}` };
  await mk(t.alt, { dueAt: new Date(Date.now() - 3_600_000).toISOString(), priority: 'high', assigneeIds: [me] });
  await mk(t.spaetNiedrig, { dueAt: inDays(30), priority: 'low', assigneeIds: [me] });
  await mk(t.spaetHoch, { dueAt: inDays(31), priority: 'high', assigneeIds: [] });
  await mk(t.ohne, { assigneeIds: [me] });
  return { tag, t, boardName: `Filterboard ${tag}` };
}

const cta = (page: Page, text: RegExp) => page.getByRole('dialog').getByRole('button', { name: text });
const openFilter = async (page: Page) => {
  await page.getByRole('button', { name: /^Filter/ }).click();
  await page.getByTestId('filter-sheet').waitFor();
};

test('Filter: Wann, Board, Priorität und Trefferzahl; „Ohne Termin" holt Karten ohne Termin; Wahl bleibt nach dem Neuladen; Zurücksetzen', async ({ page, request }) => {
  const s = await seed(request);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' }).click();
  await page.getByRole('group', { name: 'Personen' }).getByRole('button', { name: 'Alle', exact: true }).click();
  const tasks = page.getByTestId('tasks');
  await expect(tasks.getByText(s.t.alt)).toBeVisible();
  await expect(page.getByTestId('filter-count')).toHaveCount(0);

  await openFilter(page);
  const sheet = page.getByTestId('filter-sheet');
  for (const name of ['Wer', 'Wann', 'Boards', 'Priorität', 'Außerdem', 'Sortieren nach']) await expect(sheet.getByRole('heading', { name }).or(sheet.getByText(name, { exact: true }).first())).toBeVisible();
  await expect(sheet.getByRole('switch', { name: 'Nur von Wächtern' })).toBeVisible();

  // nur dieses Board: drei Karten mit Termin (die ohne Termin gehört nicht zur Liste, solange „Ohne Termin" nicht gewählt ist)
  await sheet.getByRole('group', { name: 'Boards' }).getByRole('button', { name: new RegExp(s.boardName) }).click();
  await expect(cta(page, /^3 Aufgaben anzeigen$/)).toBeVisible();
  // Priorität Hoch: zwei
  await sheet.getByRole('radiogroup', { name: 'Priorität' }).getByRole('radio', { name: 'Hoch' }).click();
  await expect(cta(page, /^2 Aufgaben anzeigen$/)).toBeVisible();
  // Wann Später: eine (die Zahl an den Chips rechnet die übrige Auswahl mit: „Überfällig" hat jetzt 1, „Später" 1)
  const when = sheet.getByRole('group', { name: 'Wann' });
  await expect(when.getByRole('button', { name: /^Überfällig 1$/ })).toBeVisible();
  await when.getByRole('button', { name: /^Später/ }).click();
  await expect(cta(page, /^1 Aufgabe anzeigen$/)).toBeVisible();
  // Priorität wieder auf Alle, dazu „Ohne Termin": später (2) und ohne Termin (1)
  await sheet.getByRole('radiogroup', { name: 'Priorität' }).getByRole('radio', { name: 'Alle' }).click();
  await when.getByRole('button', { name: /^Ohne Termin/ }).click();
  await expect(cta(page, /^3 Aufgaben anzeigen$/)).toBeVisible();
  // Nur mit offenem Stups: keine Karte
  await sheet.getByRole('switch', { name: 'Nur mit offenem Stups' }).click();
  await expect(cta(page, /^0 Aufgaben anzeigen$/)).toBeVisible();
  await sheet.getByRole('switch', { name: 'Nur mit offenem Stups' }).click();
  await cta(page, /^3 Aufgaben anzeigen$/).click();

  // Liste: Später und eine Gruppe „Ohne Termin"; das Überfällige ist weg; der Knopf zeigt zwei Einstellungen (Wann, Board)
  await expect(tasks.getByTestId('group-later').getByText(s.t.spaetHoch)).toBeVisible();
  await expect(tasks.getByTestId('group-undated').getByText(s.t.ohne)).toBeVisible();
  await expect(tasks.getByText(s.t.alt)).toBeHidden();
  await expect(page.getByTestId('filter-count')).toHaveText('2');

  // Sortierung: Fälligkeit (früher zuerst), Priorität (hoch zuerst)
  const order = async () => (await tasks.getByTestId('group-later').locator('[data-variant=task]').allInnerTexts()).map((x) => (x.includes(s.t.spaetHoch) ? 'hoch' : 'niedrig'));
  expect(await order()).toEqual(['niedrig', 'hoch']);
  await openFilter(page);
  await page.getByRole('radiogroup', { name: 'Sortierung' }).getByRole('radio', { name: 'Priorität' }).click();
  await cta(page, /Aufgaben anzeigen$/).click();
  expect(await order()).toEqual(['hoch', 'niedrig']);
  await expect(page.getByTestId('filter-count')).toHaveText('3');

  // der Kalender nutzt dasselbe Filtermodell: der Knopf dort zeigt dieselben Einstellungen
  await page.getByRole('button', { name: 'Kalender öffnen' }).click();
  await expect(page.getByTestId('calendar-page').getByTestId('filter-count')).toHaveText('3');
  await page.getByTestId('calendar-page').getByRole('button', { name: /^Aufgaben$/ }).click();

  // gemerkt auf diesem Gerät: nach dem Neuladen steht alles noch so
  await page.reload();
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' }).click();
  await expect(page.getByTestId('filter-count')).toHaveText('3');
  await expect(tasks.getByTestId('group-undated').getByText(s.t.ohne)).toBeVisible();
  await openFilter(page);
  await expect(page.getByTestId('filter-sheet').getByRole('group', { name: 'Wann' }).getByRole('button', { name: /^Später/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('filter-sheet').getByRole('radiogroup', { name: 'Sortierung' }).getByRole('radio', { name: 'Priorität' })).toHaveAttribute('aria-checked', 'true');

  // Zurücksetzen: alles wie am Anfang
  await page.getByRole('dialog').getByRole('button', { name: 'Zurücksetzen' }).click();
  await expect(page.getByRole('dialog').getByRole('radiogroup', { name: 'Sortierung' }).getByRole('radio', { name: 'Fälligkeit' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('dialog').getByRole('button', { name: /Aufgaben anzeigen$/ }).click();
  await expect(page.getByTestId('filter-count')).toHaveCount(0);
  await expect(tasks.getByText(s.t.alt)).toBeVisible();
  await expect(tasks.getByText(s.t.ohne)).toBeHidden();
});
