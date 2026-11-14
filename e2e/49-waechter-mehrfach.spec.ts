import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Läuft nur im Projekt „waechter“ (nachgebautes Home Assistant, e2e/server-ha.mjs). Wächter-Liste: mehrere auswählen, gemeinsam bearbeiten
// (nur die angefassten Felder), pausieren und löschen; auf dem Handy und in der Breite des Desktops.
test.describe.configure({ timeout: 120_000, mode: 'serial' });

const nav = (page: Page) => page.getByRole('navigation', { name: 'Ansicht' });

interface Person {
  id: string;
  name: string;
}
interface Item {
  id: string;
  name: string;
  active: boolean;
  card: { boardId: string; title: string };
  assign: { mode: string; personIds: string[] };
}

/** Zwei Batterie-Wächter auf zwei verschiedenen Boards (so steht beim Board „verschieden“) */
async function setup(request: APIRequestContext) {
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const people = (await (await request.get('/api/people')).json()) as Person[];
  const conny = people.find((p) => p.name === 'Conny')!;
  const boards: { id: string; columnId: string }[] = [];
  for (const n of ['Eins', 'Zwei']) {
    const b = (await (await request.post('/api/boards', { data: { name: `Mehrfach ${n} ${tag}` } })).json()) as { id: string };
    const view = (await (await request.get(`/api/boards/${b.id}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
    boards.push({ id: b.id, columnId: view.columns.find((c) => !c.isDone && !c.isPlanned)!.id });
  }
  const names = [`Mehrfach ${tag} A`, `Mehrfach ${tag} B`];
  const entities = ['sensor.iphone_rene_battery_level', 'sensor.bad_batterie'];
  const ids: string[] = [];
  for (const [i, name] of names.entries()) {
    const res = await request.post('/api/watchers', {
      data: {
        name,
        trigger: { entityId: entities[i], kind: 'below', value: 5, forMin: 10 },
        card: { boardId: boards[i]!.id, columnId: boards[i]!.columnId, title: `Wechseln ${tag} ${i}` },
        assign: { mode: 'none' },
      },
    });
    expect(res.status()).toBe(201);
    ids.push(((await res.json()) as { id: string }).id);
  }
  const state = async () => ((await (await request.get('/api/watchers')).json()) as { items: Item[] }).items.filter((w) => ids.includes(w.id));
  const cleanup = async () => {
    for (const id of ids) await request.delete(`/api/watchers/${id}`);
  };
  return { tag, names, ids, boards, conny, state, cleanup };
}

/** Auswählen einschalten und die beiden Wächter anhaken; die Zeilen stehen nach Namen in der Liste */
async function selectBoth(page: Page, names: string[]) {
  await nav(page).getByRole('button', { name: 'Wächter' }).click();
  await page.getByTestId('select-mode').click();
  for (const n of names) await page.getByRole('checkbox', { name: `${n} auswählen` }).check();
  await expect(page.getByTestId('selection-count')).toHaveText('2 ausgewählt');
}

async function bulkFlow(page: Page, request: APIRequestContext, desktop: boolean) {
  const s = await setup(request);
  try {
    await page.goto('/');
    await selectBoth(page, s.names);
    const bar = page.getByTestId('selection-bar');

    // Bearbeiten: Board ist „verschieden“; Name und Board bleiben, wenn nur „Wer“ geändert wird
    await bar.getByTestId('selection-edit').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '2 Wächter bearbeiten' }).or(dialog.getByText('2 Wächter bearbeiten'))).toBeVisible();
    const boardRow = dialog.locator('[data-field="board"]');
    await expect(boardRow.getByTestId('bulk-value')).toHaveText('verschieden');
    // Schwelle gibt es, die Batterien haben dieselbe Einheit
    await expect(dialog.locator('[data-field="threshold"]').getByTestId('bulk-value')).toHaveText('5 %');
    const apply = dialog.getByRole('button', { name: 'Für alle übernehmen' });
    await expect(apply).toBeDisabled();

    await dialog.getByRole('button', { name: 'Wer ändern' }).click();
    await dialog.getByRole('radiogroup', { name: 'Zuweisung' }).getByRole('radio', { name: 'Eine feste Person' }).click();
    // „Eine feste Person“ wählt zuerst den Angemeldeten vor (Rene): abwählen, dafür Conny
    const circle = dialog.getByRole('group', { name: 'Personen' });
    await circle.getByRole('button', { name: 'Rene' }).click();
    await circle.getByRole('button', { name: 'Conny' }).click();
    await expect(dialog.locator('[data-field="assign"]')).toHaveAttribute('data-touched', '');
    await expect(dialog.locator('[data-field="board"]')).not.toHaveAttribute('data-touched', '');
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(page.getByText('2 Wächter geändert')).toBeVisible();

    const after = await s.state();
    expect(after.map((w) => w.assign)).toEqual([expect.objectContaining({ mode: 'fixed', personIds: [s.conny.id] }), expect.objectContaining({ mode: 'fixed', personIds: [s.conny.id] })]);
    expect(after.map((w) => w.name)).toEqual(s.names);
    // nicht angefasst: jeder behält sein Board und den Aufgabentitel
    expect(after.map((w) => w.card.boardId)).toEqual([s.boards[0]!.id, s.boards[1]!.id]);
    expect(after.map((w) => w.card.title)).toEqual([`Wechseln ${s.tag} 0`, `Wechseln ${s.tag} 1`]);
    // die Auswahl bleibt bis „Fertig“
    await expect(page.getByTestId('selection-count')).toHaveText('2 ausgewählt');
    if (desktop) {
      const row = page.locator('[data-testid="watcher-row"]').filter({ hasText: s.names[0]! });
      await expect(row.getByTestId('watcher-who')).toHaveAttribute('title', 'Conny');
    }

    // Pausieren: beide aus, die Leiste bietet danach „Fortsetzen“
    await bar.getByTestId('selection-pause').click();
    await expect(page.getByText('2 Wächter pausiert')).toBeVisible();
    await expect.poll(async () => (await s.state()).map((w) => w.active)).toEqual([false, false]);
    await expect(bar.getByTestId('selection-pause')).toHaveText('Fortsetzen');
    await bar.getByTestId('selection-pause').click();
    await expect.poll(async () => (await s.state()).map((w) => w.active)).toEqual([true, true]);

    // Löschen: erst die Rückfrage, dann sind beide weg
    await bar.getByTestId('selection-delete').click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('2 Wächter löschen?');
    await expect(confirm).toContainText('Das lässt sich nicht rückgängig machen');
    await confirm.getByRole('button', { name: 'Löschen' }).click();
    await expect(page.getByText('2 Wächter gelöscht')).toBeVisible();
    await expect.poll(async () => (await s.state()).length).toBe(0);
    // Gibt es nichts mehr zum Auswählen, endet der Auswahlmodus von selbst
    await expect(page.getByTestId('selection-bar')).toHaveCount(0);
  } finally {
    await s.cleanup();
  }
}

test('Wächter-Liste (Handy): auswählen, gemeinsam bearbeiten, pausieren, löschen', async ({ page, request }) => {
  await bulkFlow(page, request, false);
});

test.describe('Desktop-Breite', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });
  test('Wächter-Tabelle: Kästchen in den Zeilen, gleiche Abläufe', async ({ page, request }) => {
    await bulkFlow(page, request, true);
  });
});

test('Wächter-Liste: ein zwischendurch gelöschter Wächter meldet sich, nichts wird geändert', async ({ page, request }) => {
  const s = await setup(request);
  try {
    await page.goto('/');
    await selectBoth(page, s.names);
    await page.getByTestId('selection-edit').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Sperrzeit ändern' }).click();
    await dialog.getByLabel('Sperrzeit in Minuten').fill('77');
    // Ein anderes Gerät löscht den ersten Wächter
    await request.delete(`/api/watchers/${s.ids[0]}`);
    await dialog.getByRole('button', { name: 'Für alle übernehmen' }).click();
    await expect(page.getByText('Wächter nicht gefunden')).toBeVisible();
    // der zweite blieb unverändert
    expect((await s.state()).map((w) => (w as unknown as { cooldownMin: number }).cooldownMin)).not.toContain(77);
    // die Liste lädt neu: die Auswahl räumt sich auf
    await expect(page.getByTestId('selection-count')).toHaveText('1 ausgewählt');
    // „Fertig“ beendet das Auswählen
    await page.getByTestId('selection-done').click();
    await expect(page.getByTestId('selection-bar')).toHaveCount(0);
  } finally {
    await s.cleanup();
  }
});
