import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Beta-App (e2e/server-beta.mjs, STUPS_CHANNEL=beta, nachgebautes Home Assistant auf PORT+1). Push ist zunächst aus, die Wächter laufen.
test.describe.configure({ mode: 'serial', timeout: 60_000 });

const MOCK = 'http://127.0.0.1:18451';
const API = { 'x-stups-client': 'e2e' };

const setState = (request: APIRequestContext, entityId: string, state: string) => request.post(`${MOCK}/mock/state`, { data: { entityId, state } });

async function einstellungen(page: Page) {
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  return page.getByRole('dialog');
}

test('Die Beta meldet ihren Kanal; Push ist zunächst aus, die Wächter laufen', async ({ page, request }) => {
  expect((await (await request.get('/api/capabilities')).json()).channel).toBe('beta');
  expect(await (await request.get('/api/beta')).json()).toEqual({ push: { mode: 'off' }, watchers: true });

  const dialog = await einstellungen(page);
  await dialog.getByRole('button', { name: 'Beta', exact: true }).click();
  await expect(dialog.getByTestId('beta-banner')).toContainText('Beta-Version');
  await expect(dialog.getByRole('radio', { name: 'Aus' })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('switch', { name: 'Wächter in der Beta einschalten' })).toBeChecked();
});

test('Die Wächter-Seite sagt, dass die Wächter in der Beta aus sind; ein Administrator schaltet sie dort ein', async ({ page }) => {
  // Standard ist „an“: ohne Hinweis. Erst ausschalten, dann erscheint er.
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Wächter' }).click();
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('beta-watchers-off')).toHaveCount(0);
  await page.request.put('/api/beta', { headers: API, data: { watchers: false } });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Wächter' }).click();
  const hint = page.getByTestId('beta-watchers-off');
  await expect(hint).toContainText('In der Beta sind die Wächter ausgeschaltet');
  await hint.getByRole('button').click();
  await page.getByRole('button', { name: 'Einschalten', exact: true }).click();
  await expect(hint).toHaveCount(0);
  expect((await (await page.request.get('/api/beta')).json()).watchers).toBe(true);
});

test('Sensoren der Beta heißen sensor.stups_beta_…, die der normalen App kommen nicht vor', async ({ request }) => {
  await expect
    .poll(async () => ((await (await request.get(`${MOCK}/mock/published`)).json()) as { entityId: string }[]).map((s) => s.entityId), { timeout: 15_000 })
    .toEqual(expect.arrayContaining(['sensor.stups_beta_waechter_offen', 'sensor.stups_beta_stupse_offen']));
  const ids = ((await (await request.get(`${MOCK}/mock/published`)).json()) as { entityId: string }[]).map((s) => s.entityId);
  expect(ids.filter((id) => id.startsWith('sensor.stups_') && !id.startsWith('sensor.stups_beta_'))).toEqual([]);
});

test('Solange die Wächter aus sind, legen sie keine Aufgaben an; nach dem Einschalten schon', async ({ page, request }) => {
  await page.request.put('/api/beta', { headers: API, data: { watchers: false } });
  const boards = (await (await page.request.get('/api/boards')).json()) as { id: string }[];
  const view = (await (await page.request.get(`/api/boards/${boards[0]!.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const columnId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  const cards = async () =>
    ((await (await page.request.get(`/api/boards/${boards[0]!.id}`)).json()) as { cards: { title: string }[] }).cards.filter((c) => c.title.startsWith('Staubbehälter leeren'));

  const people = (await (await page.request.get('/api/people')).json()) as { id: string; name: string }[];
  await setState(request, 'vacuum.s7', 'cleaning');
  const created = await page.request.post('/api/watchers', {
    headers: API,
    data: {
      name: 'Saugroboter',
      trigger: { entityId: 'vacuum.s7', kind: 'state', to: 'docked', forMin: 0, count: 1 },
      card: { boardId: boards[0]!.id, columnId, title: 'Staubbehälter leeren', due: { kind: 'in', minutes: 30 } },
      assign: { mode: 'fixed', personIds: [people.find((p) => p.name === 'Rene')!.id], fallback: 'none', waitFallback: 'none' },
      cooldownMin: 0,
    },
  });
  expect(created.status()).toBe(201);

  await setState(request, 'vacuum.s7', 'docked');
  await page.waitForTimeout(4000);
  expect(await cards()).toHaveLength(0);

  // Einschalten: nur Administratoren, mit Stand-Abgleich
  const dialog = await einstellungen(page);
  await dialog.getByRole('button', { name: 'Beta', exact: true }).click();
  await dialog.getByRole('switch', { name: 'Wächter in der Beta einschalten' }).click();
  expect((await (await page.request.get('/api/beta')).json()).watchers).toBe(true);

  await setState(request, 'vacuum.s7', 'cleaning');
  await setState(request, 'vacuum.s7', 'docked');
  await expect.poll(cards, { timeout: 15_000 }).toHaveLength(1);
});

test('Push: „Nur für mich" und „An" lassen sich wählen und bleiben nach dem Neuladen', async ({ page }) => {
  const dialog = await einstellungen(page);
  await dialog.getByRole('button', { name: 'Beta', exact: true }).click();
  await dialog.getByRole('radio', { name: 'Nur für mich' }).click();
  await expect(dialog.getByRole('radio', { name: 'Nur für mich' })).toHaveAttribute('aria-checked', 'true');
  const rene = ((await (await page.request.get('/api/people')).json()) as { id: string; name: string }[]).find((p) => p.name === 'Rene')!;
  expect((await (await page.request.get('/api/beta')).json()).push).toEqual({ mode: 'only', personId: rene.id });

  await dialog.getByRole('radio', { name: 'An', exact: true }).click();
  const again = await einstellungen(page);
  await again.getByRole('button', { name: 'Beta', exact: true }).click();
  await expect(again.getByRole('radio', { name: 'An', exact: true })).toHaveAttribute('aria-checked', 'true');
  expect((await (await page.request.get('/api/beta')).json()).push).toEqual({ mode: 'all' });
});
