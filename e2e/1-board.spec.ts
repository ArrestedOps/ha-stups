import { expect, test, type Page } from '@playwright/test';
import { newTaskSheet, openBoards, pickDue } from './helpers';

let counter = 0;
const uniqueTitle = (base: string) => `${base} ${Date.now().toString(36)}${counter++}`;

const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const card = (page: Page, title: string) => page.locator('[role=presentation]').filter({ hasText: title });

async function addCard(page: Page, title: string, due?: string) {
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await page.getByLabel('Was steht an?').fill(title);
  if (due) await pickDue(page, due);
  await page.getByRole('button', { name: 'Aufgabe anlegen' }).click();
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
  await openBoards(page);
  await expect(page.getByRole('tablist', { name: 'Spalten' })).toBeVisible();
  await tab(page, 'Offen').click();
});

test('Karte anlegen: erscheint in „Offen"', async ({ page }) => {
  const title = uniqueTitle('Bad putzen');
  await addCard(page, title);
  await expect(card(page, title)).toBeVisible();
});

test('Wischen: Finger nach rechts = nächster Status, nach links = zurück', async ({ page }) => {
  const title = uniqueTitle('Wischtest');
  await addCard(page, title);

  await swipe(page, title, 'right');
  await expect(card(page, title)).toHaveCount(0); // aus „Offen" weg
  await tab(page, 'In Arbeit').click();
  await expect(card(page, title)).toBeVisible();

  await swipe(page, title, 'left');
  await tab(page, 'Offen').click();
  await expect(card(page, title)).toBeVisible();
});

test('Erledigen per Kreis, „Rückgängig" stellt die Karte wieder her', async ({ page }) => {
  const title = uniqueTitle('Erledigen');
  await addCard(page, title);

  await page.getByRole('checkbox', { name: `„${title}“ erledigen` }).click();
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

test('Plus-Knopf: legt in „Offen" an, auch wenn gerade „Erledigt" oder „Geplant" zu sehen ist', async ({ page }) => {
  for (const reiter of ['Erledigt', 'Geplant']) {
    const title = uniqueTitle(`Von ${reiter}`);
    await tab(page, reiter).click();
    await addCard(page, title);
    await expect(card(page, title)).toHaveCount(0); // nicht in dem Reiter, in dem man stand
    await tab(page, 'Offen').click();
    await expect(card(page, title)).toBeVisible();
  }
});

test('Termin auf heute gestellt: die Karte bleibt in „Offen", ohne Fehler', async ({ page }) => {
  // Kein Datumswort im Titel („heute" würde die Schnell-Eingabe als Termin lesen)
  const title = uniqueTitle('Sofort dran');
  const today = await page.evaluate(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:30`;
  });
  await addCard(page, title, today);
  await expect(card(page, title)).toBeVisible();
});

test('Neue Karte: wer sie anlegt, ist zuerst selbst zuständig (sonst gäbe es keine Erinnerung)', async ({ page }) => {
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Wer kümmert sich?' }).getByRole('button', { name: 'Ich' })).toHaveAttribute('aria-pressed', 'true');
});

test('Fenster: der Fokus kommt hinein, Tab bleibt darin, nach Escape liegt er wieder am Knopf', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Neue Karte', exact: true });
  await opener.focus();
  await page.keyboard.press('Enter');
  const sheet = newTaskSheet(page);
  await expect(sheet).toBeVisible();
  const inDialog = () => page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'));
  await expect.poll(inDialog).toBe(true);
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab');
    expect(await inDialog()).toBe(true);
  }
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await inDialog()).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('Neue Karte: Kategorie direkt anlegen und gleich wählen, ein vorhandener Name wird wiederverwendet', async ({ page }) => {
  const title = uniqueTitle('Kategorie');
  const cat = `Garten ${Date.now().toString(36)}`;
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  await page.getByLabel('Was steht an?').fill(title);
  const sheet = newTaskSheet(page);
  // Auswahl-Chip im Fenster (die Filter-Chips über der Liste tragen denselben Namen)
  const chip = sheet.locator('button[aria-pressed]', { hasText: new RegExp(`^${cat}\\s*$`, 'i') });
  const form = sheet.getByRole('group', { name: 'Neue Kategorie' });
  await sheet.getByRole('button', { name: 'Neue Kategorie' }).click();

  // neu anlegen: Enter im Feld, die Kategorie ist sofort gewählt, das Formular klappt zu
  await form.getByRole('textbox', { name: 'Neue Kategorie' }).fill(cat);
  await form.getByRole('textbox', { name: 'Neue Kategorie' }).press('Enter');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(form).toHaveCount(0);

  // derselbe Name (andere Schreibweise) legt keine zweite an
  await chip.click(); // abwählen
  await sheet.getByRole('button', { name: 'Neue Kategorie' }).click();
  await form.getByRole('textbox', { name: 'Neue Kategorie' }).fill(cat.toUpperCase());
  await form.getByRole('button', { name: 'Anlegen' }).click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(chip).toHaveCount(1);

  await page.getByRole('button', { name: 'Aufgabe anlegen' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Karte angelegt' })).toBeVisible();
  // in der Liste zeigen Punkte die Kategorie, der Name steht für Vorlese-Programme daran (und im Karten-Fenster)
  await expect(card(page, title).getByTestId('card-categories')).toHaveAttribute('aria-label', new RegExp(cat));
});

test('Neue Karte: eigene Farbe für die neue Kategorie, die Farbpunkte sind per Tastatur wählbar', async ({ page }) => {
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  const sheet = newTaskSheet(page);
  await sheet.getByRole('button', { name: 'Neue Kategorie' }).click();
  const colors = sheet.getByRole('radiogroup', { name: 'Farbe der Kategorie' });
  await expect(colors.getByRole('radio')).toHaveCount(7);
  await colors.getByRole('radio', { name: 'Pink' }).click();
  await expect(colors.getByRole('radio', { name: 'Pink' })).toHaveAttribute('aria-checked', 'true');
  await expect(colors.getByRole('radio', { name: 'Blau' })).toHaveAttribute('aria-checked', 'false');
});

test('Termin setzen ohne Zuständige: Hinweis, dass keine Erinnerung kommt, mit „Mir zuweisen“', async ({ page, request }) => {
  const boards = await (await request.get('/api/boards')).json();
  const view = await (await request.get(`/api/boards/${boards[0].id}`)).json();
  const title = uniqueTitle('Ohne Zuständige');
  await request.post(`/api/boards/${boards[0].id}/cards`, { data: { title, columnId: view.columns[0].id } });

  await page.reload();

  await openBoards(page);
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

test('Karten-Fenster: „Erledigt" und „Fertig" oben (alles speichert sofort, „Fertig" schließt nur)', async ({ page }) => {
  const title = uniqueTitle('Fenster');
  await addCard(page, title);

  await card(page, title).getByText(title).click();
  await expect(page.getByRole('button', { name: 'Fertig', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Speichern/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Erledigt/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Fertig', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fertig', exact: true })).toHaveCount(0);
});

test('Erledigte Karte: nicht mehr „überfällig", zeigt die Erledigt-Zeit und den Verlauf', async ({ page }) => {
  const title = uniqueTitle('Verlauf');
  await addCard(page, title, '2020-01-15T09:00');
  await expect(card(page, title).getByTestId('card-due')).toHaveAttribute('data-overdue', 'true');

  await page.getByRole('checkbox', { name: `„${title}“ erledigen` }).click();
  await tab(page, 'Erledigt').click();
  await expect(card(page, title).getByTestId('card-due')).toHaveAttribute('data-overdue', 'false');
  await expect(card(page, title).getByTestId('card-done-at')).toContainText('Erledigt heute');

  await card(page, title).getByText(title).click();
  await expect(page.getByTestId('done-note')).toContainText('Erledigt heute');
  // exakter Name: ohne den Zusatz „· überfällig"
  await expect(page.getByRole('button', { name: '15. Jan 2020 09:00', exact: true })).toBeVisible();
  const verlauf = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Verlauf' }) });
  await expect(verlauf).toContainText('Angelegt');
  await expect(verlauf).toContainText('Erledigt');
});

test('Neue Karte: Felder gleich beim Anlegen (Priorität, Notiz, Checkliste, Link); Kosten gibt es danach an der Karte', async ({ page, request }) => {
  const title = uniqueTitle('Date-Idee');
  await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
  const sheet = newTaskSheet(page);
  await page.getByLabel('Was steht an?').fill(title);

  await sheet.getByRole('radiogroup', { name: 'Priorität' }).getByRole('radio', { name: 'Hoch' }).click();
  await page.getByLabel('Freitext, Details, Maße …').fill('Tisch für zwei reservieren');

  // „Mehr“: nur Checkliste und Foto / Link
  await sheet.getByRole('button', { name: 'Checkliste' }).click();
  await page.getByLabel('Neuer Eintrag').fill('Reservieren');
  await page.getByLabel('Neuer Eintrag').press('Enter');
  await sheet.getByRole('button', { name: /^Foto \/ Link/ }).click();
  await page.getByLabel('Neuer Link').fill('maps.apple.com/?q=Restaurant');
  await page.getByLabel('Neuer Link').press('Enter');

  await page.getByRole('button', { name: 'Aufgabe anlegen' }).click();
  const made = page.getByRole('status').filter({ hasText: 'Karte angelegt' });
  await expect(made).toBeVisible();

  // Kosten: an der Karte (im Fenster „Neue Aufgabe“ gibt es sie nicht mehr)
  await made.getByRole('button', { name: 'Öffnen' }).click();
  const props = page.getByRole('group', { name: 'Eigenschaften' });
  await props.getByRole('button', { name: 'Kosten' }).click();
  await page.getByLabel('Kosten in Euro').fill('49,90');
  await page.getByLabel('Kosten in Euro').blur();
  await expect(page.getByText('Kosten dieser Karte')).toBeVisible();
  await page.getByRole('button', { name: 'Fertig' }).click();

  // Budget: steht im Blatt „Filter" des Boards (der Test läuft in Hell und Dunkel auf demselben Board, die Summe wächst also mit)
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByTestId('filter-sheet').getByText('Kosten im Board').locator('..')).toContainText(/\d[\d.]*,\d\d\s€ offen/);
  await page.getByRole('dialog').getByRole('button', { name: 'Schließen' }).first().click();

  const boards = await (await request.get('/api/boards')).json();
  const cards = (await (await request.get(`/api/boards/${boards[0].id}`)).json()).cards as { id: string; title: string }[];
  const created = cards.find((c) => c.title === title)!;
  const detail = await (await request.get(`/api/cards/${created.id}`)).json();
  expect(detail).toMatchObject({ priority: 'high', costCents: 4990, description: 'Tisch für zwei reservieren' });
  expect(detail.checklistItems.map((i: { text: string }) => i.text)).toEqual(['Reservieren']);
  expect(detail.links.map((l: { url: string }) => l.url)).toEqual(['https://maps.apple.com/?q=Restaurant']);
});

test('Überfälliges: der Termin ist rot (kein Balken mehr, der Kreis bleibt grau wie im Mockup); „Angelegt …“ steht nur im Karten-Fenster', async ({ page }) => {
  const title = uniqueTitle('Balken');
  await addCard(page, title, '2020-01-15T09:00'); // längst überfällig
  const row = card(page, title);
  await expect(row.getByText(/^Angelegt/)).toHaveCount(0); // nicht mehr in der Liste
  // Im Board trägt die rote Uhrzeit die Dringlichkeit; der Erledigt-Kreis ist wie im Mockup immer grau
  const ring = await row.getByRole('checkbox').locator('span').first().evaluate((el) => getComputedStyle(el).borderTopColor);
  const due = await row.getByTestId('card-due').evaluate((el) => getComputedStyle(el).color);
  expect(ring).toMatch(/^rgb\(/);
  // Der Termin trägt die Gefahr-Farbe des jeweiligen Themas (Token --danger)
  const danger = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--danger)';
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  expect(due).toBe(danger);
  expect(ring).not.toBe(due);

  await row.getByText(title).click();
  await expect(page.getByTestId('created-note')).toContainText('Angelegt heute');
});
test('Theme folgt dem System (hell/dunkel)', async ({ page }, info) => {
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe(info.project.name === 'dunkel' ? 'rgb(14, 13, 13)' : 'rgb(255, 246, 238)');
});

test('Handy-Layout: nichts ragt seitlich heraus', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});


test('Karte: die Kategorie steht in der Zeile, die Zuständigen als Bild rechts (kein Personenname in der Zeile)', async ({ page, request }) => {
  const headers = { 'x-stups-client': 'e2e' };
  const boards = (await (await request.get('/api/boards')).json()) as { id: string }[];
  const board = boards[0]!;
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string }[] };
  const cat = (await (await request.post(`/api/boards/${board.id}/categories`, { data: { name: 'Putzen', color: 'blue' }, headers })).json()) as { id: string };
  const me = ((await (await request.get('/api/me')).json()) as { user: { id: string } }).user;
  const title = uniqueTitle('Kategorietest');
  const created = await request.post(`/api/boards/${board.id}/cards`, { data: { columnId: view.columns[0]!.id, title, categoryIds: [cat.id], assigneeIds: [me.id] }, headers });
  expect(created.status()).toBe(201);

  await openBoards(page);
  const row = card(page, title).first();
  await expect(row.getByTestId('card-category')).toContainText('Putzen');
  await expect(row.getByTestId('card-assignees')).toHaveAttribute('aria-label', /Zuständig: /);
  await expect(row.getByTestId('card-person')).toHaveCount(0);
});
