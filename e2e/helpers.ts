import { expect, type Page } from '@playwright/test';

/**
 * Aufgaben öffnen, auf Wunsch „Alle“ statt „Meine“ wählen (die Standardwahl ist „Meine“; der Filter gilt auch im Kalender) und eine Ansicht
 * wählen: die Liste, oder Tag, Woche, Monat (der Kalender ist eine Seite unter Aufgaben, der Kalender-Knopf der Wochenleiste öffnet sie)
 */
export async function openTasksView(page: Page, view: 'Liste' | 'Tag' | 'Woche' | 'Monat', all = true): Promise<void> {
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Aufgaben' }).click();
  if (all) await page.getByRole('group', { name: 'Personen' }).getByRole('button', { name: 'Alle', exact: true }).click();
  if (view === 'Liste') return;
  await page.getByRole('button', { name: 'Kalender öffnen' }).click();
  await page.getByRole('radiogroup', { name: 'Ansicht' }).getByRole('radio', { name: view }).click();
}

/** Die Liste in Aufgaben (die frühere Agenda) öffnen, mit „Alle“ statt „Meine“ */
export async function openList(page: Page): Promise<void> {
  await openTasksView(page, 'Liste');
  await expect(page.getByTestId('tasks')).toBeVisible();
}

/** Die Einstellungen über den Avatar öffnen und eine Unterseite wählen (ohne Namen: nur die Übersicht) */
export async function openSettingsPage(page: Page, name?: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Einstellungen', { exact: true }).first()).toBeVisible();
  if (name) await dialog.getByRole('button', { name }).click();
}
