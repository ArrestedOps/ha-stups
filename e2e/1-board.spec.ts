import { expect, test, type Page } from '@playwright/test';

let counter = 0;
const uniqueTitle = (base: string) => `${base} ${Date.now().toString(36)}${counter++}`;

const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const card = (page: Page, title: string) => page.locator('[role=presentation]').filter({ hasText: title });

async function addCard(page: Page, title: string, due?: string) {
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await page.getByLabel('Titel').fill(title);
  if (due) {
    await page.getByRole('button', { name: /Fälligkeit/ }).click();
    await page.getByLabel('Fälligkeit mit Datum und Uhrzeit').fill(due);
  }
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
}

/** Wischen mit dem Finger: WebKit kann Touch nicht simulieren, darum Zeiger-Ereignisse wie bei einem Finger. */
async function swipe(page: Page, title: string, direction: 'left' | 'right') {
  await card(page, title)
    .first()
    .evaluate(async (el, dir) => {
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const from = r.left + r.width * (dir === 'left' ? 0.8 : 0.2);
      const to = r.left + r.width * (dir === 'left' ? 0.1 : 0.9);
      const fire = (type: string, x: number) =>
        el.dispatchEvent(
          new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x, clientY: y }),
        );
      fire('pointerdown', from);
      for (let i = 1; i <= 8; i++) {
        fire('pointermove', from + ((to - from) * i) / 8);
        await new Promise((res) => setTimeout(res, 10));
      }
      fire('pointerup', to);
    }, direction);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tablist', { name: 'Spalten' })).toBeVisible();
  await tab(page, 'Offen').click();
});

test('Karte anlegen: erscheint in „Offen"', async ({ page }) => {
  const title = uniqueTitle('Bad putzen');
  await addCard(page, title);
  await expect(card(page, title)).toBeVisible();
});

test('Wischen: Finger nach links = nächster Status, nach rechts = zurück', async ({ page }) => {
  const title = uniqueTitle('Wischtest');
  await addCard(page, title);

  await swipe(page, title, 'left');
  await expect(card(page, title)).toHaveCount(0); // aus „Offen" weg
  await tab(page, 'In Arbeit').click();
  await expect(card(page, title)).toBeVisible();

  await swipe(page, title, 'right');
  await tab(page, 'Offen').click();
  await expect(card(page, title)).toBeVisible();
});

test('Erledigen per Kreis, „Rückgängig" stellt die Karte wieder her', async ({ page }) => {
  const title = uniqueTitle('Erledigen');
  await addCard(page, title);

  await page.getByRole('button', { name: `„${title}“ erledigen` }).click();
  await expect(card(page, title)).toHaveCount(0);
  await tab(page, 'Erledigt').click();
  await expect(card(page, title)).toBeVisible();

  await page.getByRole('status').getByRole('button', { name: 'Rückgängig' }).click();
  await tab(page, 'Offen').click();
  await expect(card(page, title)).toBeVisible();
});

test('Termin nach heute: die Karte landet von selbst in „Geplant"', async ({ page }) => {
  const title = uniqueTitle('Später');
  const nextYear = await page.evaluate(() => `${new Date().getFullYear() + 1}-06-15T09:00`);
  await addCard(page, title, nextYear);

  await expect(card(page, title)).toHaveCount(0); // nicht in „Offen"
  await tab(page, 'Geplant').click();
  await expect(card(page, title)).toBeVisible();
});

test('In „Geplant" angelegt, aber Termin heute: die Karte kommt nach „Offen" statt eines Fehlers', async ({ page }) => {
  const title = uniqueTitle('Heute statt geplant');
  const today = await page.evaluate(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:30`;
  });
  await tab(page, 'Geplant').click();
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await page.getByLabel('Titel').fill(title);
  // In Geplant ist morgen 09:00 vorbelegt; der Termin wird auf heute geändert
  await page.getByRole('group', { name: 'Eigenschaften' }).getByRole('button', { name: /morgen 09:00/ }).click();
  await page.getByLabel('Fälligkeit mit Datum und Uhrzeit').fill(today);
  await page.getByLabel('Fälligkeit mit Datum und Uhrzeit').blur(); // das Feld meldet die Änderung beim Verlassen
  await expect(page.getByRole('status').filter({ hasText: 'Termin heute oder keiner' })).toBeVisible();
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
  await tab(page, 'Offen').click();
  await expect(card(page, title)).toBeVisible();
});

test('Neue Karte: wer sie anlegt, ist zuerst selbst zuständig (sonst gäbe es keine Erinnerung)', async ({ page }) => {
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Eigenschaften' }).getByRole('button', { name: /Rene/ })).toBeVisible();
});

test('Neue Karte: Kategorie direkt anlegen und gleich wählen, ein vorhandener Name wird wiederverwendet', async ({ page }) => {
  const title = uniqueTitle('Kategorie');
  const cat = `Garten ${Date.now().toString(36)}`;
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await page.getByLabel('Titel').fill(title);
  const sheet = page.getByRole('dialog', { name: 'Neue Karte' });
  // Auswahl-Chip im Fenster (die Filter-Chips über der Liste und der Eigenschaften-Knopf tragen denselben Namen)
  const chip = sheet.locator('button[aria-pressed]', { hasText: new RegExp(`^${cat}$`, 'i') });
  await page.getByRole('group', { name: 'Eigenschaften' }).getByRole('button', { name: /Kategorie/ }).click();

  // neu anlegen: Enter im Feld, die Kategorie ist sofort gewählt
  await page.getByLabel('Name der neuen Kategorie').fill(cat);
  await page.getByLabel('Name der neuen Kategorie').press('Enter');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');

  // derselbe Name (andere Schreibweise) legt keine zweite an
  await chip.click(); // abwählen
  await page.getByLabel('Name der neuen Kategorie').fill(cat.toUpperCase());
  await page.getByRole('button', { name: 'Erstellen' }).click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(chip).toHaveCount(1);

  await page.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
  await expect(card(page, title).getByText(cat)).toBeVisible();
});

test('Termin setzen ohne Zuständige: Hinweis, dass keine Erinnerung kommt, mit „Mir zuweisen“', async ({ page, request }) => {
  const boards = await (await request.get('/api/boards')).json();
  const view = await (await request.get(`/api/boards/${boards[0].id}`)).json();
  const title = uniqueTitle('Ohne Zuständige');
  await request.post(`/api/boards/${boards[0].id}/cards`, { data: { title, columnId: view.columns[0].id } });

  await page.reload();
  await tab(page, 'Offen').click();
  await card(page, title).getByText(title).click();
  await page.getByRole('group', { name: 'Eigenschaften' }).getByRole('button', { name: /Fälligkeit/ }).click();
  await page.getByRole('button', { name: 'Morgen 09:00' }).click();

  const hint = page.getByRole('status').filter({ hasText: 'Niemand ist zuständig' });
  await expect(hint).toBeVisible();
  await hint.getByRole('button', { name: 'Mir zuweisen' }).click();
  await expect(page.getByRole('group', { name: 'Eigenschaften' }).getByRole('button', { name: /Rene/ })).toBeVisible();
});
test('Menü „⋯": Duplizieren legt eine Kopie an', async ({ page }) => {
  const title = uniqueTitle('Original');
  await addCard(page, title);

  await page.getByRole('button', { name: `Menü für „${title}“` }).click();
  await page.getByRole('button', { name: 'Duplizieren' }).click();
  await expect(card(page, `${title} (Kopie)`)).toBeVisible();
});

test('Karten-Fenster: „Erledigt" und „Speichern" oben', async ({ page }) => {
  const title = uniqueTitle('Fenster');
  await addCard(page, title);

  await card(page, title).getByText(title).click();
  await expect(page.getByRole('button', { name: /Speichern/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Erledigt/ }).first()).toBeVisible();
});

test('Erledigte Karte: nicht mehr „überfällig", zeigt die Erledigt-Zeit und den Verlauf', async ({ page }) => {
  const title = uniqueTitle('Verlauf');
  await addCard(page, title, '2020-01-15T09:00');
  await expect(card(page, title).getByText(/Überfällig/)).toBeVisible();

  await page.getByRole('button', { name: `„${title}“ erledigen` }).click();
  await tab(page, 'Erledigt').click();
  await expect(card(page, title).getByText(/Überfällig/)).toHaveCount(0);
  await expect(card(page, title).getByTestId('card-done-at')).toContainText('Erledigt heute');

  await card(page, title).getByText(title).click();
  await expect(page.getByTestId('done-note')).toContainText('Erledigt heute');
  // exakter Name: ohne den Zusatz „· überfällig"
  await expect(page.getByRole('button', { name: '15. Jan 2020 09:00', exact: true })).toBeVisible();
  const verlauf = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Verlauf' }) });
  await expect(verlauf).toContainText('Angelegt');
  await expect(verlauf).toContainText('Erledigt');
});

test('Neue Karte: alle Felder gleich beim Anlegen (Priorität, Beschreibung, Checkliste, Link, Kosten)', async ({ page, request }) => {
  const title = uniqueTitle('Date-Idee');
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await page.getByLabel('Titel').fill(title);

  await page.getByRole('button', { name: 'Priorität' }).click();
  await page.getByRole('group', { name: 'Priorität' }).getByRole('button', { name: 'Hoch' }).click();
  await page.getByRole('button', { name: 'Kosten' }).click();
  await page.getByLabel('Kosten in Euro').fill('49,90');
  await page.getByLabel('Beschreibung').fill('Tisch für zwei reservieren');

  await page.getByLabel('Neuer Eintrag').fill('Reservieren');
  await page.getByLabel('Neuer Eintrag').press('Enter');
  await page.getByLabel('Neuer Link').fill('maps.apple.com/?q=Restaurant');
  await page.getByLabel('Neuer Link').press('Enter');

  await page.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();

  // Budget in der Kopfzeile des Boards
  // (der Test läuft in Hell und Dunkel auf demselben Board, die Summe wächst also mit)
  await expect(page.getByLabel('Kosten im Board')).toContainText(/\d[\d.]*,\d\d\s€ offen/);

  const boards = await (await request.get('/api/boards')).json();
  const cards = (await (await request.get(`/api/boards/${boards[0].id}`)).json()).cards as { id: string; title: string }[];
  const created = cards.find((c) => c.title === title)!;
  const detail = await (await request.get(`/api/cards/${created.id}`)).json();
  expect(detail).toMatchObject({ priority: 'high', costCents: 4990, description: 'Tisch für zwei reservieren' });
  expect(detail.checklistItems.map((i: { text: string }) => i.text)).toEqual(['Reservieren']);
  expect(detail.links.map((l: { url: string }) => l.url)).toEqual(['https://maps.apple.com/?q=Restaurant']);
});

test('Karte zeigt „Angelegt …“ und einen Farbbalken für die Dringlichkeit', async ({ page }) => {
  const title = uniqueTitle('Balken');
  await addCard(page, title, '2020-01-15T09:00'); // längst überfällig
  const row = card(page, title);
  await expect(row.getByTestId('card-created')).toHaveText('Angelegt heute');
  const color = await row.locator('span[aria-hidden=true]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(color).toMatch(/^rgb\(/); // der Balken ist gefärbt (rot, überfällig)

  await row.getByText(title).click();
  await expect(page.getByTestId('created-note')).toContainText('Angelegt heute');
});
test('Theme folgt dem System (hell/dunkel)', async ({ page }, info) => {
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe(info.project.name === 'dunkel' ? 'rgb(14, 13, 16)' : 'rgb(255, 246, 238)');
});

test('Handy-Layout: nichts ragt seitlich heraus', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

