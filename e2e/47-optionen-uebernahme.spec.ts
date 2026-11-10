import { expect, test } from '@playwright/test';
import { openBoards, openSettingsPage } from './helpers';

// Add-on mit einer options.json aus der Zeit vor 1.41 (e2e/server-options.mjs): Personenliste gefüllt, Zugriff „selected", Nachhaken um 19:30.
// Der erste Start hat die Optionen in die App übernommen; die App ist danach nicht mehr gesperrt.
const dialog = (page: import('@playwright/test').Page) => page.getByRole('dialog');

test('Die Optionen sind in der App angekommen: Personen ohne Sperre, Zugriff „selected", Nachhaken um 19:30', async ({ page, request }) => {
  const access = (await (await request.get('/api/access')).json()) as { managed: boolean; mode: string; people: { name: string }[] };
  expect(access.managed).toBe(false);
  expect(access.mode).toBe('selected');
  expect(access.people.map((p) => p.name).sort()).toEqual(['Ben', 'Rene']);

  const settings = (await (await request.get('/api/settings')).json()) as { overdueNagTime: string | null; effectiveOverdueNagTime: string };
  expect(settings).toMatchObject({ overdueNagTime: '19:30', effectiveOverdueNagTime: '19:30' });

  await page.goto('/');
  await openBoards(page);
  await openSettingsPage(page, 'Personen & Zugriff');
  await expect(dialog(page).getByTestId('managed-note')).toHaveCount(0);
  await expect(dialog(page).getByText('Ben').first()).toBeVisible();
});

test('Nachhaken um …: zeigt die übernommene Uhrzeit, Ändern bleibt, Zurücksetzen nimmt die Standard-Uhrzeit', async ({ page, request }) => {
  await page.goto('/');
  await openBoards(page);
  await openSettingsPage(page, 'Nachhaken um …');
  const field = dialog(page).getByLabel('Uhrzeit des Nachhakens');
  await expect(field).toHaveValue('19:30');
  // WebKit löst bei fill() an einem Zeitfeld kein „change“ aus (daran scheitern auch die Tests zur Tageszusammenfassung): Ereignis von Hand
  await field.evaluate((el: HTMLInputElement) => {
    el.value = '20:00';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () => ((await (await request.get('/api/settings')).json()) as { overdueNagTime: string | null }).overdueNagTime).toBe('20:00');
  await dialog(page).getByRole('button', { name: /Zurücksetzen/ }).click();
  await expect.poll(async () => ((await (await request.get('/api/settings')).json()) as { effectiveOverdueNagTime: string }).effectiveOverdueNagTime).toBe('18:00');
});
