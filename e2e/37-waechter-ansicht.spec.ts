import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Läuft nur im Projekt „waechter" (nachgebautes Home Assistant, Handy 390 × 844). Reiter Wächter: alle Wächter immer sichtbar, in Kategorien zum
// Zu- und Aufklappen, je Wächter ein Schalter „aktiv/aus", Kategorie beim Anlegen vorgeschlagen, Sammelknopf „Kategorien vorschlagen".
const MOCK = 'http://127.0.0.1:18411';
test.describe.configure({ timeout: 90_000, mode: 'serial' });

interface W {
  id: string;
  name: string;
  active: boolean;
  category: string | null;
  trigger: { entityId: string };
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const watchers = async (request: APIRequestContext) => ((await (await request.get('/api/watchers')).json()) as { items: W[] }).items;
const clear = async (request: APIRequestContext) => {
  for (const w of await watchers(request)) await request.delete(`/api/watchers/${w.id}`);
};
const setState = (request: APIRequestContext, entityId: string, state: string) => request.post(`${MOCK}/mock/state`, { data: { entityId, state } });
// Jeder Test räumt hinter sich auf, auch wenn er scheitert (die Wächter gehören dem ganzen Lauf)
test.afterEach(async ({ request }) => clear(request));
const connyHeaders = { 'x-remote-user-id': 'ha-conny-e2e', 'x-remote-user-name': 'conny', 'x-remote-user-display-name': 'Conny' };

async function setup(request: APIRequestContext) {
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string }[];
  const rene = people.find((p) => p.name === 'Rene')!;
  const tag = Date.now().toString(36);
  const board = (await (await request.post('/api/boards', { data: { name: `Ansicht ${tag}` } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  return { rene, boardId: board.id, columnId: view.columns.find((c) => !c.isDone && !c.isPlanned)!.id, tag };
}
type S = Awaited<ReturnType<typeof setup>>;

const make = (s: S, name: string, entityId: string, extra: Record<string, unknown> = {}) => ({
  name,
  // Schwelle 5: die Batterien (12 %, 14 %) liegen darüber, der Wächter bleibt ruhig (unter 20 % legte er nach 10 Minuten sofort eine Karte an)
  trigger: { entityId, kind: 'below', value: 5, forMin: 10 },
  card: { boardId: s.boardId, columnId: s.columnId, title: `Karte ${name}`, due: { kind: 'none' } },
  assign: { mode: 'fixed', personIds: [s.rene.id] },
  cooldownMin: 0,
  ...extra,
});

async function openList(page: Page, s: S) {
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), s.boardId);
  await page.goto('/');
  await openBoards(page);
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await expect(page.getByTestId('watcher-list')).toBeVisible();
}

test('Alle Wächter sind immer sichtbar, nach Kategorie gruppiert; Gruppen klappen zu und auf und der Zustand bleibt', async ({ page, request }) => {
  await clear(request);
  const s = await setup(request);
  const long = `Sehr langer Wächtername ${'x'.repeat(40)} ${s.tag}`;
  for (const [name, entity, category] of [
    [`Alpha ${s.tag}`, 'sensor.bad_batterie', 'Garten'],
    [`Beta ${s.tag}`, 'sensor.iphone_rene_battery_level', 'garten'],
    [long.slice(0, 80), 'sensor.trockner_leistung', null],
  ] as const) {
    expect((await request.post('/api/watchers', { data: make(s, name, entity, { category }) })).status()).toBe(201);
  }
  await openList(page, s);

  // kein Zuklapper „N Wächter ohne offene Aktion": jeder Wächter steht als Zeile da
  await expect(page.getByText(/ohne offene Aktion/)).toHaveCount(0);
  await expect(page.getByTestId('watcher-row')).toHaveCount(3);
  // gleiche Namen ohne Beachtung der Groß-/Kleinschreibung sind eine Gruppe; „Ohne Kategorie" steht ganz unten
  const groups = page.getByTestId('watcher-category');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toContainText('Garten');
  await expect(groups.nth(0).getByTestId('watcher-row')).toHaveCount(2);
  await expect(groups.nth(1)).toContainText('Ohne Kategorie');

  // Schalter: mindestens 44 px hoch, nichts läuft über, auch bei dem langen Namen
  for (const sw of await page.getByRole('switch').all()) expect((await sw.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const rows = await page.getByTestId('watcher-row').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
  for (const r of rows) expect(r).toBeLessThanOrEqual(page.viewportSize()!.width);

  // zuklappen: Kopf mit aria-expanded, die Zeilen verschwinden, nach dem Neuladen bleibt es zugeklappt
  const head = groups.nth(0).getByRole('button', { expanded: true });
  await head.click();
  await expect(groups.nth(0).getByRole('button', { expanded: false })).toBeVisible();
  await expect(groups.nth(0).getByTestId('watcher-row')).toHaveCount(0);
  await expect(groups.nth(1).getByTestId('watcher-row')).toHaveCount(1);
  await page.reload();
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await expect(page.getByTestId('watcher-category').nth(0).getByTestId('watcher-row')).toHaveCount(0);
  await page.getByTestId('watcher-category').nth(0).getByRole('button', { expanded: false }).click();
  await expect(page.getByTestId('watcher-category').nth(0).getByTestId('watcher-row')).toHaveCount(2);
  await clear(request);
});

test('Schalter: aus löst nicht mehr aus (der Server entscheidet), an wieder; die Zeile bleibt sichtbar, gedämpft, „Aus"', async ({ page, request }) => {
  await clear(request);
  const s = await setup(request);
  await setState(request, 'sensor.waschmaschine_leistung', '120');
  const name = `Schalter ${s.tag}`;
  const created = await request.post('/api/watchers', { data: make(s, name, 'sensor.waschmaschine_leistung', { category: 'Test', trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 0 } }) });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  const cards = async () => ((await (await request.get(`/api/boards/${s.boardId}`)).json()) as { cards: { title: string }[] }).cards.filter((c) => c.title.startsWith(`Karte ${name}`));

  await openList(page, s);
  const sw = page.getByRole('switch', { name: `${name} aktiv` });
  await expect(sw).toBeEnabled();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => (await watchers(request)).find((w) => w.id === id)!.active).toBe(false);
  // der Wächter bleibt sichtbar: „Aus", gedämpft
  const row = page.getByTestId('watcher-row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row.getByTestId('watcher-status')).toHaveText('Aus');

  // aus: die Maschine wird fertig, aber es entsteht keine Karte
  await setState(request, 'sensor.waschmaschine_leistung', '2');
  await page.waitForTimeout(3000);
  expect(await cards()).toHaveLength(0);

  // an: der nächste Durchgang löst aus
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await watchers(request)).find((w) => w.id === id)!.active).toBe(true);
  await setState(request, 'sensor.waschmaschine_leistung', '120');
  await setState(request, 'sensor.waschmaschine_leistung', '2');
  await expect.poll(async () => (await cards()).length, { timeout: 20_000 }).toBe(1);
  await clear(request);
});

test('Mitglied ohne Recht: der Schalter ist sichtbar, aber gesperrt; der Server verweigert die Änderung', async ({ browser, request, baseURL }) => {
  await clear(request);
  const s = await setup(request);
  const name = `Lesend ${s.tag}`;
  const id = ((await (await request.post('/api/watchers', { data: make(s, name, 'sensor.bad_batterie', { category: 'Test' }) })).json()) as { id: string }).id;
  const ctx = await browser.newContext({ baseURL: String(baseURL), extraHTTPHeaders: connyHeaders, viewport: { width: 390, height: 844 } });
  const conny = await ctx.newPage();
  try {
    await conny.goto('/');
    await conny.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Wächter' }).click();
    const sw = conny.getByRole('switch', { name: `${name} aktiv` });
    await expect(sw).toBeVisible();
    await expect(sw).toBeDisabled();
    // die Kategorien sind zu sehen, auch ohne Recht
    await expect(conny.getByTestId('watcher-category').filter({ hasText: 'Test' })).toBeVisible();
    // Banner „Kategorien vorschlagen" nur mit Recht
    await expect(conny.getByTestId('home-categorize')).toHaveCount(0);
    expect((await ctx.request.patch(`/api/watchers/${id}`, { data: { active: false }, headers: { 'x-stups-client': 'e2e' } })).status()).toBe(403);
    expect((await ctx.request.patch(`/api/watchers/${id}`, { data: { category: 'X' }, headers: { 'x-stups-client': 'e2e' } })).status()).toBe(403);
    expect((await watchers(request)).find((w) => w.id === id)).toMatchObject({ active: true, category: 'Test' });
  } finally {
    await ctx.close();
  }
  await clear(request);
});

test('Neuer Wächter: die Kategorie wird vorgeschlagen und vorbelegt; eine eigene lässt sich anlegen; im Editor änderbar', async ({ page, request }) => {
  await clear(request);
  const s = await setup(request);
  // die Werte neu setzen: unter 20 % legt ein neuer Batterie-Wächter nach 10 Minuten seit der letzten Änderung sofort eine Karte an
  await setState(request, 'sensor.bad_batterie', '12');
  await setState(request, 'sensor.iphone_rene_battery_level', '14');
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), s.boardId);
  await page.goto('/');
  await openBoards(page);
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  const d = page.getByRole('dialog');

  async function setupHit(hitText: string) {
    await page.getByRole('button', { name: 'Alle Wächter verwalten' }).click();
    await page.getByRole('button', { name: 'Wächter aus Vorlagen' }).click();
    await d.getByTestId('found-hit').filter({ hasText: hitText }).getByRole('button', { name: 'Einrichten' }).click();
    await expect(d.getByTestId('graph-card')).toBeVisible();
    await d.getByRole('button', { name: 'Weiter: Dann' }).click();
    await d.getByTestId('then-editor').getByLabel('Board', { exact: true }).selectOption(s.boardId);
    await d.getByRole('button', { name: 'Weiter: Wer' }).click();
    await d.getByRole('button', { name: 'Weiter: Feinschliff' }).click();
  }

  // 1) Vorschlag der Vorlage bleibt stehen
  await setupHit('Bad Fenster Batterie');
  const field = d.getByTestId('category-field');
  await expect(field.locator('select')).toHaveValue('Batterien');
  await d.getByRole('button', { name: 'Wächter anlegen' }).click();
  await expect(page.getByText('Wächter gespeichert')).toBeVisible();
  await expect.poll(async () => (await watchers(request)).find((w) => w.trigger.entityId === 'sensor.bad_batterie')?.category).toBe('Batterien');

  // 2) eigene Kategorie: „Neue Kategorie …" und ein Name
  await page.keyboard.press('Escape');
  await setupHit('iPhone Rene Battery Level');
  await expect(d.getByTestId('category-field').locator('select')).toHaveValue('Batterien');
  await d.getByTestId('category-field').locator('select').selectOption({ label: 'Neue Kategorie …' });
  await d.getByTestId('category-new').fill('Haus & Garten');
  await d.getByRole('button', { name: 'Wächter anlegen' }).click();
  await expect(page.getByText('Wächter gespeichert').first()).toBeVisible();
  await expect.poll(async () => (await watchers(request)).find((w) => w.trigger.entityId === 'sensor.iphone_rene_battery_level')?.category).toBe('Haus & Garten');

  // Übersicht: zwei Kategorien, alphabetisch
  await page.keyboard.press('Escape');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  const groups = page.getByTestId('watcher-category');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toContainText('Batterien');
  await expect(groups.nth(1)).toContainText('Haus & Garten');

  // 3) im Editor ändern (Chip „Kategorie: …"): wird zusammengelegt
  await groups.nth(1).getByRole('button', { name: /^Wächter .* öffnen$/ }).click();
  await d.getByRole('button', { name: /^Kategorie: Haus & Garten$/ }).click();
  await d.getByTestId('category-field').locator('select').selectOption('Batterien');
  await d.getByRole('button', { name: 'Speichern', exact: true }).first().click();
  await expect(page.getByText('Wächter gespeichert').first()).toBeVisible();
  await expect.poll(async () => (await watchers(request)).map((w) => w.category)).toEqual(['Batterien', 'Batterien']);
  await expect(page.getByTestId('watcher-category')).toHaveCount(1);
  await clear(request);
});

test('Kategorien vorschlagen: fragt vorher nach, setzt nur bei Wächtern ohne Kategorie, meldet eine Zahl', async ({ page, request }) => {
  await clear(request);
  const s = await setup(request);
  await request.post('/api/watchers', { data: make(s, `Eigene ${s.tag}`, 'sensor.bad_batterie', { category: 'Meine Gruppe' }) });
  await request.post('/api/watchers', { data: make(s, 'Batterie schwach', 'sensor.iphone_rene_battery_level') });
  await request.post('/api/watchers', { data: make(s, 'Waschmaschine fertig', 'sensor.waschmaschine_leistung') });
  await openList(page, s);

  await expect(page.getByTestId('watcher-category').last()).toContainText('Ohne Kategorie');
  await page.getByTestId('home-categorize').getByRole('button', { name: /Kategorien vorschlagen/ }).click();
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog')).last();
  await expect(confirm).toContainText('2 Wächter haben noch keine Kategorie');
  await confirm.getByRole('button', { name: 'Vorschlagen' }).click();
  await expect(page.getByText('2 Kategorien gesetzt')).toBeVisible();
  const after = await watchers(request);
  expect(after.find((w) => w.name === `Eigene ${s.tag}`)!.category).toBe('Meine Gruppe');
  expect(after.find((w) => w.name === 'Batterie schwach')!.category).toBe('Batterien');
  expect(after.find((w) => w.name === 'Waschmaschine fertig')!.category).toBe('Haushaltsgeräte');
  await expect(page.getByTestId('home-categorize')).toHaveCount(0);
  await expect(page.getByTestId('watcher-category').filter({ hasText: 'Ohne Kategorie' })).toHaveCount(0);
  await clear(request);
});
