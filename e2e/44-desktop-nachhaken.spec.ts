import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Läuft nur im Projekt „desktop-ha“ (1440 × 900): Stupsen, wenn noch offen, als breite Karte unter „Mehr Einstellungen“ im Formular
// „Neuer Wächter“. Die drei Felder stehen auf einer Linie (einzeilige Beschriftungen, gleich hohe Felder, gleiche Oberkante), rechts der Zeitstrahl.
test.describe.configure({ timeout: 90_000 });

const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const clear = async (request: APIRequestContext) => {
  const items = ((await (await request.get('/api/watchers')).json()) as { items: { id: string }[] }).items;
  for (const w of items) await request.delete(`/api/watchers/${w.id}`);
};
test.afterEach(async ({ request }) => clear(request));

test('Desktop: Karte „Stupsen, wenn noch offen“, drei Felder auf einer Linie, Zeitstrahl rechts, Satz in der Vorschau', async ({ page, request }) => {
  await clear(request);
  const board = (await (await request.post('/api/boards', { data: { name: `Nachhaken ${Date.now().toString(36)}` } })).json()) as { id: string };
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await page.getByTestId('new-watcher').click();
  await expect(page.getByTestId('desk-then')).toBeVisible();

  await page.getByTestId('desk-more-settings').getByRole('button', { name: /Mehr Einstellungen/ }).click();
  const card = page.getByTestId('nudge-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-wide', '');
  await expect(card).toContainText('Stupsen, wenn noch offen');
  await expect(card).toContainText('freundlich erinnern, endet mit der Erledigung');
  // ohne Wert: kein Stups
  await expect(page.getByTestId('nudge-timeline')).toContainText('Leer lassen: kein Stups.');

  await card.getByLabel('Stupsen nach Minuten').fill('30');
  await card.getByLabel('Wiederholen alle Minuten').fill('30');
  await card.getByLabel('Höchstens so viele Stupse').fill('3');

  // eine Linie: gleiche Oberkante und Höhe der Felder, Beschriftungen einzeilig und auf gleicher Höhe
  const fields = card.getByTestId('nudge-fields');
  const inputs = await Promise.all(['Stupsen nach Minuten', 'Wiederholen alle Minuten', 'Höchstens so viele Stupse'].map(async (l) => (await fields.getByLabel(l).boundingBox())!));
  expect(new Set(inputs.map((b) => Math.round(b.y))).size).toBe(1);
  expect(new Set(inputs.map((b) => Math.round(b.height))).size).toBe(1);
  const labels = fields.locator('label > span.uppercase');
  await expect(labels).toHaveText(['Nach', 'Wiederholen alle', 'Höchstens']);
  const lbox = await labels.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { y: Math.round(r.y), h: Math.round(r.height), lines: Math.round(r.height / parseFloat(getComputedStyle(e).lineHeight)) }; }));
  expect(new Set(lbox.map((b) => b.y)).size).toBe(1);
  expect(lbox.every((b) => b.lines === 1)).toBe(true);
  // die Felder liegen nebeneinander, nichts rutscht in eine zweite Zeile
  expect(inputs[0]!.x + inputs[0]!.width).toBeLessThanOrEqual(inputs[1]!.x);
  expect(inputs[1]!.x + inputs[1]!.width).toBeLessThanOrEqual(inputs[2]!.x);

  // Zeitstrahl rechts neben den Feldern: Angelegt, Stups 1 bis 3, der letzte markiert
  const timeline = page.getByTestId('nudge-timeline');
  await expect(timeline).toContainText('So läuft es ab');
  for (const x of ['Angelegt', 'Stups 1', 'Stups 2', 'Stups 3', '12:30', '13:00', '13:30 · letzter']) await expect(timeline).toContainText(x);
  expect((await timeline.boundingBox())!.x).toBeGreaterThan(inputs[2]!.x + inputs[2]!.width);

  // Vorschau nennt das Stupsen
  await expect(page.getByTestId('desk-preview')).toContainText('Wird nach 30 Min. nicht erledigt, gibt es bis zu 3 Stups.');
});
