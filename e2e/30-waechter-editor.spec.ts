import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openBoards } from './helpers';

// Läuft nur im Projekt „waechter" (nachgebautes Home Assistant). Wächter-Editor: Assistent in vier Schritten (mit „Reihum" vorausgewählt),
// Ablauf beim Bearbeiten mit Verlauf der Entität, Mitglied nur lesend.
const MOCK = 'http://127.0.0.1:18411';
test.describe.configure({ timeout: 90_000, mode: 'serial' });

const connyHeaders = { 'x-remote-user-id': 'ha-conny-e2e', 'x-remote-user-name': 'conny', 'x-remote-user-display-name': 'Conny' };
const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });
const post = (request: APIRequestContext, path: string, data: unknown) => request.post(`${MOCK}${path}`, { data });

/** Zwei Waschgänge in den letzten drei Stunden, dazwischen unter 5 W; jetzt 412 W */
async function washerHistory(request: APIRequestContext) {
  const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
  const pts: [number, number][] = [[175, 2], [165, 900], [150, 1800], [140, 700], [130, 60], [120, 2], [100, 2], [90, 900], [75, 1700], [60, 800], [45, 1300], [30, 500], [15, 300], [2, 412]];
  await post(request, '/mock/history', { entityId: 'sensor.waschmaschine_leistung', points: pts.map(([m, v]) => ({ state: String(v), at: at(m) })) });
  await post(request, '/mock/state', { entityId: 'sensor.waschmaschine_leistung', state: '412' });
}

async function setup(request: APIRequestContext) {
  const tag = Date.now().toString(36);
  const board = (await (await request.post('/api/boards', { data: { name: `Editor ${tag}` } })).json()) as { id: string };
  const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  const columnId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  return { tag, boardId: board.id, columnId };
}

test('Assistent in vier Schritten: Verlauf mit Auslösepunkt, „Reihum“ ist vorausgewählt und wird so gespeichert', async ({ page, request }) => {
  const s = await setup(request);
  await washerHistory(request);
  const title = `Wäsche ausräumen ${s.tag}`;
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), s.boardId);
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await page.getByRole('button', { name: 'Neuer Wächter', exact: true }).click(); // der „+“ im Reiter Wächter
  const d = page.getByRole('dialog');

  // Schritt 1: Entität wählen (ohne Vorlage), Verlauf der letzten 3 Stunden mit Schwelle und Auslösepunkt
  await expect(d.getByTestId('wizard-question')).toContainText('Woran merkt Stups');
  await expect(d.getByRole('navigation', { name: 'Schritt 1 von 4' })).toBeVisible();
  await d.getByRole('button', { name: 'Entität wählen' }).click();
  await d.getByLabel('Entität suchen').fill('waschmaschine leistung');
  await d.getByRole('button', { name: /Waschmaschine Leistung/ }).first().click();
  await expect(d.getByTestId('graph-card')).toContainText('Waschmaschine Leistung');
  await expect(d.getByTestId('graph-card')).toContainText('412 W');
  await d.getByLabel('Schwellwert').fill('5');
  await expect(d.getByTestId('graph-threshold')).toBeAttached();
  await expect(d.getByTestId('graph-mark')).toHaveCount(1); // 3 Minuten unter 5 W: nur zwischen den Gängen (am Anfang war es schon so)
  await expect(d.getByTestId('graph-fired')).toContainText('ausgelöst');
  await expect(d.getByRole('img', { name: /Verlauf der letzten 3 Stunden/ })).toBeVisible();
  // ohne Schwellwert kein Weiter
  await d.getByLabel('Schwellwert').fill('');
  await d.getByRole('button', { name: 'Weiter: Dann' }).click();
  await expect(page.getByText('Gib den Schwellwert als Zahl an.')).toBeVisible();
  await expect(d.getByTestId('wizard-question')).toContainText('Woran merkt Stups');
  await d.getByLabel('Schwellwert').fill('5');
  await d.getByRole('button', { name: 'Weiter: Dann' }).click();

  // Schritt 2: Titel, Board, Fälligkeit
  await expect(d.getByTestId('wizard-question')).toHaveText('Welche Aufgabe soll dann entstehen?');
  await d.getByLabel('Titel der Karte').fill(title);
  await d.getByLabel('Board', { exact: true }).selectOption(s.boardId);
  await d.getByRole('group', { name: 'Fälligkeit' }).getByRole('button', { name: 'in 1 Std.' }).click();
  await expect(d.getByTestId('card-preview')).toContainText(title);
  await expect(d.getByTestId('card-preview')).toContainText('in 60 Min.');
  await d.getByRole('button', { name: 'Weiter: Wer' }).click();

  // Schritt 3: alle sieben Arten, „Reihum“ vorausgewählt, die Reihenfolge mit Fotos oder Initialen
  await expect(d.getByRole('radio')).toHaveCount(7);
  await expect(d.getByRole('radio', { name: /Abwechselnd, egal wer da ist/ })).toHaveAttribute('aria-checked', 'true');
  await expect(d.getByTestId('fair-hint')).toContainText('reihum, nicht nach Aufwand gewichtet');
  await expect(d.getByTestId('assign-order')).toBeVisible();
  await expect(d.getByTestId('assign-order').locator('[data-next=true]')).toHaveCount(1);
  await d.getByRole('button', { name: 'Weiter: Feinschliff' }).click();

  // Schritt 4: Zusammenfassung, anlegen
  await expect(d.getByTestId('watcher-sentence')).toContainText(`bekommt reihum jemand die Karte „${title}“ (fällig in 60 Min.)`);
  await d.getByRole('button', { name: 'Wächter anlegen' }).click();
  await expect(page.getByText('Wächter gespeichert')).toBeVisible();

  const list = (await (await request.get('/api/watchers')).json()) as { items: { name: string; card: { title: string; due: unknown }; assign: { mode: string }; trigger: { value: number } }[] };
  const saved = list.items.find((w) => w.card.title === title)!;
  expect(saved.assign.mode).toBe('rotation');
  expect(saved.trigger.value).toBe(5);
  expect(saved.card.due).toEqual({ kind: 'in', minutes: 60 });
});

test('Bearbeiten als Ablauf: vier Karten, Verlauf, „Ändern“ klappt die Einstellungen auf, Feinschliff als Chips', async ({ page, request }) => {
  const s = await setup(request);
  await washerHistory(request);
  const name = `Ablauf ${s.tag}`;
  const created = await request.post('/api/watchers', {
    data: {
      name,
      trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 3 },
      card: { boardId: s.boardId, columnId: s.columnId, title: `Ausräumen ${s.tag}`, due: { kind: 'in', minutes: 30 } },
      assign: { mode: 'rotation_present', personIds: [] },
    },
  });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;

  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await page.getByRole('button', { name: `Wächter ${name} öffnen` }).first().click();
  const d = page.getByRole('dialog');
  const flow = d.getByTestId('watcher-flow');
  for (const tag of ['WENN', 'DANN KARTE', 'AN WEN', 'ERLEDIGT SICH SELBST']) await expect(flow).toContainText(tag);
  await expect(d.getByTestId('now-badge')).toContainText('412 W');
  await expect(d.getByTestId('when-sum')).toHaveText('Waschmaschine Leistung liegt 3 Min. unter 5 W');
  await expect(d.getByTestId('graph-threshold')).toBeAttached();
  await expect(d.getByTestId('graph-mark')).toHaveCount(1);
  await expect(d.getByTestId('assign-order')).toBeVisible();
  await expect(d.getByTestId('done-sum')).toContainText('Die Karte erledigst du selbst.');

  // WENN ändern: Schwelle und Wartezeit
  await flow.getByRole('button', { name: 'Ändern' }).first().click();
  await expect(d.getByTestId('when-editor')).toBeVisible();
  await d.getByLabel('Schwellwert').fill('10');
  await d.getByRole('group', { name: 'Wartezeit in Minuten' }).getByRole('button', { name: '5 Min.' }).click();
  await expect(d.getByTestId('when-sum')).toHaveText('Waschmaschine Leistung liegt 5 Min. unter 10 W');
  await flow.getByRole('button', { name: 'Fertig' }).click();

  // Feinschliff: Sperrzeit
  await d.getByRole('group', { name: 'Feinschliff' }).getByRole('button', { name: 'Sperrzeit 10 Min.' }).click();
  await d.getByLabel('Sperrzeit in Minuten').fill('15');
  await expect(d.getByRole('button', { name: 'Sperrzeit 15 Min.' })).toBeVisible();
  // „Keine zweite Karte“ ist ein Schalter unter den Chips
  await d.getByRole('button', { name: 'Keine zweite Karte' }).click();
  await expect(d.getByRole('button', { name: 'Zweite Karte erlaubt' })).toBeVisible();

  // Erledigt sich selbst: einschalten, Entität wählen
  await d.getByRole('switch', { name: 'Automatisch erledigen' }).click();
  await d.getByRole('button', { name: 'Wählen' }).click();
  await d.getByLabel('Entität suchen').fill('waschmaschine tür');
  await d.getByRole('button', { name: /Waschmaschine Tür/ }).first().click();
  await d.getByLabel('Zustand zum Erledigen').fill('on');
  await expect(d.getByTestId('done-sum')).toContainText('Waschmaschine Tür wechselt zu on');

  await d.getByRole('button', { name: 'Speichern', exact: true }).last().click();
  await expect(page.getByText('Wächter gespeichert')).toBeVisible();
  const w = (await (await request.get('/api/watchers')).json()) as { items: { id: string; trigger: { value: number; forMin: number }; cooldownMin: number; dedupe: boolean; done: { entityId: string; to: string } | null }[] };
  const saved = w.items.find((x) => x.id === id)!;
  expect(saved.trigger).toMatchObject({ value: 10, forMin: 5 });
  expect(saved).toMatchObject({ cooldownMin: 15, dedupe: false, done: { entityId: 'binary_sensor.waschmaschine_tuer', to: 'on' } });
});

test('Mitglied: Ablauf und Verlauf nur lesend; Verlauf nur für Entitäten eines Wächters', async ({ browser, baseURL, request }) => {
  const s = await setup(request);
  await washerHistory(request);
  const name = `Lesend ${s.tag}`;
  expect(
    (
      await request.post('/api/watchers', {
        data: {
          name,
          trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 3 },
          card: { boardId: s.boardId, columnId: s.columnId, title: `Lesen ${s.tag}`, due: { kind: 'none' } },
          assign: { mode: 'rotation', personIds: [] },
        },
      })
    ).status(),
  ).toBe(201);

  const ctx = await browser.newContext({ baseURL: String(baseURL), extraHTTPHeaders: connyHeaders });
  const conny = await ctx.newPage();
  try {
    await conny.goto('/');
    await nav(conny).getByRole('button', { name: 'Wächter' }).click();
    await conny.getByRole('button', { name: `Wächter ${name} öffnen` }).first().click();
    const d = conny.getByRole('dialog');
    await expect(d.getByTestId('watcher-readonly')).toBeVisible();
    await expect(d.getByTestId('graph-mark').first()).toBeVisible(); // der Verlauf ist lesbar
    await expect(d.getByRole('button', { name: 'Ändern' })).toHaveCount(0);
    await expect(d.getByRole('button', { name: /Speichern|Testen/ })).toHaveCount(0);
    await expect(d.getByTestId('assign-order')).toBeVisible();
    // Server: Mitglieder fragen nur Entitäten ab, die ein Wächter beobachtet
    expect((await ctx.request.get('/api/watchers/history?entityId=sensor.waschmaschine_leistung')).status()).toBe(200);
    expect((await ctx.request.get('/api/watchers/history?entityId=sensor.nie_beobachtet_e2e')).status()).toBe(403);
  } finally {
    await ctx.close();
  }
});

test('ohne Verlauf: ein Hinweis statt des Diagramms, der Assistent bleibt bedienbar', async ({ page, request }) => {
  const s = await setup(request);
  await post(request, '/mock/history', { entityId: 'sensor.bad_batterie', points: [] });
  await page.addInitScript((id) => localStorage.setItem('stups.board', id), s.boardId);
  await page.goto('/');
  await openBoards(page);
  await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Wächter' }).click();
  await page.getByRole('button', { name: 'Wächter hinzufügen' }).first().click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Entität wählen' }).click();
  await d.getByLabel('Entität suchen').fill('bad fenster');
  await d.getByRole('button', { name: /Bad Fenster Batterie/ }).first().click();
  await expect(d.getByTestId('graph-empty')).toContainText('keinen Verlauf');
  await d.getByLabel('Schwellwert').fill('20');
  await d.getByRole('button', { name: 'Weiter: Dann' }).click();
  await expect(d.getByTestId('wizard-question')).toHaveText('Welche Aufgabe soll dann entstehen?');
});
