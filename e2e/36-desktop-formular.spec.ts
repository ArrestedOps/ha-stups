import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Läuft nur im Projekt „desktop-ha“ (1440 × 900, nachgebautes Home Assistant). „Neuer Wächter“ ist am Desktop kein Fenster mit vier Schritten,
// sondern ein Formular, das über der Liste aufklappt. Das Handy bleibt beim Assistenten (die Specs 26, 27, 30, 36 und 41 laufen dort).
const MOCK = 'http://127.0.0.1:18411';
test.describe.configure({ timeout: 90_000 });

interface W {
  id: string;
  name: string;
  category: string | null;
  trigger: { entityId: string; kind: string; value: number | null; to: string | null; forMin: number };
  card: { title: string; boardId: string };
  assign: { mode: string; personIds: string[] };
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const watchers = async (request: APIRequestContext) => ((await (await request.get('/api/watchers')).json()) as { items: W[] }).items;
const clear = async (request: APIRequestContext) => {
  for (const w of await watchers(request)) await request.delete(`/api/watchers/${w.id}`);
};
const setState = (request: APIRequestContext, entityId: string, state: string, attributes: Record<string, unknown> = {}) =>
  request.post(`${MOCK}/mock/state`, { data: { entityId, state, attributes } });
const cardsOf = async (request: APIRequestContext, boardId: string) => ((await (await request.get(`/api/boards/${boardId}`)).json()) as { cards: { title: string }[] }).cards;
test.afterEach(async ({ request }) => {
  await clear(request);
  // der nachgebaute Home Assistant gehört dem ganzen Lauf: der Wert der Batterie steht danach wieder wie vorher (andere Specs rechnen mit 12 %)
  await setState(request, 'sensor.bad_batterie', '12');
});

async function setup(request: APIRequestContext) {
  await clear(request);
  const tag = Date.now().toString(36);
  const board = (await (await request.post('/api/boards', { data: { name: `Formular ${tag}` } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string }[];
  return { tag, boardId: board.id, columnId: view.columns.find((c) => !c.isDone && !c.isPlanned)!.id, rene: people.find((p) => p.name === 'Rene')! };
}
type S = Awaited<ReturnType<typeof setup>>;

/** Reiter Wächter öffnen (das Board der Karte ist vorgewählt) */
async function openList(page: Page, s: S) {
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), s.boardId);
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await expect(page.getByTestId('watchers-bar')).toBeVisible();
}
async function openDesk(page: Page) {
  await page.getByTestId('new-watcher').click();
  await expect(page.getByTestId('desk-then')).toBeVisible();
}
const desk = (page: Page) => page.getByTestId('watcher-desk');

/** Entität im Suchfeld wählen */
async function pickEntity(page: Page, search: string, name: RegExp) {
  const box = page.getByRole('combobox', { name: 'Entität suchen' });
  await box.fill(search);
  await page.getByTestId('desk-entity-list').getByRole('option', { name }).first().click();
  await expect(page.getByTestId('desk-entity-id')).toBeVisible();
}

/** Bedingung „fällt unter“ mit Wert und Wartezeit, Titel, Board; Wer bleibt, wie es vorbelegt ist */
async function fillBelow(page: Page, s: S, o: { threshold: string; wait: string; title: string }) {
  await desk(page).getByLabel('Schwellwert').fill(o.threshold);
  await desk(page).getByLabel('Wartezeit in Minuten').fill(o.wait);
  await desk(page).getByLabel('Titel der Karte').fill(o.title);
  await page.getByTestId('desk-then').getByLabel('Board', { exact: true }).selectOption(s.boardId);
}

test('Der Knopf klappt das Formular über der Liste auf und zu, die Liste rutscht nach unten; Fokus im Feld, X und Escape klappen zu', async ({ page, request }) => {
  const s = await setup(request);
  await request.post('/api/watchers', {
    data: { name: `Zeile ${s.tag}`, trigger: { entityId: 'sensor.bad_batterie', kind: 'below', value: 5, forMin: 10 }, card: { boardId: s.boardId, columnId: s.columnId, title: `Karte ${s.tag}`, due: { kind: 'none' } }, assign: { mode: 'fixed', personIds: [s.rene.id] }, category: 'Batterien' },
  });
  await openList(page, s);
  await expect(page.getByTestId('watchers-summary')).toContainText('1 Wächter');
  // „Gefunden“ mit Zähler und „Neuer Wächter“ stehen in der Leiste, rechts, Gefunden links vom Knopf
  const found = page.getByTestId('home-found');
  const bar = page.getByTestId('new-watcher');
  await expect(found).toContainText('Gefunden');
  const fb = (await found.boundingBox())!;
  const nb = (await bar.boundingBox())!;
  expect(fb.x + fb.width).toBeLessThanOrEqual(nb.x);
  expect(Math.abs(fb.y - nb.y)).toBeLessThanOrEqual(2);
  const listTop = async () => (await page.getByTestId('watcher-list').boundingBox())!.y;
  const before = await listTop();

  await expect(bar).toHaveAttribute('aria-expanded', 'false');
  await bar.click();
  await expect(bar).toHaveAttribute('aria-expanded', 'true');
  await expect(desk(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await listTop()) - before).toBeGreaterThan(300); // die Liste rutscht nach unten
  // der Fokus springt in das Feld für die Entität
  await expect(page.getByRole('combobox', { name: 'Entität suchen' })).toBeFocused();

  // derselbe Knopf klappt zu (ohne Eingaben ohne Rückfrage)
  await bar.click();
  await expect(desk(page)).toHaveCount(0);
  await expect.poll(async () => Math.abs((await listTop()) - before)).toBeLessThanOrEqual(1);

  // X
  await bar.click();
  await expect(desk(page)).toBeVisible();
  await page.getByTestId('desk-close').click();
  await expect(desk(page)).toHaveCount(0);
  // Escape
  await bar.click();
  await expect(page.getByRole('combobox', { name: 'Entität suchen' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(desk(page)).toHaveCount(0);
  // Abbrechen
  await bar.click();
  await page.getByTestId('desk-cancel').click();
  await expect(desk(page)).toHaveCount(0);
});

test('Tab-Reihenfolge: Wenn, Dann, Wer, Mehr Einstellungen, unten', async ({ page, request }) => {
  const s = await setup(request);
  await openList(page, s);
  await openDesk(page);
  await expect(page.getByRole('combobox', { name: 'Entität suchen' })).toBeFocused();
  const seen: string[] = [];
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press('Tab');
    const part = await page.evaluate(() => document.activeElement?.closest('[data-testid=desk-when],[data-testid=desk-then],[data-testid=desk-who],[data-testid=desk-more-settings],[data-testid=desk-footer]')?.getAttribute('data-testid') ?? null);
    if (part && seen.at(-1) !== part) seen.push(part);
    if (part === 'desk-footer') break; // danach geht es im Kreis wieder von vorn los
  }
  expect(seen).toEqual(['desk-when', 'desk-then', 'desk-who', 'desk-more-settings', 'desk-footer']);
});

test('Wächter komplett im Formular anlegen: Entität, Bedingung, Titel, neue Kategorie, Wer; erscheint in seiner Kategorie, Gruppe offen, hervorgehoben', async ({ page, request }) => {
  const s = await setup(request);
  await setState(request, 'sensor.bad_batterie', '64');
  await openList(page, s);
  await openDesk(page);

  await pickEntity(page, 'bad fenster', /Bad Fenster Batterie/);
  await expect(page.getByRole('combobox', { name: 'Entität suchen' })).toHaveValue('Bad Fenster Batterie');
  await expect(page.getByTestId('desk-entity-id')).toHaveText('sensor.bad_batterie');
  // die Entität schlägt Kategorie „Batterien“ vor, gekennzeichnet; Name und Titel nennen das Gerät nicht von Hand: der Name folgt der Entität
  await expect(page.getByTestId('category-field').locator('select')).toHaveValue('Batterien');
  await expect(page.getByTestId('category-suggested')).toBeVisible();

  await fillBelow(page, s, { threshold: '5', wait: '0', title: `Batterie wechseln ${s.tag}` });
  // Vorschau: der Satz und der Verlauf
  await expect(page.getByTestId('watcher-sentence')).toContainText(`Wenn Bad Fenster Batterie unter 5 % liegt`);
  await expect(page.getByTestId('watcher-sentence')).toContainText(`Batterie wechseln ${s.tag}`);
  await expect(page.getByTestId('desk-preview').getByTestId('entity-graph')).toBeVisible();
  await expect(page.getByTestId('card-preview')).toContainText(`Batterie wechseln ${s.tag}`);

  // eigene Kategorie: „Neue Kategorie …“, nach der Wahl ist sie nicht mehr „vorgeschlagen“
  await page.getByTestId('category-field').locator('select').selectOption({ label: 'Neue Kategorie …' });
  await page.getByTestId('category-new').fill('Haus & Garten');
  await expect(page.getByTestId('category-suggested')).toHaveCount(0);
  await expect(page.getByTestId('card-preview')).toContainText('Haus & Garten');

  // Wer: eine feste Person (Rene)
  await page.getByRole('radiogroup', { name: 'Zuweisung' }).getByRole('radio', { name: 'Eine feste Person' }).click();
  await expect(page.getByRole('group', { name: 'Personen' }).getByRole('button', { name: 'Rene' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('desk-submit').click();
  await expect(page.getByText('Wächter gespeichert')).toBeVisible();
  await expect(desk(page)).toHaveCount(0);
  await expect(page.getByTestId('new-watcher')).toHaveAttribute('aria-expanded', 'false');

  // auf dem Server: Kategorie, Bedingung, Wer, Name mit Gerät
  const w = (await watchers(request)).find((x) => x.card.title === `Batterie wechseln ${s.tag}`)!;
  expect(w).toMatchObject({ category: 'Haus & Garten', trigger: { entityId: 'sensor.bad_batterie', kind: 'below', value: 5 }, assign: { mode: 'fixed', personIds: [s.rene.id] } });
  expect(w.name).toBe('Bad Fenster Batterie');

  // in der Liste: in seiner Kategorie, die Gruppe ist offen, die Zeile kurz hervorgehoben
  const group = page.getByTestId('watcher-category').filter({ hasText: 'Haus & Garten' });
  await expect(group).toBeVisible();
  const row = group.getByTestId('watcher-row');
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute('data-fresh', '');
  await expect(row).toBeInViewport();
  await expect(row).not.toHaveAttribute('data-fresh', '', { timeout: 8000 });
});

test('Vorschläge: drei Chips und „+N“; ein Chip füllt vor (Kategorie vorgeschlagen), „+N“ öffnet die Liste nach Vorlage und „Einrichten“ füllt dort ebenso vor', async ({ page, request }) => {
  const s = await setup(request);
  await setState(request, 'sensor.bad_batterie', '64');
  await openList(page, s);
  await openDesk(page);
  const chips = page.getByTestId('desk-chips');
  await expect(chips.locator('[aria-pressed]')).toHaveCount(3);
  const more = page.getByTestId('desk-more');
  await expect(more).toHaveText(/^\+\d+$/);
  await expect(more).toHaveAttribute('aria-expanded', 'false');

  // ein Chip: Entität, Bedingung und Name der Vorlage stehen da
  await chips.getByRole('button').first().click();
  await expect(chips.getByRole('button', { pressed: true })).toHaveCount(1);
  await expect(page.getByTestId('desk-entity-id')).toBeVisible();
  await expect(page.getByTestId('category-suggested')).toBeVisible();
  await expect(desk(page).getByLabel('Titel der Karte')).not.toHaveValue('');

  // „+N“: die ganze Liste, nach Vorlage gruppiert; Einrichten auf „Bad Fenster“ füllt die Batterie-Vorlage vor
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  const found = page.getByTestId('desk-found');
  await expect(found.getByTestId('found-group').first()).toBeVisible();
  await found.getByTestId('found-search').fill('Bad Fenster');
  await found.getByTestId('found-hit').filter({ hasText: 'Bad Fenster Batterie' }).getByRole('button', { name: 'Einrichten' }).click();
  await expect(found).toHaveCount(0);
  await expect(page.getByTestId('desk-entity-id')).toHaveText('sensor.bad_batterie');
  await expect(page.getByTestId('category-field').locator('select')).toHaveValue('Batterien');
  await expect(page.getByTestId('category-suggested')).toBeVisible();
  await expect(desk(page).getByTestId('desk-name')).toHaveValue('Batterie schwach');
  await expect(desk(page).getByLabel('Titel der Karte')).toHaveValue('Batterie wechseln');
  await expect(page.getByTestId('category-suggested')).toBeVisible();
});

test('Von Hand geänderter Name und Titel bleiben, auch wenn danach eine andere Entität gewählt wird', async ({ page, request }) => {
  const s = await setup(request);
  await openList(page, s);
  await openDesk(page);
  await pickEntity(page, 'bad fenster', /Bad Fenster Batterie/);
  await desk(page).getByLabel('Titel der Karte').fill('Mein eigener Titel');
  await desk(page).getByTestId('desk-name').fill('Mein Name');
  await pickEntity(page, 'trockner', /Steckdose Trockner/);
  await expect(desk(page).getByLabel('Titel der Karte')).toHaveValue('Mein eigener Titel');
  await expect(desk(page).getByTestId('desk-name')).toHaveValue('Mein Name');
});

test('Zustand schon erreicht: dieselbe Rückfrage wie im Assistenten; „Nein“ legt keine Karte an, „Ja“ genau eine', async ({ page, request }) => {
  const s = await setup(request);
  const door = `binary_sensor.formular_${s.tag}`;
  await setState(request, door, 'off', { friendly_name: `Formular Tür ${s.tag}` });
  const title = `Tür schließen ${s.tag}`;
  await openList(page, s);

  async function create() {
    await openDesk(page);
    await pickEntity(page, `formular tür ${s.tag}`, /Formular Tür/);
    await page.getByRole('radiogroup', { name: 'Bedingung' }).getByRole('radio', { name: 'ist' }).click();
    await desk(page).getByLabel('Zielzustand').fill('off');
    await desk(page).getByLabel('Titel der Karte').fill(title);
    await page.getByTestId('desk-then').getByLabel('Board', { exact: true }).selectOption(s.boardId);
    await page.getByTestId('desk-submit').click();
    await expect(page.getByText('Wächter gespeichert').first()).toBeVisible();
  }

  await create();
  const ask = page.getByRole('alertdialog');
  await expect(desk(page)).toHaveCount(0);
  await expect(ask).toContainText(`Formular Tür ${s.tag} ist gerade aus – die Bedingung ist also schon erfüllt. Soll jetzt eine Karte „${title}“ erstellt werden?`);
  await ask.getByRole('button', { name: 'Nein, erst beim nächsten Mal' }).click();
  await expect(ask).toHaveCount(0);
  expect(await cardsOf(request, s.boardId)).toHaveLength(0);

  // zweiter Versuch (gleicher Wächter noch da): einen neuen Wächter für „Ja“ anlegen
  await clear(request);
  await page.reload();
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await create();
  await ask.getByRole('button', { name: 'Ja, Karte erstellen' }).click();
  await expect(page.getByText('Karte angelegt', { exact: true })).toBeVisible();
  await expect.poll(async () => (await cardsOf(request, s.boardId)).map((c) => c.title)).toEqual([`${title}: Formular Tür ${s.tag}`]);
});

test('Batterie unter der Grenze: keine Frage, die Karte kommt sofort', async ({ page, request }) => {
  const s = await setup(request);
  // eine vorhandene Batterie (keine neue Entität: „Gefunden“ in anderen Specs zählt die Batterien)
  await setState(request, 'sensor.iphone_rene_battery_level', '14');
  const title = `Batterie wechseln ${s.tag}`;
  await openList(page, s);
  await openDesk(page);
  await pickEntity(page, 'iphone rene', /iPhone Rene Battery Level/);
  await fillBelow(page, s, { threshold: '20', wait: '0', title });
  await page.getByTestId('desk-submit').click();
  await expect(page.getByText('Wächter gespeichert').first()).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect.poll(async () => (await cardsOf(request, s.boardId)).map((c) => c.title)).toEqual([`${title}: iPhone Rene Battery Level`]);
});

test('Eingaben gehen beim Zuklappen verloren, aber vorher fragt die App (X, Knopf, Escape); „Weiter bearbeiten“ behält alles', async ({ page, request }) => {
  const s = await setup(request);
  await openList(page, s);
  await openDesk(page);
  await desk(page).getByLabel('Titel der Karte').fill(`Entwurf ${s.tag}`);
  const ask = page.getByRole('alertdialog');

  await page.getByTestId('desk-close').click();
  await expect(ask).toContainText('Entwurf verwerfen?');
  await ask.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(ask).toHaveCount(0);
  await expect(desk(page).getByLabel('Titel der Karte')).toHaveValue(`Entwurf ${s.tag}`);

  await page.getByTestId('new-watcher').click();
  await expect(ask).toBeVisible();
  await page.keyboard.press('Escape'); // schließt nur die Rückfrage
  await expect(ask).toHaveCount(0);
  await expect(desk(page)).toBeVisible();

  await desk(page).getByLabel('Titel der Karte').focus();
  await page.keyboard.press('Escape');
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Verwerfen' }).click();
  await expect(desk(page)).toHaveCount(0);
  // ein neuer Entwurf ist leer
  await openDesk(page);
  await expect(desk(page).getByLabel('Titel der Karte')).toHaveValue('');
});

test('Gefunden: „Einrichten“ am Desktop öffnet das Formular mit vorbelegten Werten (kein Fenster mit Schritten)', async ({ page, request }) => {
  const s = await setup(request);
  await setState(request, 'sensor.bad_batterie', '64');
  await openList(page, s);
  await page.getByTestId('home-found').click();
  const d = page.getByRole('dialog');
  await d.getByTestId('found-search').fill('Bad Fenster');
  await d.getByTestId('found-hit').filter({ hasText: 'Bad Fenster Batterie' }).getByRole('button', { name: 'Einrichten' }).click();
  await expect(d).toHaveCount(0);
  await expect(desk(page)).toBeVisible();
  await expect(page.getByTestId('new-watcher')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('desk-entity-id')).toHaveText('sensor.bad_batterie');
  await expect(desk(page).getByTestId('desk-name')).toHaveValue('Batterie schwach');
  await expect(page.getByTestId('category-field').locator('select')).toHaveValue('Batterien');
  await expect(page.getByTestId('category-suggested')).toBeVisible();
  await expect(desk(page).getByLabel('Schwellwert')).toHaveValue('20');
  // gleich abschicken: Board wählen, Batterie bei 64 % liegt über 20, kein Alarm
  await page.getByTestId('desk-then').getByLabel('Board', { exact: true }).selectOption(s.boardId);
  await page.getByTestId('desk-submit').click();
  await expect(page.getByText('Wächter gespeichert').first()).toBeVisible();
  await expect.poll(async () => (await watchers(request)).map((w) => [w.name, w.category])).toEqual([['Batterie schwach', 'Batterien']]);
  await expect(page.getByTestId('watcher-category').filter({ hasText: 'Batterien' })).toBeVisible();
});

test('Probelauf im Formular zeigt das Ergebnis; Pflichtfelder melden, was fehlt', async ({ page, request }) => {
  const s = await setup(request);
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  const points: { state: string; at: string }[] = [{ state: '2', at: at(150) }];
  for (const h of [120, 70, 20]) points.push({ state: '120', at: at(h + 1.5) }, { state: '2', at: at(h) });
  await request.post(`${MOCK}/mock/history`, { data: { entityId: 'sensor.trockner_leistung', points } });
  await openList(page, s);
  await openDesk(page);
  // leer: Speichern sagt, was fehlt
  await page.getByTestId('desk-submit').click();
  await expect(page.getByText('Wähle die Entität, die beobachtet werden soll.').first()).toBeVisible();
  await expect(desk(page)).toBeVisible();

  await pickEntity(page, 'trockner', /Steckdose Trockner/);
  await desk(page).getByLabel('Schwellwert').fill('5');
  await page.getByTestId('desk-probe').click();
  await expect(page.getByTestId('dry-run-result')).toContainText('3 Auslösungen erkannt, kein Fehlalarm', { timeout: 20_000 });
});

test('Layout: ab etwa 1340 px zwei Spalten (Vorschau rechts), bei 1024 px eine Spalte (Vorschau darunter); lange Namen brechen, nichts läuft über', async ({ page, request }) => {
  const s = await setup(request);
  await openList(page, s);
  await openDesk(page);
  await pickEntity(page, 'flur_schliesszylinder', /sensor\.flur_schliesszylinder/);
  await desk(page).getByLabel('Titel der Karte').fill(`Ein sehr langer Titel ${'x'.repeat(60)} ${s.tag}`);
  const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  const when = await box('desk-when');
  const preview = await box('desk-preview');
  expect(preview.x).toBeGreaterThan(when.x + when.width - 1); // rechts daneben
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(async () => (await box('desk-preview')).x).toBeLessThanOrEqual((await box('desk-when')).x + 1);
  const who = await box('desk-who');
  const below = await box('desk-preview');
  expect(below.y).toBeGreaterThan(who.y + who.height - 1); // darunter
  expect(await overflow()).toBeLessThanOrEqual(0);
  // alle Blöcke haben dieselbe Breite (nichts wird gequetscht)
  expect(Math.abs((await box('desk-then')).width - (await box('desk-when')).width)).toBeLessThanOrEqual(1);
});

test('Ohne Recht „Wächter“ gibt es den Knopf nicht (die Liste bleibt lesbar)', async ({ browser, request, baseURL }) => {
  const s = await setup(request);
  await request.post('/api/watchers', {
    data: { name: `Lesend ${s.tag}`, trigger: { entityId: 'sensor.bad_batterie', kind: 'below', value: 5, forMin: 10 }, card: { boardId: s.boardId, columnId: s.columnId, title: `Karte ${s.tag}`, due: { kind: 'none' } }, assign: { mode: 'fixed', personIds: [s.rene.id] } },
  });
  const ctx = await browser.newContext({
    baseURL: String(baseURL),
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'x-remote-user-id': 'ha-conny-e2e', 'x-remote-user-name': 'conny', 'x-remote-user-display-name': 'Conny' },
  });
  const conny = await ctx.newPage();
  try {
    await conny.goto('/');
    await nav(conny).getByRole('button', { name: 'Wächter' }).click();
    await expect(conny.getByTestId('watcher-list')).toBeVisible();
    await expect(conny.getByTestId('watchers-summary')).toBeVisible();
    await expect(conny.getByTestId('new-watcher')).toHaveCount(0);
    await expect(conny.getByTestId('home-found')).toHaveCount(0);
    await expect(conny.getByTestId('watcher-desk')).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
