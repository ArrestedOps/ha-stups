import { expect, type Page } from '@playwright/test';

/** Auf den Reiter „Boards“ wechseln: die App startet immer auf „Aufgaben“, auch nach dem Neuladen */
export async function openBoards(page: Page): Promise<void> {
  const nav = page.getByRole('navigation', { name: /^(Ansicht|View)$/ });
  await nav.getByRole('button', { name: 'Boards' }).click();
  await expect(nav.getByRole('button', { name: 'Boards' })).toHaveAttribute('aria-current', 'page');
  // Boards startet bei „Meine"; die Tests brauchen alle Aufgaben (ein Kind hat keine Personen-Chips)
  const all = page.getByRole('group', { name: 'Personen' }).getByRole('button', { name: 'Alle', exact: true });
  if (await all.count()) await all.click();
}

/**
 * Nach der ersten Anmeldung in einem frischen Container zeigt Stups die Einrichtung (46-onboarding.spec.ts testet sie): Wer die App
 * danach braucht, überspringt sie. Ist sie nicht da (Bestand, Mitglied mit Status), passiert nichts.
 */
export async function skipOnboarding(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Einrichtung' });
  const nav = page.getByRole('navigation', { name: 'Ansicht' });
  await expect(dialog.or(nav)).toBeVisible();
  if ((await dialog.count()) === 0) return;
  const skip = dialog.getByRole('button', { name: 'Überspringen' });
  if (await skip.count()) return skip.click(); // Administrator: Willkommen
  // Mitglied: „Handy verbinden", dann „Farbe wählen" (ein Kind hat nur den ersten Schritt)
  await dialog.getByRole('button', { name: 'Später' }).click();
  const done = dialog.getByRole('button', { name: 'Zu den Aufgaben' });
  await expect(done.or(nav)).toBeVisible();
  if (await done.count()) await done.click();
}

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

/**
 * Im Fenster „Neue Aufgabe“ den Termin über die Zeile wählen (Termin-Fenster mit Kalender und Uhrzeit-Rad).
 * `due` ist eine Ortszeit der Seite im Format 2026-11-05T18:30; Minuten werden in Fünferschritten gewählt.
 */
export async function pickDue(page: Page, due: string): Promise<void> {
  const [date, time] = due.split('T') as [string, string];
  const [y, m] = date.split('-').map(Number) as [number, number];
  const [hh, mm] = time.split(':') as [string, string];
  await page.getByRole('button', { name: /^Termin wählen/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Termin' });
  const selected = sheet.locator('[data-day][aria-pressed=true]');
  const [sy, sm] = ((await selected.getAttribute('data-day')) ?? '').split('-').map(Number) as [number, number];
  const months = (y - sy) * 12 + (m - sm);
  if (months !== 0) {
    // Bild auf und ab springt einen Monat (Tastatur im Kalender)
    await selected.focus();
    for (let i = 0; i < Math.abs(months); i += 1) await page.keyboard.press(months > 0 ? 'PageDown' : 'PageUp');
  }
  await sheet.locator(`[data-day="${date}"]`).click();
  await sheet.getByRole('listbox', { name: 'Stunde' }).focus();
  await page.keyboard.type(hh);
  await sheet.getByRole('listbox', { name: 'Minute' }).focus();
  await page.keyboard.type(mm);
  await sheet.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(sheet).toHaveCount(0);
}

/** Das Fenster „Neue Aufgabe“ (der Titel steht im Feld „Was steht an?“) */
export const newTaskSheet = (page: Page) => page.getByRole('dialog', { name: 'Neue Aufgabe' });
