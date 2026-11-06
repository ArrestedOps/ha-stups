import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Läuft nur im Projekt „waechter" (nachgebautes Home Assistant). Wächter aus Vorlagen nennen das Gerät, der Assistent hat in jedem Schritt ein
// „Zurück", und Batterie-Wächter stehen unter „Ruhig" statt unter „Läuft gerade".
const MOCK = 'http://127.0.0.1:18411';
test.describe.configure({ timeout: 90_000, mode: 'serial' });

interface WatcherRow {
  id: string;
  name: string;
  card: { title: string };
  trigger: { entityId: string };
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const watchers = async (request: APIRequestContext) => ((await (await request.get('/api/watchers')).json()) as { items: WatcherRow[] }).items;
const IPHONE = 'sensor.iphone_rene_battery_level';
const BAD = 'sensor.bad_batterie';

async function board(request: APIRequestContext) {
  const tag = Date.now().toString(36);
  const b = (await (await request.post('/api/boards', { data: { name: `Namen ${tag}` } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${b.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  return { boardId: b.id, columnId: view.columns.find((c) => !c.isDone && !c.isPlanned)!.id, tag };
}

async function clearWatchers(request: APIRequestContext) {
  for (const w of await watchers(request)) await request.delete(`/api/watchers/${w.id}`);
}

/**
 * Ein Batterie-Wächter über die API, so benannt wie bisher (nur der Name der Vorlage). Die Grenze liegt unter allen Ständen im Mock:
 * Ein Pegel unter der Grenze löst beim Anlegen selbst aus (dann stünde der Wächter nicht mehr unter „Ruhig“).
 */
const plainBattery = (b: { boardId: string; columnId: string }, entityId: string, name = 'Batterie schwach', title = 'Batterie wechseln') => ({
  name,
  trigger: { entityId, kind: 'below', value: 5, forMin: 10 },
  card: { boardId: b.boardId, columnId: b.columnId, title, due: { kind: 'none' } },
  assign: { mode: 'none' },
});

async function openFound(page: Page, boardId: string) {
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), boardId);
  await page.goto('/');
  await openBoards(page);
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await page.getByRole('button', { name: 'Alle Wächter verwalten' }).click();
  await page.getByRole('button', { name: 'Wächter aus Vorlagen' }).click();
}

async function setupHit(page: Page, hitText: string | RegExp, boardId: string) {
  const d = page.getByRole('dialog');
  await d.getByTestId('found-hit').filter({ hasText: hitText }).getByRole('button', { name: 'Einrichten' }).click();
  await expect(d.getByTestId('graph-card')).toBeVisible();
  await d.getByLabel('Schwellwert').fill('5'); // unter dem Stand der Batterien: sonst löst der Wächter beim Anlegen gleich aus und steht nicht unter „Ruhig“
  await d.getByRole('button', { name: 'Weiter: Dann' }).click();
  await d.getByTestId('then-editor').getByLabel('Board', { exact: true }).selectOption(boardId);
  await d.getByRole('button', { name: 'Weiter: Wer' }).click();
  await d.getByRole('button', { name: 'Weiter: Feinschliff' }).click();
}

test('Vorlage „Batterie schwach" für zwei Sensoren: zwei unterscheidbare Namen und Kartentitel, auch in der Übersicht', async ({ page, request }) => {
  await clearWatchers(request);
  // Werte neu setzen: unter 20 % legt ein neuer Batterie-Wächter nach 10 Minuten seit der letzten Änderung sofort eine Karte an (dann stünde er unter „Wartet")
  await request.post(`${MOCK}/mock/state`, { data: { entityId: IPHONE, state: '14' } });
  await request.post(`${MOCK}/mock/state`, { data: { entityId: BAD, state: '12' } });
  const b = await board(request);
  await openFound(page, b.boardId);
  const d = page.getByRole('dialog');

  await setupHit(page, 'iPhone Rene Battery Level', b.boardId);
  await expect(d.getByTestId('wizard-question')).toBeVisible();
  await d.getByRole('button', { name: 'Wächter anlegen' }).click();
  await expect(page.getByText('Wächter gespeichert')).toBeVisible();

  // der zweite Sensor aus der Vorlage (nach dem Speichern steht die Seite Wächter wieder da)
  await page.getByRole('button', { name: 'Alle Wächter verwalten' }).click();
  await page.getByRole('button', { name: 'Wächter aus Vorlagen' }).click();
  await setupHit(page, 'Bad Fenster Batterie', b.boardId);
  await d.getByRole('button', { name: 'Wächter anlegen' }).click();
  await expect(page.getByText('Wächter gespeichert').first()).toBeVisible();

  const items = (await watchers(request)).filter((w) => [IPHONE, BAD].includes(w.trigger.entityId));
  // der Wächter heißt wie die Vorlage (das Gerät steht darunter), der Kartentitel der Vorlage bleibt sauber (die Karte bekommt den Namen der Entität erst, wenn sie entsteht)
  expect(items.map((w) => [w.name, w.card.title]).sort()).toEqual([
    ['Batterie schwach', 'Batterie wechseln'],
    ['Batterie schwach', 'Batterie wechseln'],
  ]);

  // Übersicht: beide stehen in der Kategorie „Batterien", nach Namen sortiert, mit dem aktuellen Wert
  await page.keyboard.press('Escape');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  const quiet = page.getByTestId('watcher-category').filter({ hasText: 'Batterien' });
  const rows = quiet.getByRole('button', { name: 'Wächter Batterie schwach öffnen' });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Bad Fenster Batterie');
  await expect(rows.nth(1)).toContainText('iPhone Rene Battery Level');
  await expect(quiet.getByTestId('watcher-value').first()).toHaveText('12 %');
  // der aktuelle Wert steht oben rechts (rechtsbündig, auf Höhe des Titels), der Gerätename klein darunter
  const row = rows.first().locator('xpath=ancestor::li[1]');
  const rowBox = (await row.boundingBox())!;
  const valueBox = (await row.getByTestId('watcher-value').boundingBox())!;
  const nameBox = (await row.getByTestId('watcher-subject').boundingBox())!;
  expect(valueBox.y).toBeLessThan(rowBox.y + rowBox.height / 2);
  expect(valueBox.y + valueBox.height).toBeLessThanOrEqual(nameBox.y + 4);
  expect(valueBox.x).toBeGreaterThan(rowBox.x + rowBox.width / 2);
  await clearWatchers(request);
});

test('Zurück im Assistenten: in jedem Schritt da, Eingaben bleiben, am Anfang zurück zu „Gefunden", Schließen schließt', async ({ page, request }) => {
  await clearWatchers(request);
  const b = await board(request);
  await openFound(page, b.boardId);
  const d = page.getByRole('dialog');
  const back = d.getByRole('button', { name: 'Zurück', exact: true });

  await d.getByTestId('found-hit').filter({ hasText: 'Bad Fenster Batterie' }).getByRole('button', { name: 'Einrichten' }).click();
  await expect(d.getByTestId('graph-card')).toBeVisible();
  await expect(back).toBeVisible(); // Schritt 1
  await d.getByRole('button', { name: 'Weiter: Dann' }).click();
  await expect(d.getByTestId('wizard-question')).toContainText('Welche Aufgabe');
  await expect(back).toBeVisible(); // Schritt 2
  await d.getByLabel('Titel der Karte').fill('Mein eigener Titel');
  await d.getByTestId('then-editor').getByLabel('Board', { exact: true }).selectOption(b.boardId);
  await d.getByRole('button', { name: 'Weiter: Wer' }).click();
  await expect(back).toBeVisible(); // Schritt 3
  await d.getByRole('button', { name: 'Weiter: Feinschliff' }).click();
  await expect(d.getByTestId('wizard-question')).toContainText('Fast fertig');
  await expect(back).toBeVisible(); // Schritt 4 (hier fehlte es)

  // zurück bis Schritt 1: die Eingaben bleiben
  await back.click();
  await expect(d.getByTestId('wizard-question')).toContainText('Wer soll');
  await back.click();
  await expect(d.getByTestId('wizard-question')).toContainText('Welche Aufgabe');
  await expect(d.getByLabel('Titel der Karte')).toHaveValue('Mein eigener Titel');
  await back.click();
  await expect(d.getByTestId('graph-card')).toContainText('Bad Fenster Batterie');
  // vor wieder: der Titel ist noch da
  await d.getByRole('button', { name: 'Weiter: Dann' }).click();
  await expect(d.getByLabel('Titel der Karte')).toHaveValue('Mein eigener Titel');
  await back.click();

  // am ersten Schritt: zurück zur Auswahl „Gefunden"
  await back.click();
  await expect(d.getByTestId('found-hit').first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Gefunden' })).toBeVisible();

  // Vorlage ohne Treffer: die Suche öffnet sich, Zurück schließt zuerst die Suche, dann geht es zurück zur Auswahl
  await d.getByRole('button', { name: 'Alle Vorlagen ansehen' }).click();
  await d.getByRole('button', { name: /Batterie schwach/ }).click();
  await expect(d.getByTestId('entity-picker')).toBeVisible();
  await back.click();
  await expect(d.getByTestId('entity-picker')).toHaveCount(0);
  await expect(d.getByTestId('wizard-question')).toContainText('Woran merkt Stups');
  await back.click();
  await expect(page.getByRole('dialog', { name: 'Gefunden' })).toBeVisible();

  // Escape und „Schließen" schließen den Assistenten ganz
  await d.getByTestId('found-hit').filter({ hasText: 'Bad Fenster Batterie' }).getByRole('button', { name: 'Einrichten' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Entität von Hand gewählt (Vorlage ohne Treffer): der Name bleibt der der Vorlage, der Titel nennt das Gerät', async ({ page, request }) => {
  await clearWatchers(request);
  const b = await board(request);
  await openFound(page, b.boardId);
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Alle Vorlagen ansehen' }).click();
  await d.getByRole('button', { name: /Batterie schwach/ }).click();
  await d.getByLabel('Entität suchen').fill('iphone rene');
  await d.getByTestId('entity-picker').getByRole('button', { name: /iPhone Rene Battery Level/ }).click();
  await d.getByRole('button', { name: 'Weiter: Dann' }).click();
  await expect(d.getByLabel('Titel der Karte')).toHaveValue('Batterie wechseln');
  await d.getByTestId('then-editor').getByLabel('Board', { exact: true }).selectOption(b.boardId);
  await d.getByRole('button', { name: 'Weiter: Wer' }).click();
  await d.getByRole('button', { name: 'Weiter: Feinschliff' }).click();
  await expect(d.getByLabel('Name des Wächters')).toHaveValue('Batterie schwach');
  await d.getByRole('button', { name: 'Wächter anlegen' }).click();
  await expect(page.getByText('Wächter gespeichert')).toBeVisible();
  await clearWatchers(request);
});

test('Bestehende Wächter: Gerät immer unter dem Namen (nach Gerät sortiert), kein Vorschlag im Editor, kein Sammelknopf', async ({ page, request }) => {
  await clearWatchers(request);
  const b = await board(request);
  const FLUR = 'sensor.flur_schliesszylinder_wohnungseingangstuer_batterie_ladestand_zusatzmodul';
  // drei gleich benannte Wächter (wie beim Kunden) und einer mit eigenem Namen
  for (const id of [IPHONE, FLUR, BAD]) expect((await request.post('/api/watchers', { data: plainBattery(b, id) })).status()).toBe(201);
  expect((await request.post('/api/watchers', { data: plainBattery(b, 'sensor.trockner_leistung', 'Mamas Wäsche', 'Wäsche holen') })).status()).toBe(201);

  await page.addInitScript((id) => localStorage.setItem('stups.board', id), b.boardId);
  await page.goto('/');
  await openBoards(page);
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  const quiet = page.getByTestId('watcher-categories');
  // Zeile unter dem Namen: Friendly Name der Entität, alphabetisch (Bad, iPhone, sensor.flur …), eine Zeile
  const subjects = quiet.getByTestId('watcher-subject');
  await expect(subjects).toHaveCount(4);
  await expect(subjects.nth(0)).toHaveText('Bad Fenster Batterie');
  await expect(subjects.nth(1)).toHaveText('iPhone Rene Battery Level');
  await expect(subjects.nth(2)).toHaveText(FLUR);
  await expect(subjects.nth(3)).toHaveText('Steckdose Trockner Leistung');
  // der lange Name macht die Seite nicht breiter und bleibt in einer Zeile
  const box = await subjects.nth(2).boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.height).toBeLessThan(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Editor und Übersicht: kein Vorschlag „Namen mit Gerät ergänzen", nichts wird umbenannt
  await page.getByRole('button', { name: 'Wächter Batterie schwach öffnen' }).first().click();
  const d = page.getByRole('dialog');
  await expect(d.getByTestId('name-suggest')).toHaveCount(0);
  await expect(d.getByText('Namen mit Gerät ergänzen')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('home-rename')).toHaveCount(0);
  await expect(page.getByText('Namen mit Gerät ergänzen')).toHaveCount(0);
  expect((await watchers(request)).map((w) => w.name).sort()).toEqual(['Batterie schwach', 'Batterie schwach', 'Batterie schwach', 'Mamas Wäsche']);
  await clearWatchers(request);
});

test('Batterie über der Schwelle steht unter „Ruhig" mit dem Wert, nie unter „Läuft gerade"', async ({ page, request }) => {
  await clearWatchers(request);
  const b = await board(request);
  const FLUR = 'sensor.flur_schliesszylinder_wohnungseingangstuer_batterie_ladestand_zusatzmodul'; // 85 %
  const data = { ...plainBattery(b, FLUR, 'Batterie schwach: Flur'), trigger: { entityId: FLUR, kind: 'below', value: 10, forMin: 10 } };
  expect((await request.post('/api/watchers', { data })).status()).toBe(201);
  await request.post(`${MOCK}/mock/state`, { data: { entityId: FLUR, state: '26' } });

  await page.addInitScript((id) => localStorage.setItem('stups.board', id), b.boardId);
  await page.goto('/');
  await openBoards(page);
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await expect(page.getByTestId('watcher-categories')).toBeVisible();
  await expect(page.getByTestId('home-running')).toHaveCount(0);
  await expect(page.getByTestId('watcher-categories').getByTestId('watcher-value')).toHaveText('26 %');
  await request.post(`${MOCK}/mock/state`, { data: { entityId: FLUR, state: '85' } });
  await clearWatchers(request);
});
