import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { newTaskSheet } from './helpers';

// Desktop (1440 × 900, Dunkel und Hell): Seitenleiste statt Leiste unten, Detailspalte statt Sheet, Dialoge statt Bottom-Sheets, Kanban, Tasten.
// Der Test-Server meldet jeden als „rene“ an; die Aufgaben gehören Rene, damit sie unter „Meine“ in Aufgaben stehen.
test.describe.configure({ timeout: 90_000 });

let counter = 0;
const unique = (base: string) => `${base} ${Date.now().toString(36)}${counter++}`;

const sideNav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const dialog = (page: Page) => page.getByRole('dialog');
/** Die Zeile einer Aufgabe in der Liste von Aufgaben (der Antippbereich, nicht der Mehr-Knopf) */
const row = (page: Page, title: string) => page.getByTestId('tasks').locator('button[data-row-open]').filter({ hasText: title });

interface Seed {
  boardId: string;
  boardName: string;
  columns: { id: string; name: string }[];
  cards: { id: string; title: string }[];
}

/** Ein eigenes Board mit drei Aufgaben von Rene (Termine in 5, 10 und 15 Minuten; in den letzten 20 Minuten vor Mitternacht in 1, 2 und 3, damit sie „heute“ bleiben und nicht nach „Geplant“ rücken), die erste mit Checkliste */
async function seed(request: APIRequestContext, extra: { category?: string } = {}): Promise<Seed> {
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string }[];
  const rene = people.find((p) => p.name === 'Rene')!;
  const boardName = unique('Desk');
  const board = await (await request.post('/api/boards', { data: { name: boardName } })).json();
  const view = await (await request.get(`/api/boards/${board.id}`)).json();
  const columns = view.columns as { id: string; name: string }[];
  let categoryId: string | undefined;
  if (extra.category) categoryId = (await (await request.post(`/api/boards/${board.id}/categories`, { data: { name: extra.category, color: 'blue' } })).json()).id;
  const cards: Seed['cards'] = [];
  const dayOf = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(ms));
  const step = dayOf(Date.now() + 20 * 60_000) === dayOf(Date.now()) ? 300_000 : 60_000;
  for (const [i, title] of [unique('Paket'), unique('Bad'), unique('Steuer')].entries()) {
    const c = await (
      await request.post(`/api/boards/${board.id}/cards`, {
        data: { title, columnId: columns[0]!.id, assigneeIds: [rene.id], dueAt: new Date(Date.now() + (i + 1) * step).toISOString(), ...(categoryId && i === 0 ? { categoryIds: [categoryId] } : {}) },
      })
    ).json();
    cards.push({ id: c.id, title });
  }
  await request.post(`/api/cards/${cards[0]!.id}/checklist`, { data: { text: 'Abholschein suchen' } });
  return { boardId: board.id, boardName, columns, cards };
}

async function noHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, 'kein seitliches Scrollen der Seite').toBeLessThanOrEqual(0);
}

test.describe('Aufbau', () => {
  test('Seitenleiste statt Leiste unten: Reiter, Boards, Person; kein „+“-Knopf des Handys, dafür „Neue Aufgabe“ oben', async ({ page, request }) => {
    const s = await seed(request);
    await page.goto('/');
    const side = page.getByTestId('sidebar');
    await expect(side).toBeVisible();
    expect((await side.boundingBox())!.width).toBe(256);
    for (const name of ['Aufgaben', 'Gestupst', 'Heute', 'Überfällig', 'Diese Woche', 'Erledigt', 'Kalender', 'Wächter']) await expect(sideNav(page).getByRole('button', { name: new RegExp(`^${name}( \\d+)?$`) })).toBeVisible();
    await expect(sideNav(page).getByRole('button', { name: 'Aufgaben' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Alle offen' })).toBeVisible();
    await expect(page.getByTestId('new-task')).toBeVisible();
    await expect(sideNav(page).getByRole('button', { name: 'Neue Aufgabe', exact: true })).toHaveCount(0);
    // Person unten mit Zahnrad
    await expect(page.getByTestId('side-user')).toContainText('Rene');
    await expect(page.getByTestId('sidebar').getByRole('button', { name: 'Einstellungen öffnen' })).toBeVisible();

    // Board über die Seitenleiste wählen: Reiter Boards, Titel = Name des Boards, sein Eintrag ist hervorgehoben
    await side.getByRole('navigation', { name: 'Boards' }).getByRole('button', { name: new RegExp(`^${s.boardName}`) }).click();
    await expect(sideNav(page).getByRole('button', { name: 'Boards' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('board-name')).toHaveText(s.boardName);
    await expect(side.getByRole('navigation', { name: 'Boards' }).getByRole('button', { name: new RegExp(`^${s.boardName}`) })).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('kanban')).toBeVisible();
    await noHorizontalScroll(page);
  });

  test('Einstellungen, Filter und Mitteilungen öffnen als Dialog in der Mitte (600 px), Escape schließt, der Fokus kehrt zurück', async ({ page }) => {
    await page.goto('/');
    for (const trigger of [page.getByRole('button', { name: 'Einstellungen öffnen' }), page.getByTestId('bell'), page.getByTestId('filter-button').getByRole('button')]) {
      // WebKit gibt einem Knopf beim Klick nicht überall den Fokus (Safari, Windows), der Klick nimmt ihn sogar weg: mit der Tastatur öffnen
      await trigger.focus();
      await page.keyboard.press('Enter');
      const d = dialog(page);
      await expect(d).toBeVisible();
      // die Übergangsanimation abwarten, dann messen
      await expect.poll(async () => Math.round((await d.boundingBox())!.width)).toBe(600);
      const box = (await d.boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - 720), 'waagerecht mittig').toBeLessThanOrEqual(1);
      expect(box.y, 'oben Abstand').toBeGreaterThan(20);
      expect(box.y + box.height, 'unten Abstand').toBeLessThan(900 - 20);
      await page.keyboard.press('Escape');
      await expect(d).toHaveCount(0);
      await expect(trigger, 'Fokus zurück an den Auslöser').toBeFocused();
    }
  });

  test('Zwischenbreiten: 1024 px mit Seitenleiste; 820 px wie das Handy, zentriert, Sheet höchstens 640 px; sehr breit: Inhalt begrenzt, Seitenleiste fest', async ({ page, request }) => {
    const s = await seed(request);
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('tasks')).toBeVisible();
    await row(page, s.cards[0]!.title).click();
    // schmal: die Detailspalte legt sich über die Liste statt sie zu quetschen
    const detail = page.getByTestId('detail');
    await expect(detail).toBeVisible();
    expect((await detail.boundingBox())!.width).toBe(380);
    expect((await page.getByTestId('tasks').boundingBox())!.width).toBeGreaterThan(600);
    await noHorizontalScroll(page);
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);

    await page.setViewportSize({ width: 820, height: 1100 });
    await expect(page.getByTestId('sidebar')).toHaveCount(0);
    await expect(sideNav(page).getByRole('button', { name: 'Boards' })).toBeVisible(); // die Leiste unten
    await expect(page.getByRole('button', { name: 'Neue Aufgabe', exact: true })).toBeVisible();
    const col = (await page.getByTestId('tasks').boundingBox())!;
    expect(col.width).toBeLessThanOrEqual(720);
    expect(Math.abs(col.x + col.width / 2 - 410), 'Spalte mittig').toBeLessThanOrEqual(2);
    await page.getByRole('button', { name: 'Neue Aufgabe', exact: true }).click();
    const sheet = newTaskSheet(page);
    await expect(sheet).toBeVisible();
    await expect.poll(async () => Math.round((await sheet.boundingBox())!.width)).toBe(640);
    await noHorizontalScroll(page);
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByTestId('sidebar')).toBeVisible();
    const head = (await page.getByTestId('desktop-header').boundingBox())!;
    expect(head.width).toBeLessThanOrEqual(1560);
    expect(head.x, 'der Inhalt beginnt rechts neben der Seitenleiste').toBeGreaterThanOrEqual(256);
    expect((await page.getByTestId('sidebar').boundingBox())!.x).toBe(0);
    await noHorizontalScroll(page);
  });
});

test.describe('Aufgaben', () => {
  test('Klick auf die Zeile öffnet die Detailspalte neben der Liste (kein Sheet); Escape und Schließen leeren sie; ohne Auswahl steht ein Platzhalter da', async ({ page, request }) => {
    const s = await seed(request);
    await page.goto('/');
    await expect(page.getByTestId('detail')).toHaveCount(0); // ohne Auswahl keine Spalte (die Liste nutzt die ganze Breite)
    const first = row(page, s.cards[0]!.title);
    await first.click();
    const detail = page.getByTestId('detail');
    await expect(detail).toBeVisible();
    expect((await detail.boundingBox())!.width).toBe(380);
    await expect(dialog(page)).toHaveCount(0);
    await expect(detail.getByLabel('Titel')).toHaveValue(s.cards[0]!.title);
    await expect(detail.getByLabel('Eintrag', { exact: true })).toHaveValue('Abholschein suchen');
    await expect(detail.getByRole('button', { name: 'Erledigt' })).toBeVisible();
    // die Liste bleibt sichtbar und bedienbar, die gewählte Zeile ist markiert
    await expect(first).toHaveAttribute('aria-current', 'true');
    await expect(row(page, s.cards[1]!.title)).toBeVisible();
    // eine andere Aufgabe wählen: die Spalte wechselt den Inhalt
    await row(page, s.cards[1]!.title).click();
    await expect(detail.getByLabel('Titel')).toHaveValue(s.cards[1]!.title);
    // Escape schließt
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(page.getByTestId('detail')).toHaveCount(0); // ohne Auswahl keine Spalte (die Liste nutzt die ganze Breite)
    // Schließen-Knopf
    await first.click();
    await page.getByTestId('detail-close').click();
    await expect(detail).toHaveCount(0);
  });

  test('Änderungen in der Detailspalte speichern sofort, Kommentar schreiben, „Erledigt“ nimmt die Aufgabe aus der Liste', async ({ page, request }) => {
    const s = await seed(request);
    await page.goto('/');
    await row(page, s.cards[1]!.title).click();
    const detail = page.getByTestId('detail');
    const title = s.cards[1]!.title + ' neu';
    await detail.getByLabel('Titel').fill(title);
    await detail.getByLabel('Titel').blur();
    await expect(detail.getByText('Gespeichert')).toBeVisible();
    await detail.getByLabel('Neuer Kommentar').fill('Bitte vor 17 Uhr');
    await detail.getByRole('button', { name: 'Senden' }).click();
    await expect(detail.getByText('Bitte vor 17 Uhr')).toBeVisible();
    await expect(row(page, title)).toBeVisible(); // die Liste folgt der Änderung

    await page.getByTestId('detail-done').click();
    await expect(detail).toHaveCount(0);
    await expect(row(page, title)).toHaveCount(0);
  });

  test('Pfeil auf und ab springt in der Liste von Zeile zu Zeile', async ({ page, request }) => {
    const s = await seed(request);
    await page.goto('/');
    const a = row(page, s.cards[0]!.title);
    await a.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(':focus')).not.toHaveText(s.cards[0]!.title);
    await page.keyboard.press('ArrowUp');
    await expect(a).toBeFocused();
  });

  test('Suche: „/“ fokussiert das Feld, Tippen filtert die Liste, Escape leert, „N“ legt eine Aufgabe an (nicht in Feldern)', async ({ page, request }) => {
    const s = await seed(request);
    await page.goto('/');
    await expect(row(page, s.cards[0]!.title)).toBeVisible();
    await page.keyboard.press('/');
    const search = page.getByRole('searchbox', { name: 'Suchen' });
    await expect(search).toBeFocused();
    await page.keyboard.type(s.cards[1]!.title.toLowerCase());
    await expect(row(page, s.cards[1]!.title)).toBeVisible();
    await expect(row(page, s.cards[0]!.title)).toHaveCount(0);
    await expect(newTaskSheet(page)).toHaveCount(0); // das „n“ im Feld legt nichts an
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('');
    await expect(row(page, s.cards[0]!.title)).toBeVisible();
    await page.keyboard.press('Escape'); // Feld verlassen
    await expect(search).not.toBeFocused();
    await page.keyboard.press('n');
    await expect(newTaskSheet(page)).toBeVisible();
  });

  test('Neue Aufgabe: Knopf oben öffnet den Dialog (600 px, mittig), Anlegen zeigt die Aufgabe in der Liste, Escape schließt, der Fokus kehrt zum Knopf zurück', async ({ page }) => {
    await page.goto('/');
    const button = page.getByTestId('new-task');
    await button.focus(); // WebKit fokussiert Knöpfe beim Klick nicht überall: mit der Tastatur öffnen
    await page.keyboard.press('Enter');
    const sheet = newTaskSheet(page);
    await expect(sheet).toBeVisible();
    await expect.poll(async () => Math.round((await sheet.boundingBox())!.width)).toBe(600);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(button).toBeFocused();

    await button.click();
    const title = unique('Fenster putzen');
    await sheet.getByLabel('Was steht an?').fill(title);
    await sheet.getByRole('button', { name: 'Aufgabe anlegen' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Aufgabe angelegt' })).toBeVisible();
    await expect(sheet).toHaveCount(0);
  });
});

test.describe('Boards', () => {
  test('Kanban über die volle Breite: gleich breite Spalten mit Name, Zähler und „+“; „+“ legt in dieser Spalte an', async ({ page, request }) => {
    const s = await seed(request);
    await page.goto('/');
    await page.getByTestId('sidebar').getByRole('navigation', { name: 'Boards' }).getByRole('button', { name: new RegExp(`^${s.boardName}`) }).click();
    const kanban = page.getByTestId('kanban');
    const sections = kanban.getByRole('region');
    await expect(sections).toHaveCount(s.columns.length);
    const widths = await sections.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect(Math.max(...widths) - Math.min(...widths), 'gleich breit').toBeLessThanOrEqual(1);
    const k = (await kanban.boundingBox())!;
    const last = (await sections.last().boundingBox())!;
    expect(Math.round(last.x + last.width), 'bis zum rechten Rand').toBeGreaterThanOrEqual(Math.round(k.x + k.width) - 2);
    await expect(sections.first().getByRole('heading', { name: s.columns[0]!.name })).toBeVisible();
    await expect(sections.first().getByTestId('column-count')).toHaveText('3');
    // keine Tab-Leiste der Spalten und keine Board-Leiste des Handys
    await expect(page.getByRole('tablist', { name: 'Spalten' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Board wechseln' })).toHaveCount(0);

    // „+“ der zweiten Spalte (die erste Spalte ist „Offen“, die zweite „Geplant“ hat keins, die dritte „In Arbeit“)
    const target = s.columns.find((c) => c.name === 'In Arbeit')!;
    await kanban.getByRole('button', { name: `Neue Aufgabe in „${target.name}“` }).click();
    const title = unique('Keller');
    await newTaskSheet(page).getByLabel('Was steht an?').fill(title);
    await newTaskSheet(page).getByRole('button', { name: 'Aufgabe anlegen' }).click();
    await expect(page.getByTestId(`column-list-${target.id}`).getByText(title)).toBeVisible();
    await expect(sections.filter({ has: page.getByRole('heading', { name: target.name }) }).getByTestId('column-count')).toHaveText('1');
  });

  test('Aufgaben brechen die Meta-Zeile um, statt Kategorien abzuschneiden; Klick öffnet die Aufgabe als Dialog', async ({ page, request }) => {
    const long = 'Sehr lange Kategorie für schmale Spalten';
    const s = await seed(request, { category: long });
    await page.goto('/');
    await page.getByTestId('sidebar').getByRole('navigation', { name: 'Boards' }).getByRole('button', { name: new RegExp(`^${s.boardName}`) }).click();
    const card = page.getByTestId('kanban').locator('[data-variant=task]').filter({ hasText: s.cards[0]!.title });
    await expect(card).toBeVisible();
    // alles, was die Aufgabe zeigt, liegt innerhalb der Aufgabe (nichts ragt heraus oder wird abgeschnitten)
    const cut = await card.evaluate((el) => {
      const box = el.getBoundingClientRect();
      // Blätter mit Text (ohne den Text nur für Screenreader): liegen sie in der Aufgabe, und ist ihr Text ganz zu sehen?
      return [...el.querySelectorAll<HTMLElement>('*')].filter((n) => {
        if (n.classList.contains('sr-only') || n.children.length > 0 || !n.textContent?.trim()) return false;
        const r = n.getBoundingClientRect();
        return r.right > box.right + 0.5 || r.left < box.left - 0.5 || n.scrollWidth > n.clientWidth + 1;
      }).map((n) => `${n.tagName}.${n.className}`);
    });
    expect(cut, `nichts abgeschnitten: ${JSON.stringify(cut)}`).toEqual([]);
    await expect(card.getByTestId('card-category')).toContainText(long);
    await card.getByRole('button', { name: s.cards[0]!.title, exact: true }).click();
    await expect(dialog(page)).toBeVisible(); // in Boards öffnet die Aufgabe als Dialog
    await expect.poll(async () => Math.round((await dialog(page).boundingBox())!.width)).toBe(600);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
  });

  test('Drag & Drop mit der Maus: eine Aufgabe in eine andere Spalte ziehen', async ({ page, request }) => {
    const s = await seed(request);
    await page.goto('/');
    await page.getByTestId('sidebar').getByRole('navigation', { name: 'Boards' }).getByRole('button', { name: new RegExp(`^${s.boardName}`) }).click();
    const target = s.columns.find((c) => c.name === 'In Arbeit')!;
    const title = s.cards[1]!.title;
    const card = page.getByTestId('kanban').locator('[data-variant=task]').filter({ hasText: title });
    const from = (await card.boundingBox())!;
    const to = (await page.getByTestId(`column-list-${target.id}`).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + 20);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + 30, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 20 });
    await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 4 });
    // die Bibliothek sucht die Spalte unter der Aufgabe im Takt (nicht bei jeder Mausbewegung): kurz stehen bleiben, dann loslassen
    await expect(page.getByTestId(`column-list-${target.id}`).locator('[data-is-dnd-shadow-item-internal]')).toHaveCount(1, { timeout: 5000 });
    await page.mouse.up();
    await expect(page.getByTestId(`column-list-${target.id}`).getByText(title)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId(`column-list-${s.columns[0]!.id}`).getByText(title)).toHaveCount(0);
  });
});

test.describe('Befehlspalette', () => {
  test('Strg+K öffnet sie, tippen filtert, Pfeil und Enter führen aus, Escape schließt', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Befehlspalette' });
    await expect(palette).toBeVisible();
    await expect(palette.getByRole('combobox').or(palette.getByRole('textbox'))).toBeFocused();
    await page.keyboard.type('kalender');
    await expect(palette.getByRole('option').filter({ hasText: 'G C' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(palette).toHaveCount(0);
    await expect(page.getByTestId('calendar-page')).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
  });
});
