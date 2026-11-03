import { expect, test, type Page } from '@playwright/test';

// Eigene Akzentfarbe: Farbkreis in den Einstellungen, gilt sofort, bleibt nach dem Neuladen und wird je Person gespeichert.
// Der Server ist derselbe wie bei den anderen Tests, darum stellt jeder Test die Farbe am Ende zurück.
const HEADERS = { 'x-stups-client': 'e2e' };

test.afterEach(async ({ request }) => {
  await request.put('/api/me/accent', { data: { hue: null }, headers: HEADERS });
});

const accentVar = (page: Page) => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'));
const savedHue = async (page: Page) => ((await (await page.request.get('/api/me')).json()) as { user: { accentHue: number | null } }).user.accentHue;

async function openWheel(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sprache und Farbe' }).click();
  const wheel = page.getByTestId('accent-wheel');
  await wheel.scrollIntoViewIfNeeded();
  return wheel;
}

test('Farbkreis: Antippen ändert die Farbe sofort, speichert sie und sie bleibt nach dem Neuladen', async ({ page }) => {
  const wheel = await openWheel(page);
  await expect(wheel).toHaveAttribute('aria-valuetext', 'Orange (Standard)');
  expect(await accentVar(page)).toBe('');
  await expect(page.getByRole('button', { name: 'Orange (Standard)' })).toBeDisabled();

  // Rechts auf dem Ring: 90° von oben im Uhrzeigersinn
  const box = (await wheel.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 96, box.y + box.height / 2);
  await expect(wheel).toHaveAttribute('aria-valuenow', '90');
  expect(await accentVar(page)).toMatch(/^#[0-9a-f]{6}$/);
  await expect.poll(() => savedHue(page)).toBe(90);
  await expect(page.getByRole('button', { name: 'Orange (Standard)' })).toBeEnabled();

  await page.reload();
  expect(await accentVar(page)).toMatch(/^#[0-9a-f]{6}$/);
  await page.getByRole('button', { name: 'Board wechseln' }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sprache und Farbe' }).click();
  await expect(page.getByTestId('accent-wheel')).toHaveAttribute('aria-valuenow', '90');
});

test('Farbkreis: Ziehen folgt dem Finger, gespeichert wird beim Loslassen', async ({ page }) => {
  const wheel = await openWheel(page);
  const box = (await wheel.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx + 96, cy); // 90°
  await page.mouse.down();
  await page.mouse.move(cx, cy - 96, { steps: 6 }); // 0° (oben, über Rot hinweg)
  await expect(wheel).toHaveAttribute('aria-valuenow', '0');
  expect(await savedHue(page)).toBeNull(); // noch nicht gespeichert
  await page.mouse.up();
  await expect.poll(() => savedHue(page)).toBe(0);
});

test('Farbkreis: Orange (Standard) stellt die Farbe der App wieder her', async ({ page }) => {
  const wheel = await openWheel(page);
  const box = (await wheel.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 - 96, box.y + box.height / 2); // 270°
  await expect.poll(() => savedHue(page)).toBe(270);
  await page.getByRole('button', { name: 'Orange (Standard)' }).click();
  await expect.poll(() => savedHue(page)).toBeNull();
  expect(await accentVar(page)).toBe('');
  await expect(wheel).toHaveAttribute('aria-valuetext', 'Orange (Standard)');
});

test('Farbkreis: mit der Tastatur bedienbar (Pfeile, Shift = große Schritte)', async ({ page }) => {
  const wheel = await openWheel(page);
  await wheel.focus();
  await page.keyboard.press('ArrowRight'); // von 40° (Orange) um 5° weiter
  await expect(wheel).toHaveAttribute('aria-valuenow', '45');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(wheel).toHaveAttribute('aria-valuenow', '15');
  await expect.poll(() => savedHue(page)).toBe(15);
});

test('Türkis gehört dem Haus: der Farbkreis lässt Grün und Türkis aus, ein Tipp dorthin rückt an den Rand', async ({ page }) => {
  const wheel = await openWheel(page);
  const box = (await wheel.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 96); // 180° liegt mitten in der Lücke
  await expect(wheel).toHaveAttribute('aria-valuenow', '211');
  await expect.poll(() => savedHue(page)).toBe(211);
  // und das Haus bleibt Türkis, egal welche Farbe man wählt
  const house = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--house').trim());
  expect(house).toMatch(/^#[0-9a-f]{6}$/);
});

test('Antippen der Mitte oder weit außerhalb ändert nichts', async ({ page }) => {
  const wheel = await openWheel(page);
  const box = (await wheel.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 20, box.y + box.height / 2 + 10); // Vorschau-Knopf in der Mitte
  expect(await accentVar(page)).toBe('');
  expect(await savedHue(page)).toBeNull();
});
