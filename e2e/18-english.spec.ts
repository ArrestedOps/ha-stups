import { expect, test, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Das Gerät meldet Englisch (Projekt „english“, locale en-GB): Stups zeigt sich auf Englisch, ohne dass jemand etwas einstellt.
// Läuft auf dem Server der anderen Projekte; die Person bleibt am Ende auf „Automatisch“, sonst würde die Wahl die anderen Projekte stören.

/** Deutsche Wörter, die in den Kernabläufen nicht mehr auftauchen dürfen (die Spaltennamen sind Daten und stehen hier nicht zur Prüfung) */
const GERMAN = /\b(Aufgabe|Aufgaben|Speichern|Abbrechen|Einstellungen|Löschen|Neue|Neues|Fertig|Heute|Morgen|überfällig|Wächter|Kalender|Zuständig|Wiederholung|Beschreibung|Anlegen|Zurück|Weiter|Suchen|Lädt|Rückgängig|Schließen)\b/;

/** `scope`: nur diesen Teil prüfen (Agenda und Kalender zeigen auch Aufgaben anderer Tests, das sind Daten) */
async function noGerman(page: Page, where: string, scope = 'body') {
  const text = await page.evaluate((selector) => {
    const parts = [...document.querySelectorAll<HTMLElement>(selector)];
    return parts
      .map((part) => {
        const clone = part.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[role=tablist]').forEach((e) => e.remove()); // Spaltennamen sind Daten
        return clone.innerText;
      })
      .join('\n');
  }, scope);
  expect(text.match(GERMAN)?.[0] ?? null, `deutsches Wort (${where})`).toBeNull();
}

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.afterEach(async ({ request }) => {
  await request.put('/api/me/language', { data: { choice: 'auto', effective: 'en' }, headers: { 'x-stups-client': 'e2e' } });
});

test('Englisches Gerät: Board, Schnell-Eingabe, Erledigen, alles auf Englisch', async ({ page, request }) => {
  const board = await (await request.post('/api/boards', { data: { name: 'English test' } })).json();
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  await page.goto('/');
  await openBoards(page);

  await expect(page.getByRole('button', { name: 'Switch board' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'View' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'View' }).getByRole('button', { name: 'Tasks' })).toBeVisible();
  await expect(page.getByPlaceholder('Search cards')).toHaveCount(0);
  await noGerman(page, 'Board');
  await noSideScroll(page);

  // Neue Aufgabe mit der Schnell-Eingabe auf Englisch
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  // „heute“, damit die Aufgabe in der offenen Spalte landet (Termine nach heute kommen nach „Geplant“)
  await page.getByLabel('What needs doing?').fill('Take out trash today 11:59pm !!');
  const chips = page.getByTestId('quick-chip');
  await expect(chips.filter({ hasText: 'High priority' })).toHaveCount(1);
  await expect(chips.filter({ hasText: /\b23:59\b/ })).toHaveCount(1);
  await noGerman(page, 'Neue Aufgabe');
  await noSideScroll(page);
  await page.getByRole('button', { name: 'Create task' }).click();

  const list = page.getByRole('list');
  await expect(list.getByText('Take out trash', { exact: true })).toBeVisible();
  await noGerman(page, 'Aufgabe in der Liste');

  // Erledigen: Hinweis mit „Undo“
  await page.getByRole('checkbox', { name: /^Complete .Take out trash.$/ }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await noGerman(page, 'Hinweis');
});

test('Englisches Gerät: Aufgaben mit Liste und Kalenderansichten, Wächter, Einstellungen, Aufgaben-Fenster', async ({ page, request }) => {
  const board = await (await request.post('/api/boards', { data: { name: 'English test 2' } })).json();
  const view = await (await request.get(`/api/boards/${board.id}`)).json();
  await request.post(`/api/boards/${board.id}/cards`, {
    // Knapp überfällig statt „in 10 Minuten": ein Termin nach Mitternacht schickt die Aufgabe nach „Planned", und der Test fände sie nicht in „Open"
    data: { title: 'Dentist', columnId: view.columns[0].id, dueAt: new Date(Date.now() - 60_000).toISOString() },
  });
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  await page.goto('/');
  await openBoards(page);
  const nav = page.getByRole('navigation', { name: 'View' });

  await nav.getByRole('button', { name: 'Tasks' }).click();
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await noGerman(page, 'Aufgaben', 'header, nav');
  await noSideScroll(page);
  // die Liste (die frühere Agenda): Gruppen und Chips auf Englisch
  await page.getByTestId('scope-button').click();
  await page.getByRole('menuitemradio', { name: 'All tasks' }).click();
  await expect(page.getByTestId('tasks').getByText('Dentist').first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'Your numbers' })).toBeVisible();
  await noGerman(page, 'Liste', 'header, nav');
  await noSideScroll(page);

  // Tag, Woche, Monat (der frühere Kalender): eine Seite unter Aufgaben, der Kalender-Knopf der Wochenleiste öffnet sie
  await nav.getByRole('button', { name: 'Calendar' }).click();
  const views = page.getByRole('radiogroup', { name: 'View' });
  await expect(views.getByRole('radio', { name: 'Week', exact: true })).toBeVisible();
  await views.getByRole('radio', { name: 'Week', exact: true }).click();
  await noGerman(page, 'Kalender', 'header, nav');
  await noSideScroll(page);
  await views.getByRole('radio', { name: 'Month', exact: true }).click();
  await noSideScroll(page);
  await nav.getByRole('button', { name: 'Tasks' }).click();

  await nav.getByRole('button', { name: 'Watchers' }).click();
  await noGerman(page, 'Zuhause');
  await noSideScroll(page);

  await nav.getByRole('button', { name: 'Boards' }).click();
  await page.getByTestId('board-list').getByRole('button', { name: /English test 2/ }).click();
  await page.getByRole('group', { name: 'People' }).getByRole('button', { name: 'All', exact: true }).click(); // Boards starts at „Mine“
  await page.getByRole('button', { name: /^Dentist/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Description')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Mark as done' })).toBeVisible();
  await noGerman(page, 'Aufgaben-Fenster');
  await noSideScroll(page);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click(); // schließt das Fenster

  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('dialog').getByText('Settings', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('dialog').getByText('For me', { exact: true }).first()).toBeVisible();
  await noGerman(page, 'Einstellungen');
  await noSideScroll(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Language and colour' }).click();
  await expect(page.getByRole('dialog').getByText('Language', { exact: true }).first()).toBeVisible();
  await noGerman(page, 'Sprache und Farbe');
});

test('Englisches Gerät: Home-Knopf, Mitteilungen und Dashboard-Wahl auf Englisch', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Back to Home Assistant' })).toBeVisible();
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Notifications' });
  for (const chip of ['All', 'Nudges', 'Watchers', 'Done', 'Comments']) await expect(sheet.getByRole('group', { name: 'Kind of notification' }).getByRole('button', { name: chip, exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Mark all read' })).toBeVisible();
  await noGerman(page, 'Mitteilungen', '[role=dialog]');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Dashboard', exact: true }).click();
  const choose = page.getByRole('dialog', { name: 'Dashboard' });
  await expect(choose.getByRole('button', { name: /^Default \(/ })).toBeVisible();
  await expect(choose.getByRole('button', { name: /^Home Assistant default/ })).toBeVisible();
  await expect(choose.getByRole('button', { name: /^Custom path/ })).toBeVisible();
  await noGerman(page, 'Dashboard-Wahl', '[role=dialog]');
});

test('Sprache wechseln: Deutsch sofort, zurück auf Automatisch wieder Englisch; die Wahl gilt für die Person', async ({ page, request }) => {
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Open settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Language and colour' }).click();
  await dialog.getByLabel('Language', { exact: true }).selectOption('de');

  // sofort deutsch, ohne Neuladen
  await expect(dialog.getByText('Sprache', { exact: true }).first()).toBeVisible();
  expect((await (await request.get('/api/me')).json()).user).toMatchObject({ languageChoice: 'de', language: 'de' });

  // die Wahl bleibt nach dem Neuladen (auch wenn das Gerät Englisch meldet)
  await page.reload();
  await openBoards(page);
  await expect(page.getByRole('button', { name: 'Einstellungen öffnen' })).toBeVisible();

  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sprache und Farbe' }).click();
  await page.getByRole('dialog').getByLabel('Sprache', { exact: true }).selectOption('auto');
  await expect(page.getByRole('dialog').getByText('Language', { exact: true }).first()).toBeVisible();
  expect((await (await request.get('/api/me')).json()).user.languageChoice).toBe('auto');
});

test('Die Sprache des Geräts wird dem Server gemeldet (für Push)', async ({ page, request }) => {
  await page.goto('/');
  await openBoards(page);
  await expect(page.getByRole('button', { name: 'Switch board' })).toBeVisible();
  await expect.poll(async () => (await (await request.get('/api/me')).json()).user.language).toBe('en');
});
