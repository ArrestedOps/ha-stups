import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Läuft nur im Projekt „waechter" (nachgebautes Home Assistant). Gefunden: Stups erkennt Geräte und füllt den Assistenten vor;
// „Testen" (Probelauf) rechnet die Regel auf die Historie der letzten 7 Tage.
const MOCK = 'http://127.0.0.1:18411';
test.describe.configure({ timeout: 90_000, mode: 'serial' });

const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const post = (request: APIRequestContext, path: string, data: unknown) => request.post(`${MOCK}${path}`, { data });

test('Gefunden: Hinweis im Reiter Wächter, Treffer mit Begründung, Wächter aus dem Treffer mit Probelauf anlegen', async ({ page, request }) => {
  // Historie: drei Trocknergänge in den letzten Tagen (120 W, dann 2 W)
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  const points: { state: string; at: string }[] = [{ state: '2', at: at(150) }];
  for (const h of [120, 70, 20]) points.push({ state: '120', at: at(h + 1.5) }, { state: '2', at: at(h) });
  await post(request, '/mock/history', { entityId: 'sensor.trockner_leistung', points });

  // Ein Board, damit der Wächter ein Ziel hat
  const tag = Date.now().toString(36);
  const board = (await (await request.post('/api/boards', { data: { name: `Gefunden ${tag}` } })).json()) as { id: string };

  await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
  await page.goto('/');
  await openBoards(page);
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  const hint = page.getByTestId('home-found');
  await expect(hint).toContainText(/Stups hat \d+ weitere Geräte gefunden|Stups hat 1 weiteres Gerät gefunden/);
  await hint.click();

  // Treffer mit Begründung
  const dialog = page.getByRole('dialog');
  const hit = dialog.getByTestId('found-hit').filter({ hasText: 'Steckdose Trockner Leistung misst die Leistung' });
  await expect(hit).toBeVisible();
  await expect(dialog.getByTestId('found-hit').filter({ hasText: 'Abfallkalender' })).toBeVisible();
  await expect(dialog.getByTestId('found-hit').filter({ hasText: 'Bad Fenster Batterie: Batterie bei 12 %' })).toBeVisible();
  // „Auch ohne Gerät" und alle Vorlagen
  await expect(dialog.getByText('Auch ohne Gerät')).toBeVisible();
  await expect(dialog.getByText('Rauchmelder testen')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Alle Vorlagen ansehen' })).toBeVisible();

  // Einrichten: der Assistent beginnt mit der Entität aus dem Treffer, Schritt 1 zeigt ihren Verlauf
  await hit.getByRole('button', { name: 'Einrichten' }).click();
  await expect(dialog.getByTestId('graph-card')).toContainText('Steckdose Trockner Leistung');
  await expect(dialog.getByTestId('entity-graph')).toBeVisible();
  await dialog.getByRole('button', { name: 'Weiter: Dann' }).click();
  // Board wählen (Schritt 2)
  await dialog.getByTestId('then-editor').getByLabel('Board', { exact: true }).selectOption(board.id);
  await dialog.getByRole('button', { name: 'Weiter: Wer' }).click();
  await dialog.getByRole('button', { name: 'Weiter: Feinschliff' }).click();
  // Schritt 4: der Satz ist schon ausgefüllt
  await expect(dialog.getByTestId('watcher-sentence')).toContainText('Wenn Steckdose Trockner Leistung länger als 3 Min. unter 5 W liegt, bekommt wer zu Hause ist, reihum die Karte „Wäsche aus dem Trockner holen: Steckdose“');
  // Ehrlich beim Selbst-Erledigen: der Leistungssensor kann das Ausräumen nicht belegen
  await expect(dialog.getByRole('switch', { name: 'Automatisch erledigen' })).toBeDisabled();
  await expect(dialog.getByTestId('self-note')).toContainText('weiß nicht, ob jemand das Gerät schon ausgeräumt hat');

  // Testen (Probelauf über 7 Tage): drei Gänge, kein Fehlalarm
  await dialog.getByRole('button', { name: 'Testen', exact: true }).click();
  await expect(page.getByTestId('dry-run-result')).toContainText('3 Auslösungen erkannt, kein Fehlalarm', { timeout: 20_000 });

  // Anlegen
  await dialog.getByRole('button', { name: 'Wächter anlegen' }).click();
  await expect(page.getByText('Wächter gespeichert')).toBeVisible();
  const list = (await (await request.get('/api/watchers')).json()) as { items: { name: string; trigger: { entityId: string; kind: string; value: number } }[] };
  expect(list.items.find((w) => w.name === 'Trockner fertig: Steckdose')?.trigger).toMatchObject({ entityId: 'sensor.trockner_leistung', kind: 'below', value: 5 });

  // Der Trockner steht jetzt im Reiter Wächter (ruhig) und fehlt in „Gefunden"
  await page.keyboard.press('Escape');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await page.getByTestId('home-quiet').getByRole('button', { name: /Wächter ohne offene Aktion/ }).click();
  await expect(page.getByTestId('home-quiet')).toContainText('Trockner fertig');
});

test('Probelauf: ohne Historie ein Hinweis statt eines Diagramms; Wackeln wird genannt', async ({ page, request }) => {
  const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
  // Wackelnder Sensor: alle 7 Minuten kurz unter 5 W
  const wobble: { state: string; at: string }[] = [{ state: '120', at: at(300) }];
  for (let i = 0; i < 5; i += 1) wobble.push({ state: '1', at: at(290 - i * 7) }, { state: '120', at: at(286 - i * 7) });
  await post(request, '/mock/history', { entityId: 'sensor.waschmaschine_leistung', points: wobble });

  const res = await request.post('/api/watchers/dry-run', { data: { trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 3 }, cooldownMin: 0 } });
  expect(res.status()).toBe(200);
  const r = (await res.json()) as { fired: unknown[]; quick: number; sentence: string };
  expect(r.fired).toHaveLength(5);
  expect(r.quick).toBe(4);
  expect(r.sentence).toContain('innerhalb von 10 Minuten');

  const none = await request.post('/api/watchers/dry-run', { data: { trigger: { entityId: 'sensor.bad_batterie', kind: 'below', value: 20, forMin: 0 } } });
  expect(await none.json()).toMatchObject({ noHistory: true, points: [] });

  // Oberfläche: der Probelauf-Knopf ist bei fehlender Historie ehrlich
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Wächter' }).click();
  await page.getByRole('button', { name: 'Alle Wächter verwalten' }).click();
  await page.getByRole('button', { name: 'Wächter aus Vorlagen' }).click();
  await page.getByRole('dialog').getByTestId('found-hit').filter({ hasText: 'Bad Fenster Batterie' }).getByRole('button', { name: 'Einrichten' }).click();
  const d = page.getByRole('dialog');
  for (const next of ['Weiter: Dann', 'Weiter: Wer', 'Weiter: Feinschliff']) await d.getByRole('button', { name: next }).click();
  await d.getByRole('button', { name: 'Testen', exact: true }).click();
  await expect(page.getByTestId('dry-run-result')).toContainText('keine Historie');
});

test('Gefunden: einen Treffer ausblenden, er kommt nicht wieder; unter „Ausgeblendet" lässt er sich zurückholen', async ({ page }) => {
  const open = async () => {
    await page.goto('/');
    await openBoards(page);
    await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Wächter' }).click();
    await page.getByRole('button', { name: 'Alle Wächter verwalten' }).click();
    await page.getByRole('button', { name: 'Wächter aus Vorlagen' }).click();
  };
  const dialog = page.getByRole('dialog');
  const bins = () => dialog.getByTestId('found-hit').filter({ hasText: 'Abfallkalender' });

  await open();
  await expect(bins()).toBeVisible();
  await expect(dialog.getByTestId('found-hidden-toggle')).toHaveCount(0);
  await bins().getByRole('button', { name: /ausblenden/ }).click();
  await expect(page.getByText(/ausgeblendet. Stups schlägt es nicht mehr vor/)).toBeVisible();
  await expect(bins()).toHaveCount(0);
  await expect(dialog.getByTestId('found-hit').filter({ hasText: 'Bad Fenster Batterie' })).toBeVisible(); // die anderen bleiben

  // Auch nach dem Neuladen (gespeichert), nicht nur in dieser Ansicht
  await open();
  await expect(bins()).toHaveCount(0);
  await dialog.getByTestId('found-hidden-toggle').click();
  await expect(dialog.getByTestId('found-hidden')).toHaveCount(1);
  await expect(dialog.getByTestId('found-hidden')).toContainText('Abfallkalender');

  // Zurückholen
  await dialog.getByTestId('found-hidden').getByRole('button', { name: /wieder anzeigen/ }).click();
  await expect(bins()).toBeVisible();
  await expect(dialog.getByTestId('found-hidden-toggle')).toHaveCount(0);
});
