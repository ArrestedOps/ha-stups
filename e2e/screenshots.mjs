// Erzeugt die Screenshots für README und Anleitung (docs/images) aus dem gebauten Server mit erfundenen Beispieldaten.
// Aufruf im Repository-Ordner (nach pnpm build): node e2e/screenshots.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { devices, webkit } from '@playwright/test';

const root = join(import.meta.dirname, '..');
const out = join(root, 'docs', 'images');
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
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${url}/healthz`)).ok) return;
    } catch {
      /* noch nicht da */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server startet nicht');
}

const api = async (method, path, body) => {
  const res = await fetch(`${base}/api/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : method === 'POST' ? '{}' : undefined });
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
  for (const [name, color] of [['Putzen', 'blue'], ['Familie', 'pink'], ['Finanzen', 'yellow'], ['Technik', 'mint']]) {
    cat[name] = (await api('POST', `boards/${haushalt.id}/categories`, { name, color })).id;
  }
  const mk = (boardId, columnId, data) => api('POST', `boards/${boardId}/cards`, { columnId, ...data });

  const open = col['Offen'];
  const c1 = await mk(haushalt.id, open, { title: 'Müll rausbringen', dueAt: at(-2 * H), recurrence: { type: 'fixed', freq: 'daily', every: 2 }, assigneeIds: [anna.id], priority: 'high' });
  const c2 = await mk(haushalt.id, open, { title: 'Steuererklärung abgeben', dueAt: dayAt(0, 23, 0), assigneeIds: [ben.id], categoryIds: [cat.Finanzen], costCents: 12000 });
  await api('POST', `cards/${c2.id}/checklist`, { text: 'Belege sortieren' });
  const ck = await api('POST', `cards/${c2.id}/checklist`, { text: 'Formular ausfüllen' });
  await api('PATCH', `checklist/${ck.id}`, { done: true });
  await mk(haushalt.id, open, { title: 'Fenster putzen', dueAt: dayAt(1, 10, 0), assigneeIds: [anna.id, ben.id], categoryIds: [cat.Putzen] });
  const c4 = await mk(haushalt.id, open, { title: 'Geburtstagsgeschenk für Mama', dueAt: dayAt(3, 14, 0), assigneeIds: [ben.id], categoryIds: [cat.Familie], costCents: 4990 });
  await api('POST', `cards/${c4.id}/links`, { url: 'https://maps.google.com/?q=Blumen+Beck', title: 'Blumen Beck' }).catch(() => undefined);
  await mk(haushalt.id, open, { title: 'Heizung entlüften', categoryIds: [cat.Technik] });
  await mk(haushalt.id, col['Geplant'], { title: 'Rauchmelder prüfen', dueAt: dayAt(9, 10, 0), assigneeIds: [anna.id], categoryIds: [cat.Technik] });
  await mk(haushalt.id, col['In Arbeit'], { title: 'Keller aufräumen', assigneeIds: [ben.id], categoryIds: [cat.Putzen] });
  const done = await mk(haushalt.id, open, { title: 'Altpapier entsorgt', dueAt: at(-30 * H), assigneeIds: [anna.id] });
  await api('POST', `cards/${done.id}/complete`);

  // weitere Boards für Agenda und Kalender
  const umbau = await api('POST', 'boards', { name: 'Umbau' });
  const uv = await api('GET', `boards/${umbau.id}`);
  const uo = uv.columns[0].id;
  await mk(umbau.id, uo, { title: 'Elektriker Termin', dueAt: dayAt(2, 9, 0), assigneeIds: [ben.id] });
  await mk(umbau.id, uo, { title: 'Fliesen bestellen', dueAt: dayAt(2, 12, 30), assigneeIds: [ben.id], costCents: 84000 });
  await mk(umbau.id, uo, { title: 'Angebot Küche prüfen', dueAt: dayAt(5, 17, 0), assigneeIds: [anna.id] });
  const einkauf = await api('POST', 'boards', { name: 'Einkauf' });
  const ev = await api('GET', `boards/${einkauf.id}`);
  await mk(einkauf.id, ev.columns[0].id, { title: 'Paket abholen', dueAt: dayAt(0, 16, 30), assigneeIds: [anna.id] });
  await mk(einkauf.id, ev.columns[0].id, { title: 'Geschenkpapier kaufen', dueAt: dayAt(1, 18, 0) });

  // Anlegedaten streuen, damit „Angelegt …" nicht überall „heute" heißt
  const db = new DatabaseSync(join(dir, 'stups.sqlite'));
  const back = { 'Müll rausbringen': 3, 'Steuererklärung abgeben': 9, 'Fenster putzen': 1, 'Geburtstagsgeschenk für Mama': 5, 'Heizung entlüften': 21 };
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
    const context = await browser.newContext({ ...phone, locale: 'de-DE', timezoneId: 'Europe/Berlin', colorScheme: scheme === 'dunkel' ? 'dark' : 'light' });
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

const nav = (page, name) => page.getByRole('navigation', { name: 'Ansicht' }).getByRole('button', { name });
const mode = (page, name) => page.getByRole('group', { name: 'Ansicht' }).getByRole('button', { name }).click();
const chip = (page, group, name) => page.getByRole('group', { name: group }).getByRole('button', { name }).click();

const screens = [
  ['board', async (page) => { await nav(page, 'Boards').click(); await page.getByRole('tab', { name: /^Offen/ }).click(); }],
  ['karte', async (page) => { await nav(page, 'Boards').click(); await page.getByText('Steuererklärung abgeben').first().click(); await page.getByTestId('created-note').waitFor(); }],
  ['neue-karte', async (page) => { await nav(page, 'Boards').click(); await page.getByRole('button', { name: 'Neue Karte', exact: true }).click(); await page.getByLabel('Titel').fill('Zahnarzt anrufen'); }],
  ['stupsen', async (page) => {
    await nav(page, 'Boards').click();
    await page.getByRole('tab', { name: /^Geplant/ }).click();
    await page.getByText('Fenster putzen').first().click();
    await page.getByRole('button', { name: 'Stupsen' }).click();
    await page.getByRole('radio', { name: /Heute noch/ }).click();
  }],
  ['agenda', async (page) => { await nav(page, 'Agenda').click(); await page.getByTestId('agenda').getByText('Fenster putzen').waitFor(); }],
  ['agenda-gefiltert', async (page) => {
    await nav(page, 'Agenda').click();
    await chip(page, 'Personen', /Ben/);
    await chip(page, 'Boards', /Umbau/);
    await page.getByTestId('agenda').getByText('Elektriker Termin').waitFor();
  }],
  ['kalender-woche', async (page) => { await nav(page, 'Kalender').click(); await mode(page, 'Woche'); if (new Date().getDay() === 0) await page.getByRole('button', { name: 'Weiter' }).click(); /* sonntags liegt morgen in der nächsten Woche */ await page.getByRole('button', { name: /^Fenster putzen/ }).waitFor(); }],
  ['kalender-tag', async (page) => { await nav(page, 'Kalender').click(); await mode(page, 'Tag'); await page.getByRole('button', { name: /^Paket abholen/ }).waitFor(); }],
  ['kalender-monat', async (page) => { await nav(page, 'Kalender').click(); await mode(page, 'Monat'); await page.locator('[data-today]').waitFor(); }],
  ['kalender-neue-karte', async (page) => {
    await nav(page, 'Kalender').click();
    await mode(page, 'Tag');
    await page.getByRole('button', { name: /^Paket abholen/ }).waitFor();
    const grid = page.getByTestId('calendar-grid');
    await grid.evaluate((el) => (el.scrollTop = 11 * 56));
    const box = await page.getByRole('button', { name: /^Neue Karte am/ }).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + 12 * 56 + 20);
    await page.getByLabel('Titel').fill('Zahnarzt anrufen');
  }],
  ['personen', async (page) => {
    await nav(page, 'Boards').click();
    await page.getByRole('button', { name: 'Board wechseln' }).click();
    await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
    await page.getByRole('button', { name: /Personen & Zugriff/ }).click();
    await page.getByRole('dialog').getByText('Wer darf Stups öffnen?').waitFor();
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

async function seedWatchers() {
  await waitUp(haBase);
  const call = async (method, path, body) => {
    const res = await fetch(`${haBase}/api/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : method === 'POST' ? '{}' : undefined });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
  const setState = (entityId, state, attributes = {}) =>
    fetch(`${mock}/mock/state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityId, state, attributes }) });
  await setState('vacuum.s7', 'cleaning', { friendly_name: 'Saugroboter S7' });
  await setState('sensor.spuelmaschine_leistung', '80', { friendly_name: 'Spülmaschine Leistung', unit_of_measurement: 'W' });

  const people = await call('GET', 'people');
  for (const p of people) await call('PATCH', `access/people/${p.id}`, { notifyServices: [`mobile_app_${p.name.toLowerCase()}_e2e`], quietOff: true });
  const [board] = await call('GET', 'boards');
  const view = await call('GET', `boards/${board.id}`);
  const columnId = view.columns.find((c) => c.name === 'Offen').id;
  const card = (title, due) => ({ boardId: board.id, columnId, title, due });
  const wash = await call('POST', 'watchers', {
    name: 'Waschmaschine fertig',
    trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 3 },
    card: card('Waschmaschine ausräumen', { kind: 'in', minutes: 30 }),
    assign: { mode: 'rotation_present', personIds: [] },
    done: { entityId: 'binary_sensor.waschmaschine_tuer', kind: 'state', to: 'on' },
  });
  await call('POST', 'watchers', {
    name: 'Saugroboter: Behälter leeren',
    trigger: { entityId: 'vacuum.s7', kind: 'state', to: 'docked', count: 3 },
    card: card('Staubbehälter leeren', { kind: 'none' }),
    assign: { mode: 'first_home', personIds: [] },
  });
  await call('POST', 'watchers', {
    name: 'Spülmaschine fertig',
    active: false,
    trigger: { entityId: 'sensor.spuelmaschine_leistung', kind: 'below', value: 5, forMin: 3 },
    card: card('Spülmaschine ausräumen', { kind: 'in', minutes: 30 }),
    assign: { mode: 'rotation_present', personIds: [] },
  });
  await call('POST', `watchers/${wash.id}/test`);
}

const watcherScreens = [
  ['waechter-liste', async (page) => {
    await nav(page, 'Boards').click();
    await page.getByRole('button', { name: 'Board wechseln' }).click();
    await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
    await page.getByRole('button', { name: /Wächter Waschmaschine fertig bearbeiten/ }).scrollIntoViewIfNeeded();
  }],
  ['waechter-bearbeiten', async (page) => {
    await nav(page, 'Boards').click();
    await page.getByRole('button', { name: 'Board wechseln' }).click();
    await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
    await page.getByRole('button', { name: /Wächter Waschmaschine fertig bearbeiten/ }).click();
    await page.getByTestId('watcher-preview').waitFor();
  }],
  ['waechter-karte', async (page) => {
    await nav(page, 'Boards').click();
    await page.getByRole('tab', { name: /^Offen/ }).click();
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
