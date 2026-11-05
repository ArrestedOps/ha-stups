import { expect, test, type Page } from '@playwright/test';

// Das Gerät meldet Englisch (Projekt „english“, locale en-GB): Stups zeigt sich auf Englisch, ohne dass jemand etwas einstellt.
// Läuft auf dem Server der anderen Projekte; die Person bleibt am Ende auf „Automatisch“, sonst würde die Wahl die anderen Projekte stören.

/** Deutsche Wörter, die in den Kernabläufen nicht mehr auftauchen dürfen (die Spaltennamen sind Daten und stehen hier nicht zur Prüfung) */
const GERMAN = /\b(Karte|Karten|Speichern|Abbrechen|Einstellungen|Löschen|Neue|Neues|Fertig|Heute|Morgen|überfällig|Wächter|Kalender|Zuständig|Wiederholung|Beschreibung|Anlegen|Zurück|Weiter|Suchen|Lädt|Rückgängig|Schließen)\b/;

/** `scope`: nur diesen Teil prüfen (Agenda und Kalender zeigen auch Karten anderer Tests, das sind Daten) */
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

  await expect(page.getByRole('button', { name: 'Switch board' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'View' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'View' }).getByRole('button', { name: 'Tasks' })).toBeVisible();
  await expect(page.getByPlaceholder('Search cards')).toHaveCount(0);
  await noGerman(page, 'Board');
  await noSideScroll(page);

  // Neue Karte mit der Schnell-Eingabe auf Englisch
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  // „heute“, damit die Karte in der offenen Spalte landet (Termine nach heute kommen nach „Geplant“)
  await page.getByLabel('Title').fill('Take out trash today 11:59pm !!');
  const chips = page.getByTestId('quick-chip');
  await expect(chips.filter({ hasText: 'High priority' })).toHaveCount(1);
  await expect(chips.filter({ hasText: /\b23:59\b/ })).toHaveCount(1);
  await noGerman(page, 'Neue Karte');
  await noSideScroll(page);
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  const list = page.getByRole('list');
  await expect(list.getByText('Take out trash', { exact: true })).toBeVisible();
  await noGerman(page, 'Karte in der Liste');

  // Erledigen: Hinweis mit „Undo“
  await page.getByRole('checkbox', { name: /^Complete .Take out trash.$/ }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await noGerman(page, 'Hinweis');
});

test('Englisches Gerät: Aufgaben mit Liste und Kalenderansichten, Wächter, Einstellungen, Karten-Fenster', async ({ page, request }) => {
  const board = await (await request.post('/api/boards', { data: { name: 'English test 2' } })).json();
  const view = await (await request.get(`/api/boards/${board.id}`)).json();
  await request.post(`/api/boards/${board.id}/cards`, {
    // Knapp überfällig statt „in 10 Minuten": ein Termin nach Mitternacht schickt die Karte nach „Planned", und der Test fände sie nicht in „Open"
    data: { title: 'Dentist', columnId: view.columns[0].id, dueAt: new Date(Date.now() - 60_000).toISOString() },
  });
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'View' });

  await nav.getByRole('button', { name: 'Tasks' }).click();
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await noGerman(page, 'Aufgaben', 'header, nav');
  await noSideScroll(page);
  // die Liste (die frühere Agenda): Gruppen und Chips auf Englisch
  await page.getByRole('group', { name: 'People' }).getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByTestId('tasks').getByText('Dentist').first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'Your numbers' })).toBeVisible();
  await noGerman(page, 'Liste', 'header, nav');
  await noSideScroll(page);

  // Tag, Woche, Monat (der frühere Kalender): eine Seite unter Aufgaben, der Kalender-Knopf der Wochenleiste öffnet sie
  await page.getByRole('button', { name: 'Open calendar' }).click();
  const views = page.getByRole('radiogroup', { name: 'View' });
  await expect(views.getByRole('radio', { name: 'Week', exact: true })).toBeVisible();
  await views.getByRole('radio', { name: 'Week', exact: true }).click();
  await noGerman(page, 'Kalender', 'header, nav');
  await noSideScroll(page);
  await views.getByRole('radio', { name: 'Month', exact: true }).click();
  await noSideScroll(page);
  await page.getByRole('button', { name: 'Tasks', exact: true }).first().click(); // „‹ Tasks" oben links

  await nav.getByRole('button', { name: 'Watchers' }).click();
  await noGerman(page, 'Zuhause');
  await noSideScroll(page);

  await nav.getByRole('button', { name: 'Boards' }).click();
  await page.getByRole('button', { name: /^Dentist/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Description')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Mark as done' })).toBeVisible();
  await noGerman(page, 'Karten-Fenster');
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

test('Sprache wechseln: Deutsch sofort, zurück auf Automatisch wieder Englisch; die Wahl gilt für die Person', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Language and colour' }).click();
  await dialog.getByLabel('Language').selectOption('de');

  // sofort deutsch, ohne Neuladen
  await expect(dialog.getByText('Sprache', { exact: true }).first()).toBeVisible();
  expect((await (await request.get('/api/me')).json()).user).toMatchObject({ languageChoice: 'de', language: 'de' });

  // die Wahl bleibt nach dem Neuladen (auch wenn das Gerät Englisch meldet)
  await page.reload();
  await expect(page.getByRole('button', { name: 'Einstellungen öffnen' })).toBeVisible();

  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sprache und Farbe' }).click();
  await page.getByRole('dialog').getByLabel('Sprache').selectOption('auto');
  await expect(page.getByRole('dialog').getByText('Language', { exact: true }).first()).toBeVisible();
  expect((await (await request.get('/api/me')).json()).user.languageChoice).toBe('auto');
});

test('Die Sprache des Geräts wird dem Server gemeldet (für Push)', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Switch board' })).toBeVisible();
  await expect.poll(async () => (await (await request.get('/api/me')).json()).user.language).toBe('en');
});
