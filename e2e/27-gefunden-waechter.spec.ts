import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBoards, openWatcherCategory } from './helpers';

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
  await expect(dialog.getByTestId('watcher-sentence')).toContainText('Wenn Steckdose Trockner Leistung länger als 3 Min. unter 5 W liegt, bekommt wer zu Hause ist, reihum die Aufgabe „Wäsche aus dem Trockner holen“');
  // Ehrlich beim Selbst-Erledigen: der Leistungssensor kann das Ausräumen nicht belegen
  await expect(dialog.getByRole('switch', { name: 'Automatisch erledigen' })).toBeDisabled();
  await expect(dialog.getByTestId('self-note')).toContainText('weiß nicht, ob jemand das Gerät schon ausgeräumt hat');

  // Testen (Probelauf über 7 Tage): drei Gänge, kein Fehlalarm
  await dialog.getByRole('button', { name: 'Testen', exact: true }).click();
  await expect(page.getByTestId('dry-run-result')).toContainText('3 Auslösungen erkannt, kein Fehlalarm', { timeout: 20_000 });

  // Anlegen
  await dialog.getByRole('button', { name: 'Wächter anlegen' }).click();
  await expect(page.getByText('Wächter gespeichert')).toBeVisible();
  const list = (await (await request.get('/api/watchers')).json()) as { items: { name: string; category: string | null; trigger: { entityId: string; kind: string; value: number } }[] };
  expect(list.items.find((w) => w.name === 'Trockner fertig')?.trigger).toMatchObject({ entityId: 'sensor.trockner_leistung', kind: 'below', value: 5 });
  // die Kategorie der Vorlage ist vorbelegt
  expect(list.items.find((w) => w.name === 'Trockner fertig')?.category).toBe('Haushaltsgeräte');

  // Der Trockner steht jetzt im Reiter Wächter (ruhig) und fehlt in „Gefunden"
  await page.keyboard.press('Escape');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await openWatcherCategory(page);
  await expect(page.getByTestId('watcher-page')).toContainText('Trockner fertig');
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

// ---------- Viele Treffer: nach Vorlage gruppiert, die ersten fünf, „Alle N anzeigen", Suche ----------

type Hit = { templateId: string; entityId: string; reason: string };
const suggestions = async (request: APIRequestContext) => ((await (await request.get('/api/watchers/suggestions')).json()) as { items: Hit[] }).items;

async function openFound(page: Page) {
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Wächter' }).click();
  await page.getByTestId('home-found').click();
  await expect(page.getByRole('dialog', { name: 'Gefunden' })).toBeVisible();
}

test('Gefunden: alle Treffer kommen vom Server; der Banner nennt die Gesamtzahl', async ({ page, request }) => {
  const items = await suggestions(request);
  const batteries = items.filter((s) => s.templateId === 'battery');
  expect(batteries.length).toBeGreaterThanOrEqual(14); // nicht mehr nur fünf
  // schwächste zuerst: „Bad Fenster Batterie" (12 %) und „iPhone Rene" (14 %) vor den 14 Fenstersensoren
  expect(batteries[0]!.reason).toBe('Bad Fenster Batterie: Batterie bei 12 %');
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name: 'Wächter' }).click();
  await expect(page.getByTestId('home-found')).toContainText(`Stups hat ${items.length} weitere Geräte gefunden`);
});

test('Gefunden: Gruppen mit Zähler, große Gruppe zeigt fünf und klappt auf, kleine steht offen', async ({ page, request }) => {
  const items = await suggestions(request);
  const batteries = items.filter((s) => s.templateId === 'battery');
  await openFound(page);
  const dialog = page.getByRole('dialog');

  // ein Kopf je Vorlage; die Summe der Zähler ist die Gesamtzahl
  const groups = dialog.getByTestId('found-group');
  const counts = await groups.evaluateAll((els) => els.map((e) => Number(e.querySelector('h2 + span')?.textContent)));
  expect(counts.reduce((a, b) => a + b, 0)).toBe(items.length);
  const battery = dialog.locator('[data-testid="found-group"][data-group="battery"]');
  await expect(battery.getByRole('heading', { name: 'Batterie schwach' })).toBeVisible();
  await expect(battery.locator('h2 + span')).toHaveText(String(batteries.length));

  // große Gruppe: die ersten fünf (die schwächsten), darunter „Alle N anzeigen"
  await expect(battery.getByTestId('found-hit')).toHaveCount(5);
  await expect(battery.getByTestId('found-hit').first()).toContainText('Bad Fenster Batterie: Batterie bei 12 %');
  const more = battery.getByTestId('found-more');
  await expect(more).toHaveText(`Alle ${batteries.length} anzeigen`);
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(battery.getByTestId('found-hit')).toHaveCount(batteries.length);
  await expect(more).toHaveText('Weniger anzeigen');
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await more.click();
  await expect(battery.getByTestId('found-hit')).toHaveCount(5);

  // kleine Gruppen stehen offen, ohne „Alle anzeigen"
  const trockner = dialog.locator('[data-testid="found-group"][data-group="dryer"]');
  if (await trockner.count()) {
    await expect(trockner.getByTestId('found-hit')).toHaveCount(1);
    await expect(trockner.getByTestId('found-more')).toHaveCount(0);
  }
  await expect(dialog.locator('[data-testid="found-group"][data-group="bins"]').getByTestId('found-more')).toHaveCount(0);
});

test('Gefunden: die Suche filtert nach Name, Entität und Grund, zeigt dann alle Treffer und lässt sich leeren', async ({ page }) => {
  await openFound(page);
  const dialog = page.getByRole('dialog');
  const search = dialog.getByRole('searchbox', { name: 'Gefundene Geräte durchsuchen' });
  await expect(search).toBeVisible();

  // Name: nur der eine Fenstersensor, auch wenn er nicht unter den ersten fünf stand
  await search.fill('gartenhaus');
  await expect(dialog.getByTestId('found-hit')).toHaveCount(1);
  await expect(dialog.getByTestId('found-hit')).toContainText('Gartenhaus Fenstersensor Batterie: Batterie bei 83 %');
  await expect(dialog.getByTestId('found-group')).toHaveCount(1);

  // Entität
  await search.fill('sensor.keller_fenstersensor');
  await expect(dialog.getByTestId('found-hit')).toHaveCount(1);
  await expect(dialog.getByTestId('found-hit')).toContainText('sensor.keller_fenstersensor_batterie');

  // Grund: alle Fenstersensoren (mehr als fünf), mit Filter ohne Abschneiden und ohne „Alle anzeigen"
  await search.fill('fenstersensor batterie bei');
  await expect(dialog.getByTestId('found-hit')).toHaveCount(14);
  await expect(dialog.getByTestId('found-more')).toHaveCount(0);

  // nichts gefunden: Hinweis statt leerer Seite
  await search.fill('xyzqwv');
  await expect(dialog.getByTestId('found-hit')).toHaveCount(0);
  await expect(dialog.getByTestId('found-none')).toContainText('Nichts gefunden für „xyzqwv“');

  // Leeren: wieder die Gruppen mit den ersten fünf
  await dialog.getByRole('button', { name: 'Suche leeren' }).click();
  await expect(search).toHaveValue('');
  await expect(dialog.locator('[data-testid="found-group"][data-group="battery"]').getByTestId('found-hit')).toHaveCount(5);
});

test('Gefunden: ein Treffer aus der Suche lässt sich einrichten (Tastatur: Suchfeld, Tab, Enter), ein weiterer Treffer ausblenden', async ({ page, request }) => {
  await openFound(page);
  const dialog = page.getByRole('dialog');
  const search = dialog.getByRole('searchbox', { name: 'Gefundene Geräte durchsuchen' });
  await search.fill('garage fenstersensor');
  const hit = dialog.getByTestId('found-hit');
  await expect(hit).toHaveCount(1);

  // Ausblenden nimmt genau diesen Treffer heraus; die Suche bleibt stehen
  await hit.getByRole('button', { name: /Garage Fenstersensor Batterie ausblenden/ }).click();
  await expect(page.getByText(/„Garage Fenstersensor Batterie“ ausgeblendet/)).toBeVisible();
  await expect(dialog.getByTestId('found-hit')).toHaveCount(0);
  await expect(search).toHaveValue('garage fenstersensor');
  expect((await suggestions(request)).some((s) => s.entityId === 'sensor.garage_fenstersensor_batterie')).toBe(false);

  // wieder einblenden, damit andere Tests den Treffer wieder sehen
  await search.fill('');
  await dialog.getByTestId('found-hidden-toggle').click();
  await dialog.getByTestId('found-hidden').filter({ hasText: 'Garage Fenstersensor' }).getByRole('button', { name: /wieder anzeigen/ }).click();
  await search.fill('keller fenstersensor');
  await expect(hit).toHaveCount(1);

  // Tastatur: aus dem Suchfeld mit Tab auf „Einrichten", Enter öffnet den Assistenten mit diesem Gerät
  await search.press('Tab'); // zuerst „Suche leeren"
  await page.keyboard.press('Tab');
  await expect(hit.getByRole('button', { name: 'Einrichten' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.getByTestId('graph-card')).toContainText('Keller Fenstersensor Batterie');
});

test('Gefunden: drei Batterien auswählen, gemeinsam einrichten (drei Wächter); zwei andere gemeinsam ausblenden', async ({ page, request }) => {
  const tag = Date.now().toString(36);
  const board = (await (await request.post('/api/boards', { data: { name: `Gemeinsam ${tag}` } })).json()) as { id: string };
  const NAMES = ['Bad Fenster Batterie', 'iPhone Rene Battery Level', 'Küche Fenstersensor Batterie'];
  const ENTITIES = ['sensor.bad_batterie', 'sensor.iphone_rene_battery_level', 'sensor.kueche_fenstersensor_batterie'];
  const mine = async () => ((await (await request.get('/api/watchers')).json()) as { items: { id: string; name: string; trigger: { entityId: string }; done: { entityId: string } | null; card: { boardId: string } }[] }).items.filter((w) => ENTITIES.includes(w.trigger.entityId));
  const found = async (page2: Page) => {
    await nav(page2).getByRole('button', { name: 'Wächter' }).click();
    await page2.getByTestId('home-found').click();
    const dialog = page2.getByRole('dialog');
    await expect(dialog.getByTestId('found-group').first()).toBeVisible();
    return dialog;
  };
  try {
    await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
    await page.goto('/');
    await openBoards(page);
    let dialog = await found(page);

    // Auswählen: Kästchen an den Treffern, eine Art nach der anderen
    await dialog.getByTestId('select-mode').click();
    for (const n of NAMES) await dialog.getByRole('checkbox', { name: `${n} auswählen`, exact: true }).check();
    await expect(dialog.getByTestId('selection-count')).toHaveText('3 ausgewählt');
    // Treffer einer anderen Vorlage lassen sich dazu nicht wählen
    await expect(dialog.getByRole('checkbox', { name: 'Abfallkalender auswählen' })).toBeDisabled();
    await expect(dialog.getByTestId('found-lock-hint')).toBeVisible();

    // Einrichten: derselbe Assistent, Schritt 1 zeigt die drei Geräte mit ihrem Wert
    await dialog.getByTestId('selection-setup').click();
    await expect(dialog.getByTestId('devices-title')).toContainText('3 Geräte');
    await expect(dialog.getByTestId('device-row')).toHaveCount(3);
    await expect(dialog.getByTestId('device-row').filter({ hasText: 'Bad Fenster Batterie: Batterie bei 12 %' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Weiter: Dann' }).click();
    await dialog.getByTestId('then-editor').getByLabel('Board', { exact: true }).selectOption(board.id);
    await dialog.getByRole('button', { name: 'Weiter: Wer' }).click();
    await dialog.getByRole('button', { name: 'Weiter: Feinschliff' }).click();
    await dialog.getByRole('button', { name: '3 Wächter anlegen' }).click();
    await expect(page.getByText('3 Wächter angelegt')).toBeVisible();

    // drei Wächter, je mit eigener Entität (auch beim Erledigen), gleichem Board und gleichem Namen
    const created = await mine();
    expect(created.map((w) => w.trigger.entityId).sort()).toEqual([...ENTITIES].sort());
    expect(created.map((w) => w.done?.entityId).sort()).toEqual([...ENTITIES].sort());
    expect(new Set(created.map((w) => w.name))).toEqual(new Set(['Batterie schwach']));
    expect(new Set(created.map((w) => w.card.boardId))).toEqual(new Set([board.id]));
    // am Handy stehen die Kategorien als eigene Seiten: die neuen Wächter landen unter „Batterien“
    await expect(page.getByTestId('watcher-categories')).toContainText('Batterien');
    for (const w of created) await request.delete(`/api/watchers/${w.id}`);

    // Zweiter Durchlauf: zwei Treffer gemeinsam ausblenden, sie stehen unter „Ausgeblendet“
    await page.keyboard.press('Escape');
    dialog = await found(page);
    await dialog.getByTestId('select-mode').click();
    for (const n of [NAMES[0]!, NAMES[1]!]) await dialog.getByRole('checkbox', { name: `${n} auswählen`, exact: true }).check();
    await dialog.getByTestId('selection-hide').click();
    await expect(page.getByText('2 Treffer ausgeblendet')).toBeVisible();
    await dialog.getByTestId('selection-done').click();
    await dialog.getByTestId('found-hidden-toggle').click();
    await expect(dialog.getByTestId('found-hidden')).toHaveCount(2);
    await expect(dialog.getByTestId('found-hidden').filter({ hasText: 'Bad Fenster Batterie' })).toBeVisible();
  } finally {
    for (const w of await mine()) await request.delete(`/api/watchers/${w.id}`);
    for (const entityId of ENTITIES) await request.post('/api/watchers/suggestions/unhide', { data: { templateId: 'battery', entityId } });
  }
});

test('Gefunden: neue Vorlagen erkennen Fenster, Luftfeuchte und Filter', async ({ page }) => {
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await page.getByTestId('home-found').click();
  const dialog = page.getByRole('dialog');
  const group = (title: string) => dialog.getByTestId('found-group').filter({ has: page.getByRole('heading', { name: title }) });
  await expect(group('Fenster lange offen')).toContainText('Fenster Bad meldet, ob es offen ist');
  await expect(group('Lüften (Feuchte)')).toContainText('Bad Luftfeuchte: Luftfeuchte bei 58 %');
  await expect(group('Filter verbraucht')).toContainText('Luftreiniger Filter: Filter bei 64 %');
  // Der Assistent beginnt mit dem Entwurf der Vorlage: Fenster 30 Minuten offen, erledigt sich, wenn es wieder zu ist
  await group('Fenster lange offen').getByRole('button', { name: 'Einrichten' }).click();
  await expect(dialog.getByTestId('graph-card')).toContainText('Fenster Bad');
  await dialog.getByRole('button', { name: 'Weiter: Dann' }).click();
  await dialog.getByRole('button', { name: 'Weiter: Wer' }).click();
  await dialog.getByRole('button', { name: 'Weiter: Feinschliff' }).click();
  await expect(dialog.getByTestId('watcher-sentence')).toContainText('Wenn Fenster Bad länger als 30 Min. auf on steht');
  await expect(dialog.getByRole('switch', { name: 'Automatisch erledigen' })).toBeEnabled();
});
