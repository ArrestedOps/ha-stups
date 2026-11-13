import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBoards, openWatcherCategory } from './helpers';

// Läuft nur im Projekt „waechter" (nachgebautes Home Assistant). Board löschen mit der Wahl je Wächter (Pausieren, Umziehen, Löschen), die
// pausierten Wächter oben in der Liste mit rotem Rand („Pausiert: Board fehlt"), Wiederherstellen aus dem Papierkorb lässt sie wieder laufen;
// Archivieren pausiert die Wächter („Pausiert: Board archiviert"), Wiederherstellen aus dem Archiv ebenso.
test.describe.configure({ timeout: 120_000, mode: 'serial' });

const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const ENTITY = 'sensor.iphone_rene_battery_level';
const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const created: string[] = [];

type W = { id: string; name: string; status: string; active: boolean; pausedBy: string | null; card: { boardId: string } };
const watchers = async (request: APIRequestContext) => ((await (await request.get('/api/watchers')).json()) as { items: W[] }).items;
const watcher = async (request: APIRequestContext, id: string) => (await watchers(request)).find((w) => w.id === id);

async function clearWatchers(request: APIRequestContext) {
  for (const w of await watchers(request)) await request.delete(`/api/watchers/${w.id}`);
}
async function board(request: APIRequestContext, name: string, extra: Record<string, unknown> = {}) {
  const b = (await (await request.post('/api/boards', { data: { name, ...extra } })).json()) as { id: string };
  created.push(b.id);
  const view = (await (await request.get(`/api/boards/${b.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  return { id: b.id, columnId: view.columns.find((c) => !c.isDone && !c.isPlanned)!.id };
}
async function watcherOn(request: APIRequestContext, target: { id: string; columnId: string }, name: string) {
  const res = await request.post('/api/watchers', {
    data: { name, trigger: { entityId: ENTITY, kind: 'below', value: 5, forMin: 10 }, card: { boardId: target.id, columnId: target.columnId, title: `${name} Aufgabe`, due: { kind: 'none' } }, assign: { mode: 'none', personIds: [] } },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test.beforeAll(async ({ request }) => {
  await clearWatchers(request);
});
test.afterAll(async ({ request }) => {
  await clearWatchers(request);
  for (const b of (await (await request.get('/api/boards/archived')).json()) as { id: string }[]) await request.post(`/api/boards/${b.id}/unarchive`);
  for (const id of created) await request.delete(`/api/boards/${id}`);
});

async function openSettings(page: Page, current: string) {
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), current);
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Board-Einstellungen' }).click();
  const settings = page.getByRole('dialog', { name: 'Board-Einstellungen' });
  await expect(settings.getByTestId('settings-board')).toBeVisible();
  return settings;
}

test('Löschen: je Wächter Pausieren, Umziehen oder Löschen; pausierte stehen oben in der Liste mit rotem Rand, Wiederherstellen lässt sie wieder laufen', async ({ page, request }) => {
  const quelle = await board(request, `Quelle ${tag}`);
  const ziel = await board(request, `Ziel ${tag}`);
  await board(request, `Privat ${tag}`, { visibility: 'private' });
  const pause = await watcherOn(request, quelle, `Waschmaschine ${tag}`);
  const umzug = await watcherOn(request, quelle, `Batterie ${tag}`);
  const weg = await watcherOn(request, quelle, `Heizung ${tag}`);

  const settings = await openSettings(page, quelle.id);
  await settings.getByTestId('board-delete').click();
  const dialog = page.getByTestId('board-delete-dialog');
  await expect(dialog).toContainText(`„Quelle ${tag}“ löschen?`);
  // je Wächter eine Wahl, Standard ist Pausieren
  for (const id of [pause, umzug, weg]) await expect(dialog.getByTestId(`delete-watcher-${id}`).getByRole('radio', { name: 'Pausieren' })).toHaveAttribute('aria-checked', 'true');

  // Umziehen: das Ziel-Board wählen; private Boards stehen nicht zur Wahl
  const moveRow = dialog.getByTestId(`delete-watcher-${umzug}`);
  await moveRow.getByRole('radio', { name: 'Umziehen' }).click();
  const target = moveRow.getByLabel(`Ziel-Board für „Batterie ${tag}“`);
  await expect(target.locator('option', { hasText: `Privat ${tag}` })).toHaveCount(0);
  await expect(target.locator('option', { hasText: `Quelle ${tag}` })).toHaveCount(0);
  await target.selectOption(ziel.id);
  await expect(moveRow).toContainText('Zuständige müssen dort Mitglieder sein');
  // Löschen
  await dialog.getByTestId(`delete-watcher-${weg}`).getByRole('radio', { name: 'Löschen' }).click();
  await dialog.getByTestId('delete-confirm').click();

  await expect.poll(async () => (await watcher(request, weg)) === undefined).toBe(true);
  expect(await watcher(request, pause)).toMatchObject({ status: 'target_missing', active: false, pausedBy: 'deleted' });
  expect(await watcher(request, umzug)).toMatchObject({ status: 'ok', active: true, card: { boardId: ziel.id } });

  // Wächter-Liste: der pausierte steht ganz oben mit rotem Rand und „Pausiert: Board fehlt"
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  const problems = page.getByTestId('home-problems');
  await expect(problems).toBeVisible();
  const row = problems.getByTestId('watcher-row').filter({ hasText: `Waschmaschine ${tag}` });
  await expect(row).toContainText('Pausiert: Board fehlt');
  await expect(row.locator('.row-problem')).toHaveCount(1);
  await expect(problems.getByTestId('watcher-row').filter({ hasText: `Batterie ${tag}` })).toHaveCount(0);

  // aus dem Papierkorb zurück: der Wächter läuft von selbst wieder, der Fehler ist weg
  expect((await request.post(`/api/trash/board/${quelle.id}/restore`)).status()).toBe(204);
  await expect.poll(async () => (await watcher(request, pause))?.status).toBe('ok');
  expect(await watcher(request, pause)).toMatchObject({ active: true, pausedBy: null });
  await page.reload();
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await openWatcherCategory(page);
  await expect(page.getByTestId('watcher-row').filter({ hasText: `Waschmaschine ${tag}` })).toBeVisible();
  await expect(page.getByTestId('home-problems').filter({ hasText: `Waschmaschine ${tag}` })).toHaveCount(0);
});

test('Archivieren: der Dialog zeigt die Wächter als pausiert, die Liste sagt „Pausiert: Board archiviert“, „Wiederherstellen“ lässt sie laufen', async ({ page, request }) => {
  const arch = await board(request, `Archiv ${tag}`);
  const w = await watcherOn(request, arch, `Waschmaschine archiv ${tag}`);
  const settings = await openSettings(page, arch.id);
  await settings.getByRole('button', { name: /^Board archivieren/ }).click();
  const dialog = page.getByTestId('board-archive-dialog');
  await expect(dialog.getByTestId('archive-watchers')).toContainText(`Waschmaschine archiv ${tag}`);
  await expect(dialog.getByTestId('archive-watchers')).toContainText('wird pausiert: Board archiviert');
  // nichts zu wählen, nicht „Weiterlaufen“
  await expect(dialog.getByRole('radio')).toHaveCount(0);
  await expect(dialog).not.toContainText('Weiterlaufen');
  await dialog.getByTestId('archive-confirm').click();
  await expect.poll(async () => (await watcher(request, w))?.status).toBe('target_missing');
  expect(await watcher(request, w)).toMatchObject({ active: false, pausedBy: 'archived' });

  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  const row = page.getByTestId('home-problems').getByTestId('watcher-row').filter({ hasText: `Waschmaschine archiv ${tag}` });
  await expect(row).toContainText('Pausiert: Board archiviert');
  await expect(row.locator('.row-problem')).toHaveCount(1);

  // Wiederherstellen aus „Archivierte Boards“
  await nav(page).getByRole('button', { name: 'Boards' }).click();
  await page.getByTestId('board-list').getByRole('button').first().click(); // Handy: erst ein Board öffnen
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Archivierte Boards' }).click();
  await page.getByTestId(`archived-${arch.id}`).getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect.poll(async () => (await watcher(request, w))?.status).toBe('ok');
  expect(await watcher(request, w)).toMatchObject({ active: true, pausedBy: null });
});
