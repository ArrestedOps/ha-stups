import { expect, type Page } from '@playwright/test';

/** Die Liste im Kalender (die frühere Agenda) öffnen */
export async function openList(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Kalender' }).click();
  await page.getByRole('group', { name: 'Ansicht' }).getByRole('button', { name: 'Liste' }).click();
  await expect(page.getByTestId('agenda')).toBeVisible();
}

/** Die Einstellungen über den Avatar öffnen und eine Unterseite wählen (ohne Namen: nur die Übersicht) */
export async function openSettingsPage(page: Page, name?: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Einstellungen', { exact: true }).first()).toBeVisible();
  if (name) await dialog.getByRole('button', { name }).click();
}
