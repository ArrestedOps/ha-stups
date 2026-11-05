import { expect, test, type APIRequestContext } from '@playwright/test';
import { openBoards, openSettingsPage } from './helpers';

// „Warum kommt nichts an?" (Push-Stand) mit dem nachgebauten Home Assistant (Projekt „waechter"): „x / y Geräte erreichbar" je Person,
// Banner mit der Lösung bei einem Gerät, das Home Assistant nicht kennt. Der Mock kennt die Dienste mobile_app_<name>_e2e.
test.describe.configure({ timeout: 90_000, mode: 'serial' });

interface Person {
  id: string;
  name: string;
  notifyServices: string[];
}
const API = { 'x-stups-client': 'e2e' };

async function people(request: APIRequestContext): Promise<Person[]> {
  return (await (await request.get('/api/people')).json()) as Person[];
}
const setServices = (request: APIRequestContext, id: string, notifyServices: string[]) =>
  request.patch(`/api/access/people/${id}`, { data: { notifyServices, quietOff: true }, headers: API });

let original: string[] = [];
let conny: Person;

test.beforeAll(async ({ request }) => {
  conny = (await people(request)).find((p) => p.name === 'Conny')!;
  original = conny.notifyServices;
});
test.afterAll(async ({ request }) => {
  await setServices(request, conny.id, original);
});

test('Push-Stand: ein Gerät, das Home Assistant kennt, zählt 1 / 1; ein unbekanntes 0 / 1 mit Banner und Lösung', async ({ page, request }) => {
  await setServices(request, conny.id, ['mobile_app_conny_e2e']);
  await page.goto('/');
  await openBoards(page);
  await openSettingsPage(page, 'Warum kommt nichts an?');
  const d = page.getByRole('dialog');
  await expect(d.getByTestId('push-ok')).toContainText('Verbindung zu Home Assistant steht');
  const row = d.getByTestId('push-person').filter({ hasText: 'Conny' });
  await expect(row).toContainText('1 / 1');
  await expect(d.getByText('Conny bekommt nichts')).toHaveCount(0);

  // ein Gerät, das es in Home Assistant nicht gibt
  await setServices(request, conny.id, ['mobile_app_connys_iphone']);
  await page.reload();
  await openBoards(page);
  await openSettingsPage(page, 'Warum kommt nichts an?');
  await expect(d.getByTestId('push-person').filter({ hasText: 'Conny' })).toContainText('0 / 1');
  await expect(d.getByTestId('push-person').filter({ hasText: 'Conny' })).toContainText('fehlt in HA');
  await expect(d.getByText('Conny bekommt nichts')).toBeVisible();
  await expect(d.getByText('Gerät neu wählen: „Connys iphone“')).toBeVisible();

  // „Ändern" führt in die Personen
  await d.locator('div').filter({ hasText: 'Conny bekommt nichts' }).getByRole('button', { name: 'Ändern', exact: true }).last().click();
  await expect(page.getByRole('radiogroup', { name: 'Zugriff' })).toBeVisible();
});
