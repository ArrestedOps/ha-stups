import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Läuft nur im Projekt „waechter" (nachgebautes Home Assistant). Wächter und die Personen eines Boards: Board-Auswahl mit „Wer sieht es", Zeile
// „Zählt zur Fairness", Person aus dem Board entfernen (Dialog mit allen betroffenen Wächtern), Wächter ohne Zuständige (ganz oben mit rotem Rand,
// Hinweis im Editor, Mitteilung an der Glocke), Board auf „Nur ich" bei Wächtern darauf.
test.describe.configure({ timeout: 120_000, mode: 'serial' });

const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const ENTITY = 'sensor.iphone_rene_battery_level';
const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const created: string[] = [];
let boardId = '';
let columnId = '';
let connyId = '';
let reneId = '';
let heizung = '';
let waschmaschine = '';

async function clearWatchers(request: APIRequestContext) {
  const items = ((await (await request.get('/api/watchers')).json()) as { items: { id: string }[] }).items;
  for (const w of items) await request.delete(`/api/watchers/${w.id}`);
}
const watcher = async (request: APIRequestContext, id: string) => ((await (await request.get('/api/watchers')).json()) as { items: { id: string; status: string; assign: { personIds: string[] } }[] }).items.find((w) => w.id === id)!;
const input = (name: string, assign: object) => ({
  name,
  trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 10 },
  card: { boardId, columnId, title: `${name} Karte`, due: { kind: 'none' } },
  assign,
});

test.beforeAll(async ({ request }) => {
  await clearWatchers(request);
  const people = (await (await request.get('/api/people')).json()) as { id: string; name: string }[];
  reneId = people.find((p) => p.name === 'Rene')!.id;
  connyId = people.find((p) => p.name === 'Conny')!.id;
  const b = (await (await request.post('/api/boards', { data: { name: `Bad ${tag}`, visibility: 'selected', memberIds: [connyId] } })).json()) as { id: string };
  boardId = b.id;
  created.push(b.id);
  const view = (await (await request.get(`/api/boards/${b.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  columnId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  const priv = (await (await request.post('/api/boards', { data: { name: `Privat ${tag}`, visibility: 'private' } })).json()) as { id: string };
  created.push(priv.id);
  waschmaschine = ((await (await request.post('/api/watchers', { data: input(`Waschmaschine ${tag}`, { mode: 'rotation', personIds: [reneId, connyId] }) })).json()) as { id: string }).id;
  heizung = ((await (await request.post('/api/watchers', { data: input(`Heizung ${tag}`, { mode: 'fixed', personIds: [connyId] }) })).json()) as { id: string }).id;
});

test.afterAll(async ({ request }) => {
  await clearWatchers(request);
  for (const id of created) await request.delete(`/api/boards/${id}`);
});

async function openWatchers(page: Page) {
  await page.goto('/');
  await openBoards(page);
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
}

test('Wächter-Editor: Board-Auswahl mit „Wer sieht es", private Boards nicht wählbar, „Wer?" nur aus dem Board, Zeile „Zählt zur Fairness"', async ({ page }) => {
  await openWatchers(page);
  await page.getByRole('button', { name: `Wächter Waschmaschine ${tag} öffnen` }).click();
  const d = page.getByRole('dialog');
  await expect(d.getByTestId('fairness-row')).toBeVisible();
  await expect(d.getByTestId('fairness-row').getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  // Dann ändern: die Auswahl nennt, wer das Board sieht; ein privates Board steht da, ist aber nicht wählbar
  await d.getByRole('region', { name: 'Dann Karte' }).getByRole('button', { name: 'Ändern' }).click();
  const select = d.locator('select[aria-label="Board"]');
  await expect(select.locator('option', { hasText: `Bad ${tag}` })).toHaveText(`Bad ${tag} · Rene, Conny`);
  const priv = select.locator('option', { hasText: `Privat ${tag}` });
  await expect(priv).toHaveText(`🔒 Privat ${tag} · privat`);
  await expect(priv).toBeDisabled();
  // Wer?: der Hinweis, dass nur Personen aus dem Board zur Auswahl stehen
  await expect(d.getByTestId('board-people-hint').first()).toHaveText('Zur Auswahl nur Personen aus dem Board');
});

test('Server: private Boards sind als Ziel nicht wählbar (400)', async ({ request }) => {
  const privateId = ((await (await request.get('/api/boards')).json()) as { id: string; name: string }[]).find((b) => b.name === `Privat ${tag}`)!.id;
  const res = await request.post('/api/watchers', { data: { ...input('Privat', { mode: 'none' }), card: { boardId: privateId, columnId, title: 'x', due: { kind: 'none' } } } });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error: string }).error).toMatch(/Private Boards sind für Wächter nicht wählbar/);
});

test('Board auf „Nur ich": solange Wächter darauf zeigen, nein, mit Liste und „Wächter öffnen"', async ({ page }) => {
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), boardId);
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Bearbeiten' }).click();
  const settings = page.getByRole('dialog', { name: 'Board-Einstellungen' });
  await settings.getByTestId('visibility-private').click();
  const dialog = page.getByTestId('board-access-dialog');
  await expect(dialog).toContainText('Board kann nicht privat werden');
  await expect(dialog.getByTestId('blocked-list')).toContainText(`Heizung ${tag}`);
  await expect(dialog.getByTestId('blocked-list')).toContainText(`Waschmaschine ${tag}`);
  await dialog.getByRole('button', { name: 'Wächter öffnen' }).first().click();
  await expect(page.getByTestId('fairness-row')).toBeVisible();
});

test('Conny aus dem Board entfernen: Dialog mit allen betroffenen Wächtern „jetzt → danach", der Server nimmt sie aus den Kreisen', async ({ page, request }) => {
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), boardId);
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Bearbeiten' }).click();
  const settings = page.getByRole('dialog', { name: 'Board-Einstellungen' });
  await settings.getByTestId('visibility-members').getByRole('button', { name: 'Conny' }).click();
  const dialog = page.getByTestId('board-access-dialog');
  await expect(dialog).toContainText('Conny aus');
  await expect(dialog.getByTestId('access-sub')).toContainText('Das ändert 2 Wächter');
  const waschRow = dialog.getByTestId('access-list').locator('li', { hasText: `Waschmaschine ${tag}` });
  await expect(waschRow).toContainText('Rene, Conny');
  await expect(waschRow).toContainText('Rene (reihum)');
  const heizRow = dialog.getByTestId('access-list').locator('li', { hasText: `Heizung ${tag}` });
  await expect(heizRow).toHaveAttribute('data-missing', '');
  await expect(heizRow).toContainText('niemand: Wächter legt keine Karten an, bis neue Zuständige gewählt sind');
  // noch nichts geändert
  expect((await watcher(request, heizung)).status).toBe('ok');
  await dialog.getByTestId('access-confirm').click();
  await expect.poll(async () => (await watcher(request, heizung)).status).toBe('assignees_missing');
  expect((await watcher(request, waschmaschine)).assign.personIds).toEqual([reneId]);
});

test('Wächter ohne Zuständige: ganz oben mit rotem Rand und Grund als Text; die Liste sonst unverändert', async ({ page }) => {
  await openWatchers(page);
  const problems = page.getByTestId('home-problems');
  await expect(problems).toBeVisible();
  const row = problems.getByTestId('watcher-row').filter({ hasText: `Heizung ${tag}` });
  await expect(row).toContainText('Keine Karten: braucht neue Zuständige');
  await expect(row.locator('.row-problem')).toHaveCount(1);
  // oben: vor allem anderen, auch vor der Liste mit den Kategorien
  const first = await page.getByTestId('home').evaluate((home) => {
    const p = home.querySelector('[data-testid="home-problems"]')!;
    const l = home.querySelector('[data-testid="watcher-list"]')!;
    return !!(p.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(first).toBe(true);
  // der Rand ist rot (Danger-Token), nicht orange
  const color = await row.locator('.row-problem').evaluate((el) => getComputedStyle(el).borderTopColor);
  const danger = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--danger').trim());
  expect(danger).not.toBe('');
  expect(color).not.toBe('');
  // kein Banner, keine Tabelle
  await expect(page.getByTestId('home-rename')).toHaveCount(0);
  await expect(page.getByText('braucht neue Zuständige', { exact: false }).first()).toBeVisible();
});

test('Mitteilung an der Glocke: „braucht neue Zuständige", ein Tipp öffnet den Wächter mit Hinweis und „Zuständige wählen"; neue Zuständige beenden es', async ({ page, request }) => {
  await page.goto('/');
  const bell = page.getByTestId('bell-dot');
  await expect(bell).toBeVisible({ timeout: 20_000 });
  await expect(bell).toHaveText(/^(\d|9\+)$/);
  await page.getByTestId('bell').click();
  const sheet = page.getByTestId('notifications');
  await expect(sheet).toContainText(`Heizung ${tag} braucht neue Zuständige`);
  await expect(sheet).toContainText('Conny ist nicht mehr im Board');
  await expect(sheet).toContainText(`Waschmaschine ${tag}: Conny entfernt`);
  await expect(sheet).toContainText('läuft weiter mit Rene');
  await sheet.getByRole('button', { name: new RegExp(`Heizung ${tag} braucht neue Zuständige`) }).click();
  const d = page.getByRole('dialog');
  const note = d.getByTestId('assignees-missing');
  await expect(note).toBeVisible();
  await expect(d.getByTestId('assignees-missing-title')).toContainText('Conny ist nicht mehr im Board');
  await note.getByRole('button', { name: 'Zuständige wählen' }).click();
  await expect(d.getByTestId('who-editor')).toBeVisible();
  // Rene wählen und speichern: der Status fällt weg
  await d.getByTestId('who-editor').getByRole('group', { name: 'Personen' }).getByRole('button', { name: /Rene/ }).click({ timeout: 15_000 });
  await d.getByRole('button', { name: 'Speichern' }).first().click();
  await expect.poll(async () => (await watcher(request, heizung)).status).toBe('ok');
});
