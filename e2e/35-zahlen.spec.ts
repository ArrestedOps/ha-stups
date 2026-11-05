import { openSettingsPage } from './helpers';
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

// Aufgaben: die drei Zahlen sind Knöpfe und öffnen je ein Blatt (Heute fällig, Überfällig, Heute erledigt).
// Die Tests laufen mit eigenen Personen („Ich“ und ein Kind), damit die Zahlen und „Alle auf morgen“ keine Karten anderer Tests treffen.
test.describe.configure({ mode: 'serial' });

const TZ = 'Europe/Berlin';
const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const tag = unique();
const ME = `Zahl${tag}`;
const KID = `Zkind${tag}`;
const headersOf = (id: string, name: string) => ({ 'x-remote-user-id': id, 'x-remote-user-name': name, 'x-remote-user-display-name': name, 'x-stups-language': 'de' });
const meHeaders = headersOf(`ha-zahl-${tag}`, ME);
const kidHeaders = headersOf(`ha-zkind-${tag}`, KID);

let meId = '';
let kidId = '';
let boardId = '';
let openId = '';
let plannedId = '';
const MIN = 60_000;
const H = 60 * MIN;

const dayKey = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));
const clock = (iso: string) => new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const addDay = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function mk(request: APIRequestContext, title: string, extra: Record<string, unknown>) {
  const res = await request.post(`/api/boards/${boardId}/cards`, { data: { title, columnId: openId, ...extra } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string; dueAt: string | null };
}
const get = async (request: APIRequestContext, id: string) => (await (await request.get(`/api/cards/${id}`)).json()) as { dueAt: string | null; completedAt: string | null; columnId: string };

test.beforeAll(async ({ request }) => {
  const me = (await (await request.post('/api/access/people', { data: { name: ME, haUserId: `ha-zahl-${tag}` } })).json()) as { id: string };
  meId = me.id;
  const kid = (await (await request.post('/api/access/people', { data: { name: KID, haUserId: `ha-zkind-${tag}` } })).json()) as { id: string };
  kidId = kid.id;
  const set = await request.patch(`/api/access/people/${kidId}`, { data: { isChild: true, childScope: 'assigned', confirmDefault: false, confirmers: [], quietOff: true } });
  expect(set.status(), await set.text()).toBe(200);
  const board = (await (await request.post('/api/boards', { data: { name: `Zahlen ${tag}` } })).json()) as { id: string };
  boardId = board.id;
  const view = (await (await request.get(`/api/boards/${boardId}`)).json()) as { columns: { id: string; isDone: boolean; isPlanned: boolean }[] };
  openId = view.columns.find((c) => !c.isDone && !c.isPlanned)!.id;
  plannedId = view.columns.find((c) => c.isPlanned)!.id;
});

test.afterAll(async ({ request }) => {
  if (boardId) await request.delete(`/api/boards/${boardId}`);
  for (const id of [meId, kidId]) if (id) await request.delete(`/api/access/people/${id}`);
});

async function asPerson(browser: Browser, baseURL: string | undefined, headers: Record<string, string>, scheme: 'dark' | 'light') {
  const ctx = await browser.newContext({ baseURL, locale: 'de-DE', timezoneId: TZ, colorScheme: scheme, viewport: { width: 390, height: 780 }, extraHTTPHeaders: headers });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByTestId('stat-today')).toBeVisible();
  return { page, request: ctx.request, close: () => ctx.close() };
}
const num = async (page: Page, id: string) => Number(((await page.getByTestId(`stat-${id}`).getAttribute('aria-label')) ?? '').split(', ').at(-1));
const sheet = (page: Page) => page.getByTestId('stats-sheet');

test('die drei Zahlen sind Knöpfe mit Namen und 44 px Höhe; jede öffnet ihr Blatt, „Schließen“ schließt', async ({ browser, baseURL }, info) => {
  const p = await asPerson(browser, baseURL, meHeaders, info.project.name === 'hell' ? 'light' : 'dark');
  try {
    const bar = p.page.getByRole('group', { name: 'Deine Zahlen' });
    await expect(bar.getByRole('button')).toHaveCount(3);
    for (const [id, name, title] of [['today', 'Heute fällig', 'Heute fällig'], ['overdue', 'Überfällig', 'Überfällig'], ['done', 'Erledigt heute', 'Heute erledigt']] as const) {
      const btn = p.page.getByTestId(`stat-${id}`);
      await expect(btn).toHaveAttribute('aria-label', new RegExp(`^${name}, \\d+$`));
      expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await btn.click();
      await expect(p.page.getByRole('dialog', { name: title })).toBeVisible();
      await expect(sheet(p.page)).toHaveAttribute('data-kind', id);
      await p.page.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click();
      await expect(sheet(p.page)).toHaveCount(0);
    }
  } finally {
    await p.close();
  }
});

test('Heute fällig: Zusammenfassung, Abhaken im Blatt, Tipp auf die Karte öffnet sie', async ({ browser, baseURL, request }, info) => {
  // kurz vor Mitternacht gibt es kein „später heute“
  test.skip(dayKey(Date.now() + 45 * MIN) !== dayKey(Date.now()), 'kurz vor Mitternacht');
  const a = await mk(request, `Abhaken ${tag}`, { assigneeIds: [meId], dueAt: new Date(Date.now() + 20 * MIN).toISOString() });
  await mk(request, `Öffnen ${tag}`, { assigneeIds: [meId], dueAt: new Date(Date.now() + 40 * MIN).toISOString() });
  const p = await asPerson(browser, baseURL, meHeaders, info.project.name === 'hell' ? 'light' : 'dark');
  try {
    await p.page.getByTestId('stat-today').click();
    const s = sheet(p.page);
    await expect(s.getByText(`Abhaken ${tag}`)).toBeVisible();
    await expect(s.getByRole('heading', { name: 'Bis heute Abend' })).toBeVisible();
    await expect(s.getByText('0 davon schon erledigt, 2 offen.')).toBeVisible();
    // nach Uhrzeit
    const ys = async (t: string) => (await s.getByText(t, { exact: true }).boundingBox())!.y;
    expect(await ys(`Abhaken ${tag}`)).toBeLessThan(await ys(`Öffnen ${tag}`));

    await s.getByRole('checkbox', { name: `„Abhaken ${tag}“ erledigen` }).click();
    await expect(s.getByRole('heading', { name: 'Schon erledigt' })).toBeVisible();
    await expect(s.getByText('1 davon schon erledigt, 1 offen.')).toBeVisible();
    await expect(s.getByText(/^um \d\d:\d\d$/)).toBeVisible();
    expect((await get(p.request, a.id)).completedAt).not.toBeNull();

    await s.getByText(`Öffnen ${tag}`, { exact: true }).click();
    await expect(sheet(p.page)).toHaveCount(0);
    await expect(p.page.getByRole('dialog').getByLabel('Titel')).toHaveValue(`Öffnen ${tag}`);
  } finally {
    await p.close();
  }
});

test('Überfällig: „seit …“, die Zahl stimmt mit der Leiste, „Morgen“ behält die Uhrzeit, Rückgängig stellt Termin und Spalte wieder her', async ({ browser, baseURL, request }, info) => {
  // Mittags (Berliner Zeit) vor zwei Tagen und gestern: unabhängig von der Uhrzeit, zu der der Test läuft (um Mitternacht lägen 26 Stunden sonst vor zwei Tagen)
  const noon = (daysAgo: number) => {
    const [y, m, d] = addDay(dayKey(Date.now()), -daysAgo).split('-').map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!, 10)).toISOString();
  };
  const old = noon(2);
  const one = noon(1);
  const a = await mk(request, `Morgen ${tag}`, { assigneeIds: [meId], dueAt: old });
  await mk(request, `Gestern ${tag}`, { assigneeIds: [meId], dueAt: one });
  const p = await asPerson(browser, baseURL, meHeaders, info.project.name === 'hell' ? 'light' : 'dark');
  try {
    const n = await num(p.page, 'overdue');
    expect(n).toBeGreaterThanOrEqual(2);
    await p.page.getByTestId('stat-overdue').click();
    const s = sheet(p.page);
    await expect(s.getByTestId('stats-big')).toHaveText(String(n));
    await expect(s.getByText('seit 2 Tagen')).toBeVisible();
    await expect(s.getByText('seit gestern')).toBeVisible();

    await s.getByRole('button', { name: `„Morgen ${tag}“ auf morgen verschieben` }).click();
    await expect(s.getByText(`Morgen ${tag}`, { exact: true })).toHaveCount(0);
    const moved = await get(p.request, a.id);
    expect(dayKey(Date.parse(moved.dueAt!))).toBe(addDay(dayKey(Date.now()), 1));
    expect(clock(moved.dueAt!)).toBe(clock(old));
    expect(moved.columnId).toBe(plannedId); // der Server legt Karten mit Termin nach heute nach „Geplant“
    const toast = p.page.getByRole('status');
    await expect(toast.getByText(`„Morgen ${tag}“ auf morgen verschoben`)).toBeVisible();

    await toast.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(s.getByText(`Morgen ${tag}`, { exact: true })).toBeVisible();
    await expect.poll(async () => (await get(p.request, a.id)).dueAt).toBe(old);
    expect((await get(p.request, a.id)).columnId).toBe(openId);
  } finally {
    await p.close();
  }
});

test('Überfällig: „Alle auf heute“, „Alle auf morgen“, „Wochenende“ mit Hinweis und Rückgängig; wiederkehrende Karten bleiben wiederkehrend', async ({ browser, baseURL, request }, info) => {
  const t1 = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const t2 = new Date(Date.now() - 5 * H).toISOString();
  const a = await mk(request, `Sammel A ${tag}`, { assigneeIds: [meId], dueAt: t1 });
  const b = await mk(request, `Sammel B ${tag}`, { assigneeIds: [meId], dueAt: t2, recurrence: { type: 'after_completion', every: 1, unit: 'weeks' } });
  const p = await asPerson(browser, baseURL, meHeaders, info.project.name === 'hell' ? 'light' : 'dark');
  try {
    const open = () => p.page.getByTestId('stat-overdue').click();
    const toast = p.page.getByRole('status');
    const dueOf = async (id: string) => Date.parse((await get(p.request, id)).dueAt!);
    await open();
    const s = sheet(p.page);
    await expect(s.getByText(`Sammel A ${tag}`, { exact: true })).toBeVisible();

    // Alle auf morgen
    await s.getByRole('button', { name: 'Alle auf morgen' }).click();
    await expect(toast.getByText(/Aufgaben auf morgen verschoben/)).toBeVisible();
    for (const id of [a.id, b.id]) expect(dayKey(await dueOf(id))).toBe(addDay(dayKey(Date.now()), 1));
    expect((await get(p.request, a.id)).columnId).toBe(plannedId);
    await toast.getByRole('button', { name: 'Rückgängig' }).click();
    await expect.poll(async () => (await get(p.request, a.id)).dueAt).toBe(t1);
    await expect.poll(async () => (await get(p.request, b.id)).dueAt).toBe(t2);

    // Wochenende: der nächste Samstag
    await s.getByRole('button', { name: 'Wochenende' }).click();
    await expect(toast.getByText(/Aufgaben auf Samstag verschoben/)).toBeVisible();
    const sat = dayKey(await dueOf(a.id));
    expect(new Date(`${sat}T12:00:00Z`).getUTCDay()).toBe(6);
    expect(sat > dayKey(Date.now())).toBe(true);
    expect(sat <= addDay(dayKey(Date.now()), 7)).toBe(true);
    await toast.getByRole('button', { name: 'Rückgängig' }).last().click();
    await expect.poll(async () => (await get(p.request, a.id)).dueAt).toBe(t1);

    // Alle auf heute: der Termin ist nicht mehr vorbei, die Karten sind nicht mehr überfällig
    await s.getByRole('button', { name: 'Alle auf heute' }).click();
    await expect(s.getByTestId('stats-empty')).toBeVisible();
    await expect(s.getByText('Nichts überfällig 🎉')).toBeVisible();
    for (const id of [a.id, b.id]) {
      const due = await dueOf(id);
      expect(due).toBeGreaterThan(Date.now() - MIN);
      expect(dayKey(due)).toBe(dayKey(Date.now()));
    }
    const rec = (await (await p.request.get(`/api/cards/${b.id}`)).json()) as { recurrence: unknown };
    expect(rec.recurrence).not.toBeNull();
  } finally {
    await p.close();
  }
});

test('„In der Liste filtern“ stellt den Filter der Liste: Heute bzw. Überfällig, Meine', async ({ browser, baseURL, request }, info) => {
  test.skip(dayKey(Date.now() + 45 * MIN) !== dayKey(Date.now()), 'kurz vor Mitternacht');
  await mk(request, `Filter heute ${tag}`, { assigneeIds: [meId], dueAt: new Date(Date.now() + 30 * MIN).toISOString() });
  await mk(request, `Filter alt ${tag}`, { assigneeIds: [meId], dueAt: new Date(Date.now() - 3 * H).toISOString() });
  const p = await asPerson(browser, baseURL, meHeaders, info.project.name === 'hell' ? 'light' : 'dark');
  try {
    const page = p.page;
    await page.getByTestId('stat-overdue').click();
    await page.getByRole('dialog').getByRole('button', { name: 'In der Liste filtern' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByTestId('filter-count')).toHaveText('1');
    await expect(page.getByRole('button', { name: 'Meine' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('group-overdue').getByText(`Filter alt ${tag}`)).toBeVisible();
    await expect(page.getByTestId('group-today')).toHaveCount(0);

    await page.getByTestId('stat-today').click();
    await page.getByRole('dialog').getByRole('button', { name: 'In der Liste filtern' }).click();
    await expect(page.getByTestId('group-today').getByText(`Filter heute ${tag}`)).toBeVisible();
    await expect(page.getByTestId('group-overdue')).toHaveCount(0);
  } finally {
    await p.close();
  }
});

test('Heute erledigt: Ring, Uhrzeit, Rückgängig öffnet die Karte wieder, „Archiv öffnen“', async ({ browser, baseURL, request }, info) => {
  const a = await mk(request, `Fertig ${tag}`, { assigneeIds: [meId], dueAt: new Date(Date.now() - 4 * H).toISOString() });
  const done = await request.post(`/api/cards/${a.id}/complete`, { headers: meHeaders });
  expect(done.status(), await done.text()).toBe(200);
  const p = await asPerson(browser, baseURL, meHeaders, info.project.name === 'hell' ? 'light' : 'dark');
  try {
    const page = p.page;
    const n = await num(page, 'done');
    expect(n).toBeGreaterThanOrEqual(1);
    await page.getByTestId('stat-done').click();
    const s = sheet(page);
    await expect(s.getByTestId('stats-ring')).toBeVisible();
    await expect(s.getByTestId('stats-title')).toContainText(`${n} von`);
    const row = s.getByRole('button', { name: new RegExp(`^Fertig ${tag}`) });
    await expect(row).toBeVisible();
    await expect(s.getByTestId('done-at').first()).toHaveText(/^\d\d:\d\d$/);

    await s.getByRole('button', { name: `„Fertig ${tag}“ wieder öffnen` }).click();
    await expect(row).toHaveCount(0);
    await expect(page.getByRole('status').getByText(`„Fertig ${tag}“ ist wieder offen`)).toBeVisible();
    expect((await get(p.request, a.id)).completedAt).toBeNull();
    await expect.poll(() => num(page, 'done')).toBe(n - 1);
    if (n === 1) {
      await expect(s.getByTestId('stats-empty')).toBeVisible();
      await expect(s.getByText('Heute noch nichts erledigt')).toBeVisible();
    }

    await page.getByRole('dialog').getByRole('button', { name: 'Archiv öffnen' }).click();
    await expect(page.getByRole('dialog', { name: 'Archiv' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Zurück' }).click();
    await expect(sheet(page)).toHaveAttribute('data-kind', 'done');
  } finally {
    await p.close();
  }
});

test('Kind: eigene Karten im Blatt, abhaken ja, aber kein „Morgen“ und kein „Alle verschieben“', async ({ browser, baseURL, request }, info) => {
  const a = await mk(request, `Kind alt ${tag}`, { assigneeIds: [kidId], dueAt: new Date(Date.now() - 2 * 86_400_000).toISOString() });
  await mk(request, `Fremd ${tag}`, { assigneeIds: [meId], dueAt: new Date(Date.now() - 2 * 86_400_000).toISOString() });
  const p = await asPerson(browser, baseURL, kidHeaders, info.project.name === 'hell' ? 'light' : 'dark');
  try {
    await expect(p.page.getByRole('group', { name: 'Deine Zahlen' }).getByRole('button')).toHaveCount(3);
    await p.page.getByTestId('stat-overdue').click();
    const s = sheet(p.page);
    await expect(s.getByText(`Kind alt ${tag}`, { exact: true })).toBeVisible();
    await expect(s.getByText(`Fremd ${tag}`)).toHaveCount(0);
    await expect(s.getByText('seit 2 Tagen')).toBeVisible();
    await expect(s.getByRole('button', { name: /auf morgen verschieben|Alle auf|Wochenende/ })).toHaveCount(0);
    await expect(s.getByRole('group', { name: 'Alle verschieben' })).toHaveCount(0);
    // Abhaken bleibt (ohne Bestätigungspflicht erledigt es die Karte)
    await s.getByRole('checkbox', { name: `„Kind alt ${tag}“ erledigen` }).click();
    await expect.poll(async () => (await get(p.request, a.id)).completedAt).not.toBeNull();
  } finally {
    await p.close();
  }
});

// Regression (CI um 23 Uhr): zwei Karten mit gleichem Titel und gleichem Termin ließen „Warum kommt nichts an?“ ewig laden
test('Warum kommt nichts an?: zwei gleiche Karten mit gleichem Termin stören die Liste nicht', async ({ page, request }) => {
  const due = new Date(Date.now() - 11 * H).toISOString();
  await mk(request, `Gleich ${tag}`, { dueAt: due });
  await mk(request, `Gleich ${tag}`, { dueAt: due });
  await page.goto('/');
  await openSettingsPage(page, 'Warum kommt nichts an?');
  await expect(page.getByTestId('push-ok')).toBeVisible();
});
