// Erzeugt die Screenshots für README und Anleitung (docs/images) aus dem gebauten Server mit erfundenen Beispieldaten.
// Aufruf im Repository-Ordner (nach pnpm build): node e2e/screenshots.mjs [--lang en]
//   ohne Angabe: deutsch nach docs/images, mit --lang en: englisch nach docs/images/en
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { devices, webkit } from '@playwright/test';

const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'de';
if (lang !== 'de' && lang !== 'en') throw new Error('--lang muss de oder en sein');
const EN = lang === 'en';
/** Text in der Sprache der Aufnahme */
const x = (de, en) => (EN ? en : de);

const root = join(import.meta.dirname, '..');
const out = EN ? join(root, 'docs', 'images', 'en') : join(root, 'docs', 'images');
mkdirSync(out, { recursive: true });
const PORT = 18500;
const base = `http://127.0.0.1:${PORT}`;

// ---------- Server mit Beispielpersonen ----------
const dir = mkdtempSync(join(tmpdir(), 'stups-shots-'));
writeFileSync(
  join(dir, 'options.json'),
  JSON.stringify({
    users: [],
    dashboard_path: '/',
    daily_summary_time: '23:59',
    overdue_nag_time: '18:00',
    log_level: 'warn',
  }),
);
const server = spawn(process.execPath, [join(root, 'packages', 'server', 'dist', 'main.js')], {
  env: {
    ...process.env,
    DATA_DIR: dir,
    OPTIONS_PATH: join(dir, 'options.json'),
    PORT: String(PORT),
    ENFORCE_INGRESS_IP: 'false',
    DEV_USER: 'anna',
    DEV_ADMINS: 'dev-anna',
    SUPERVISOR_TOKEN: '',
  },
  stdio: 'ignore',
});
const stop = () => server.kill();
process.on('exit', stop);

async function waitUp(url = base) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${url}/healthz`)).ok) return;
    } catch {
      /* noch nicht da */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server startet nicht');
}

const headers = { 'content-type': 'application/json', 'x-stups-language': lang };
const api = async (method, path, body) => {
  const res = await fetch(`${base}/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : method === 'POST' ? '{}' : undefined });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

// ---------- Beispieldaten ----------
const H = 3_600_000;
const D = 24 * H;
const at = (ms) => new Date(Date.now() + ms).toISOString();
const dayAt = (days, hour, min = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};

// Alle Texte der Beispieldaten, deutsch und englisch
const S = {
  trash: x('Müll rausbringen', 'Take out the trash'),
  tax: x('Steuererklärung abgeben', 'File tax return'),
  windows: x('Fenster putzen', 'Clean the windows'),
  gift: x('Geburtstagsgeschenk für Mama', 'Birthday gift for Mum'),
  heating: x('Heizung entlüften', 'Bleed the radiators'),
  smoke: x('Rauchmelder prüfen', 'Check smoke detectors'),
  basement: x('Keller aufräumen', 'Tidy the basement'),
  paper: x('Altpapier entsorgt', 'Paper recycling done'),
  receipts: x('Belege sortieren', 'Sort receipts'),
  form: x('Formular ausfüllen', 'Fill in the form'),
  florist: x('Blumen Beck', 'Beck Florist'),
  electrician: x('Elektriker Termin', 'Electrician appointment'),
  tiles: x('Fliesen bestellen', 'Order tiles'),
  kitchen: x('Angebot Küche prüfen', 'Review kitchen quote'),
  parcel: x('Paket abholen', 'Pick up parcel'),
  wrapping: x('Geschenkpapier kaufen', 'Buy wrapping paper'),
  dentist: x('Zahnarzt anrufen', 'Call the dentist'),
  boardReno: x('Umbau', 'Renovation'),
  boardShop: x('Einkauf', 'Shopping'),
  catCleaning: x('Putzen', 'Cleaning'),
  catFamily: x('Familie', 'Family'),
  catFinance: x('Finanzen', 'Finance'),
  catTech: x('Technik', 'Tech'),
  open: x('Offen', 'Open'),
  planned: x('Geplant', 'Planned'),
  doing: x('In Arbeit', 'In progress'),
};

async function seed() {
  // Personen über die App-Schnittstelle anlegen (stünden sie in der Konfiguration, wären sie in der App gesperrt)
  for (const [name, device, haUserId] of [['Anna', 'mobile_app_annas_iphone', 'dev-anna'], ['Ben', 'mobile_app_bens_iphone', null]]) {
    const person = await api('POST', 'access/people', { name, haUserId });
    await api('PATCH', `access/people/${person.id}`, { notifyServices: [device], displayName: name });
  }
  await api('PUT', 'access/mode', { mode: 'everyone' });
  const people = await api('GET', 'people');
  const anna = people.find((p) => p.displayName === 'Anna');
  const ben = people.find((p) => p.displayName === 'Ben');
  for (const p of [anna, ben]) await api('PATCH', `access/people/${p.id}`, { quietOff: true });

  const [haushalt] = await api('GET', 'boards');
  const view = await api('GET', `boards/${haushalt.id}`);
  const col = Object.fromEntries(view.columns.map((c) => [c.name, c.id]));
  const cat = {};
  for (const [key, name, color] of [['cleaning', S.catCleaning, 'blue'], ['family', S.catFamily, 'pink'], ['finance', S.catFinance, 'yellow'], ['tech', S.catTech, 'mint']]) {
    cat[key] = (await api('POST', `boards/${haushalt.id}/categories`, { name, color })).id;
  }
  const mk = (boardId, columnId, data) => api('POST', `boards/${boardId}/cards`, { columnId, ...data });

  const open = col[S.open];
  const c1 = await mk(haushalt.id, open, { title: S.trash, dueAt: at(-2 * H), recurrence: { type: 'fixed', freq: 'daily', every: 2 }, assigneeIds: [anna.id], priority: 'high' });
  const c2 = await mk(haushalt.id, open, { title: S.tax, dueAt: dayAt(0, 23, 0), assigneeIds: [ben.id], categoryIds: [cat.finance], costCents: 12000 });
  await api('POST', `cards/${c2.id}/checklist`, { text: S.receipts });
  const ck = await api('POST', `cards/${c2.id}/checklist`, { text: S.form });
  await api('PATCH', `checklist/${ck.id}`, { done: true });
  await mk(haushalt.id, open, { title: S.windows, dueAt: dayAt(1, 10, 0), assigneeIds: [anna.id, ben.id], categoryIds: [cat.cleaning] });
  const c4 = await mk(haushalt.id, open, { title: S.gift, dueAt: dayAt(3, 14, 0), assigneeIds: [ben.id], categoryIds: [cat.family], costCents: 4990 });
  await api('POST', `cards/${c4.id}/links`, { url: 'https://maps.google.com/?q=Blumen+Beck', title: S.florist }).catch(() => undefined);
  await mk(haushalt.id, open, { title: S.heating, categoryIds: [cat.tech] });
  await mk(haushalt.id, col[S.planned], { title: S.smoke, dueAt: dayAt(9, 10, 0), assigneeIds: [anna.id], categoryIds: [cat.tech] });
  await mk(haushalt.id, col[S.doing], { title: S.basement, assigneeIds: [ben.id], categoryIds: [cat.cleaning] });
  const done = await mk(haushalt.id, open, { title: S.paper, dueAt: at(-30 * H), assigneeIds: [anna.id] });
  await api('POST', `cards/${done.id}/complete`);

  // weitere Boards für Agenda und Kalender
  const umbau = await api('POST', 'boards', { name: S.boardReno });
  const uv = await api('GET', `boards/${umbau.id}`);
  const uo = uv.columns[0].id;
  await mk(umbau.id, uo, { title: S.electrician, dueAt: dayAt(2, 9, 0), assigneeIds: [ben.id] });
  await mk(umbau.id, uo, { title: S.tiles, dueAt: dayAt(2, 12, 30), assigneeIds: [ben.id], costCents: 84000 });
  await mk(umbau.id, uo, { title: S.kitchen, dueAt: dayAt(5, 17, 0), assigneeIds: [anna.id] });
  const einkauf = await api('POST', 'boards', { name: S.boardShop });
  const ev = await api('GET', `boards/${einkauf.id}`);
  await mk(einkauf.id, ev.columns[0].id, { title: S.parcel, dueAt: dayAt(0, 16, 30), assigneeIds: [anna.id] });
  await mk(einkauf.id, ev.columns[0].id, { title: S.wrapping, dueAt: dayAt(1, 18, 0) });

  // Anlegedaten streuen, damit „Angelegt …" nicht überall „heute" heißt
  const db = new DatabaseSync(join(dir, 'stups.sqlite'));
  const back = { [S.trash]: 3, [S.tax]: 9, [S.windows]: 1, [S.gift]: 5, [S.heating]: 21 };
  for (const [title, days] of Object.entries(back)) {
    db.prepare('update cards set created_at = ? where title = ?').run(at(-days * D), title);
  }
  db.close();

  return { anna, ben, haushalt: haushalt.id, c1: c1.id, c2: c2.id };
}

// ---------- Aufnahmen ----------
const phone = devices['iPhone 13'];
const shot = async (page, name, scheme) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(out, `${name}-${scheme}.png`) });
  console.log('geschrieben:', `${name}-${scheme}.png`);
};

export async function capture(screens, baseUrl = base) {
  const browser = await webkit.launch();
  for (const scheme of ['dunkel', 'hell']) {
    const context = await browser.newContext({ ...phone, locale: x('de-DE', 'en-GB'), timezoneId: 'Europe/Berlin', colorScheme: scheme === 'dunkel' ? 'dark' : 'light' });
    const page = await context.newPage();
    for (const [name, run] of screens) {
      await page.goto(baseUrl + '/');
      await page.evaluate(() => localStorage.clear()); // gemerkte Ansicht und Filter wegräumen
      await page.reload();
      await nav(page, 'Boards').waitFor();
      await run(page);
      await shot(page, name, scheme);
    }
    await context.close();
  }
  await browser.close();
}

await waitUp();
const seeded = await seed();

const nav = (page, name) => page.getByRole('navigation', { name: x('Ansicht', 'View') }).getByRole('button', { name });
const mode = (page, name) => page.getByRole('radiogroup', { name: x('Ansicht', 'View') }).getByRole('radio', { name }).click();
const all = (page) => chip(page, x('Personen', 'People'), x('Alle', 'All'));
/** Aufgaben öffnen, eine Ansicht wählen (Liste, Tag, Woche, Monat) und „Alle“ statt „Meine“ zeigen */
const tasks = async (page, view) => { await nav(page, x('Aufgaben', 'Tasks')).click(); await mode(page, view); await all(page); };
const chip = (page, group, name) => page.getByRole('group', { name: group }).getByRole('button', { name, exact: typeof name === 'string' }).click();
const re = (s) => new RegExp(`^${s}`);

const screens = [
  ['board', async (page) => { await nav(page, 'Boards').click(); await page.getByRole('tab', { name: re(S.open) }).click(); }],
  ['karte', async (page) => { await nav(page, 'Boards').click(); await page.getByRole('tab', { name: re(S.open) }).click(); await page.getByText(S.tax).first().click(); await page.getByTestId('created-note').waitFor(); }],
  ['neue-karte', async (page) => { await nav(page, 'Boards').click(); await page.getByRole('button', { name: x('Neue Karte', 'New card'), exact: true }).click(); await page.getByLabel(x('Titel', 'Title')).fill(S.dentist); }],
  ['stupsen', async (page) => {
    await nav(page, 'Boards').click();
    await page.getByRole('tab', { name: re(S.planned) }).click();
    await page.getByText(S.windows).first().click();
    await page.getByRole('button', { name: x(/stupsen/, /nudge/i) }).click();
    await page.getByRole('radio', { name: x(/Heute noch/, /Today still/) }).click();
  }],
  ['aufgaben', async (page) => { await nav(page, x('Aufgaben', 'Tasks')).click(); await page.getByTestId('today-sentence').waitFor(); await page.getByTestId('week-strip').waitFor(); }],
  ['aufgaben-alle', async (page) => { await tasks(page, x('Liste', 'List')); await page.getByTestId('tasks').getByText(S.windows).waitFor(); }],
  ['aufgaben-gefiltert', async (page) => {
    await tasks(page, x('Liste', 'List'));
    await chip(page, x('Personen', 'People'), /Ben/);
    await page.getByRole('button', { name: 'Filter' }).click();
    await chip(page, 'Boards', new RegExp(S.boardReno));
    await page.getByTestId('tasks').getByText(S.electrician).waitFor();
  }],
  ['karte-menu', async (page) => {
    await nav(page, 'Boards').click();
    await page.getByRole('tab', { name: re(S.open) }).click();
    await page.getByRole('button', { name: x(/^Menü für/, /^Menu for/) }).first().click();
    await page.getByRole('dialog').getByText(x('Verschieben nach', 'Move to')).waitFor();
  }],
  ['kalender-woche', async (page) => { await tasks(page, x('Woche', 'Week')); if (new Date().getDay() === 0) await page.getByRole('button', { name: x('Weiter', 'Next') }).click(); /* sonntags liegt morgen in der nächsten Woche */ await page.getByRole('button', { name: re(S.windows) }).first().waitFor(); }],
  ['kalender-tag', async (page) => { await tasks(page, x('Tag', 'Day')); await page.getByRole('button', { name: re(S.parcel) }).waitFor(); }],
  ['kalender-monat', async (page) => { await tasks(page, x('Monat', 'Month')); await page.locator('[data-today]').waitFor(); }],
  ['kalender-neue-karte', async (page) => {
    await tasks(page, x('Tag', 'Day'));
    await page.getByRole('button', { name: re(S.parcel) }).waitFor();
    const grid = page.getByTestId('calendar-grid');
    await grid.evaluate((el) => (el.scrollTop = 11 * 56));
    const box = await page.getByRole('button', { name: x(/^Neue Karte am/, /^New card on/) }).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + 12 * 56 + 20);
    await page.getByLabel(x('Titel', 'Title')).fill(S.dentist);
  }],
  ['einstellungen', async (page) => {
    await nav(page, 'Boards').click();
    await page.getByRole('button', { name: x('Einstellungen öffnen', 'Open settings') }).click();
    await page.getByTestId('settings-head').waitFor();
  }],
  ['personen', async (page) => {
    await nav(page, 'Boards').click();
    await page.getByRole('button', { name: x('Einstellungen öffnen', 'Open settings') }).click();
    await page.getByRole('dialog').getByRole('button', { name: x(/Personen und Kinder/, /People and children/) }).click();
    await page.getByRole('dialog').getByText(x('Wer darf Stups öffnen?', 'Who may open Stups?')).waitFor();
  }],
];
// ---------- Wächter: eigener Server mit nachgebautem Home Assistant (e2e/server-ha.mjs), erfundene Namen ----------
const HA_PORT = 18510;
const haBase = `http://127.0.0.1:${HA_PORT}`;
const mock = `http://127.0.0.1:${HA_PORT + 1}`;
const haServer = spawn(process.execPath, [join(root, 'e2e', 'server-ha.mjs')], {
  env: { ...process.env, PORT: String(HA_PORT), MOCK_NAMES: 'anna,ben' },
  stdio: 'ignore',
});
process.on('exit', () => haServer.kill());

const W = {
  washer: x('Waschmaschine fertig', 'Washing machine done'),
  washerCard: x('Waschmaschine ausräumen', 'Empty the washing machine'),
  vacuum: x('Saugroboter: Behälter leeren', 'Robot vacuum: empty the bin'),
  vacuumCard: x('Staubbehälter leeren', 'Empty the dust bin'),
  dish: x('Spülmaschine fertig', 'Dishwasher done'),
  dishCard: x('Spülmaschine ausräumen', 'Empty the dishwasher'),
};

async function seedWatchers() {
  await waitUp(haBase);
  const call = async (method, path, body) => {
    const res = await fetch(`${haBase}/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : method === 'POST' ? '{}' : undefined });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
  const setState = (entityId, state, attributes = {}) =>
    fetch(`${mock}/mock/state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityId, state, attributes }) });
  await setState('vacuum.s7', 'cleaning', { friendly_name: x('Saugroboter S7', 'Robot vacuum S7') });
  await setState('sensor.spuelmaschine_leistung', '80', { friendly_name: x('Spülmaschine Leistung', 'Dishwasher power'), unit_of_measurement: 'W' });

  const people = await call('GET', 'people');
  for (const p of people) await call('PATCH', `access/people/${p.id}`, { notifyServices: [`mobile_app_${p.name.toLowerCase()}_e2e`], quietOff: true });
  const [board] = await call('GET', 'boards');
  const view = await call('GET', `boards/${board.id}`);
  const columnId = view.columns.find((c) => c.name === S.open).id;
  const card = (title, due) => ({ boardId: board.id, columnId, title, due });
  const wash = await call('POST', 'watchers', {
    name: W.washer,
    trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 3 },
    card: card(W.washerCard, { kind: 'in', minutes: 30 }),
    assign: { mode: 'rotation_present', personIds: [] },
    done: { entityId: 'binary_sensor.waschmaschine_tuer', kind: 'state', to: 'on' },
  });
  await call('POST', 'watchers', {
    name: W.vacuum,
    trigger: { entityId: 'vacuum.s7', kind: 'state', to: 'docked', count: 3 },
    card: card(W.vacuumCard, { kind: 'none' }),
    assign: { mode: 'first_home', personIds: [] },
  });
  await call('POST', 'watchers', {
    name: W.dish,
    active: false,
    trigger: { entityId: 'sensor.spuelmaschine_leistung', kind: 'below', value: 5, forMin: 3 },
    card: card(W.dishCard, { kind: 'in', minutes: 30 }),
    assign: { mode: 'rotation_present', personIds: [] },
  });
  await call('POST', `watchers/${wash.id}/test`);
}

const watcherScreens = [
  ['waechter', async (page) => {
    await nav(page, x('Wächter', 'Watchers')).click();
    await page.getByTestId('home-waiting').waitFor();
  }],
  ['gefunden', async (page) => {
    await nav(page, x('Wächter', 'Watchers')).click();
    await page.getByTestId('home-found').click();
    await page.getByTestId('found-hit').first().waitFor();
  }],
  ['waechter-liste', async (page) => {
    await nav(page, 'Boards').click();
    await page.getByRole('button', { name: x('Einstellungen öffnen', 'Open settings') }).click();
    await page.getByRole('dialog').getByRole('button', { name: x('Wächter', 'Watchers'), exact: true }).click();
    await page.getByTestId('watcher-card').first().waitFor();
    await page.getByTestId('watcher-activity').waitFor();
  }],
  ['waechter-bearbeiten', async (page) => {
    await nav(page, 'Boards').click();
    await page.getByRole('button', { name: x('Einstellungen öffnen', 'Open settings') }).click();
    await page.getByRole('dialog').getByRole('button', { name: x('Wächter', 'Watchers'), exact: true }).click();
    await page.getByRole('button', { name: x(/Wächter Waschmaschine fertig bearbeiten/, /Edit watcher Washing machine done/) }).click();
    await page.getByTestId('watcher-sentence').waitFor();
  }],
  ['waechter-karte', async (page) => {
    await nav(page, 'Boards').click();
    await page.getByRole('tab', { name: re(S.open) }).click();
    await page.getByTestId('card-watcher').first().waitFor();
  }],
];
try {
  await capture(screens);
  await seedWatchers();
  await capture(watcherScreens, haBase);
} finally {
  stop();
  haServer.kill();
}
console.log('fertig', seeded.haushalt ? '' : '');
