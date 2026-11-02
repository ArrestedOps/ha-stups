// Nimmt ein kurzes Demo-GIF auf (iPhone-Ansicht, erfundene Daten, ohne Ton): Schnell-Eingabe, Karte anlegen, Agenda, Erledigen.
// Aufruf im Repository-Ordner (nach pnpm build): node e2e/demo.mjs --lang en|de   →  docs/images/demo.<lang>.gif
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { PNG } from 'pngjs';
import { devices, webkit } from '@playwright/test';

const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'en';
if (lang !== 'de' && lang !== 'en') throw new Error('--lang muss de oder en sein');
const EN = lang === 'en';
const x = (de, en) => (EN ? en : de);

const root = join(import.meta.dirname, '..');
const PORT = 18520;
const base = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), 'stups-demo-'));
writeFileSync(join(dir, 'options.json'), JSON.stringify({ users: [], dashboard_path: '/', daily_summary_time: '23:59', overdue_nag_time: '18:00', log_level: 'warn' }));
const server = spawn(process.execPath, [join(root, 'packages', 'server', 'dist', 'main.js')], {
  env: { ...process.env, DATA_DIR: dir, OPTIONS_PATH: join(dir, 'options.json'), PORT: String(PORT), ENFORCE_INGRESS_IP: 'false', DEV_USER: 'anna', DEV_ADMINS: 'dev-anna', SUPERVISOR_TOKEN: '' },
  stdio: 'ignore',
});
process.on('exit', () => server.kill());

const headers = { 'content-type': 'application/json', 'x-stups-language': lang };
const api = async (method, path, body) => {
  const res = await fetch(`${base}/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : method === 'POST' ? '{}' : undefined });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`${base}/healthz`)).ok) break;
  } catch {
    /* noch nicht da */
  }
  await new Promise((r) => setTimeout(r, 250));
}

// ---------- erfundene Daten ----------
const H = 3_600_000;
const at = (ms) => new Date(Date.now() + ms).toISOString();
const dayAt = (days, hour, min = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};
for (const [name, haUserId] of [['Anna', 'dev-anna'], ['Ben', null]]) {
  const p = await api('POST', 'access/people', { name, haUserId });
  await api('PATCH', `access/people/${p.id}`, { displayName: name });
}
await api('PUT', 'access/mode', { mode: 'everyone' });
const people = await api('GET', 'people');
const ben = people.find((p) => p.displayName === 'Ben');
const anna = people.find((p) => p.displayName === 'Anna');
const [board] = await api('GET', 'boards');
const view = await api('GET', `boards/${board.id}`);
const col = Object.fromEntries(view.columns.map((c) => [c.name, c.id]));
const home = (await api('POST', `boards/${board.id}/categories`, { name: x('Haushalt', 'Home'), color: 'blue' })).id;
const open = col[x('Offen', 'Open')];
const mk = (data) => api('POST', `boards/${board.id}/cards`, { columnId: open, ...data });
await mk({ title: x('Müll rausbringen', 'Take out the trash'), dueAt: at(-1 * H), assigneeIds: [anna.id], priority: 'high', categoryIds: [home], recurrence: { type: 'fixed', freq: 'weekly', every: 1, weekdays: [new Date().getDay() || 7] } });
await mk({ title: x('Steuererklärung abgeben', 'File tax return'), dueAt: dayAt(0, 23, 0), assigneeIds: [ben.id], costCents: 12000 });
await mk({ title: x('Fenster putzen', 'Clean the windows'), dueAt: dayAt(2, 10, 0), assigneeIds: [anna.id, ben.id] });
await mk({ title: x('Heizung entlüften', 'Bleed the radiators') });

// ---------- Aufnahme ----------
const frames = [];
const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, locale: x('de-DE', 'en-GB'), timezoneId: 'Europe/Berlin', colorScheme: 'dark' });
const page = await context.newPage();
/** Ein Bild merken; `hold` ist die Anzeigedauer in Hundertstelsekunden */
const snap = async (hold = 80) => {
  await page.waitForTimeout(220);
  const png = PNG.sync.read(await page.screenshot());
  frames.push({ data: png.data, width: png.width, height: png.height, hold });
};

const nav = (name) => page.getByRole('navigation', { name: x('Ansicht', 'View') }).getByRole('button', { name });
await page.goto(base + '/');
await nav('Boards').waitFor();
await snap(120);

// Schnell-Eingabe: Zeile Stück für Stück tippen, die Chips erscheinen
await page.getByRole('button', { name: x('Neue Karte', 'New card'), exact: true }).click();
const title = page.getByLabel(x('Titel', 'Title'));
const line = x('Blumen gießen morgen 19 Uhr @Ben #Haushalt jede Woche !!', 'Water the plants tomorrow 7pm @Ben #Home every week !!');
const stops = [line.indexOf(x(' morgen', ' tomorrow')), line.indexOf('@'), line.indexOf('every') > 0 ? line.indexOf('every') : line.indexOf('jede'), line.length];
await snap(60);
let typed = 0;
for (const stop of stops) {
  await title.pressSequentially(line.slice(typed, stop), { delay: 15 });
  typed = stop;
  await snap(stop === line.length ? 220 : 70);
}
await page.getByRole('button', { name: x('Anlegen', 'Create'), exact: true }).click();
await page.getByRole('tab', { name: new RegExp(`^${x('Geplant', 'Planned')}`) }).click();
await snap(130);

// Agenda: die neue Karte steht morgen
await nav('Agenda').click();
await page.getByTestId('agenda').getByText(x('Blumen gießen', 'Water the plants')).waitFor();
await snap(160);

// Erledigen: Kreis links an der überfälligen Karte, dann „Rückgängig" im Hinweis
await nav('Boards').click();
await page.getByRole('tab', { name: new RegExp(`^${x('Offen', 'Open')}`) }).click();
await snap(90);
await page.getByRole('button', { name: new RegExp(x('„Müll rausbringen“ erledigen', 'Complete .Take out the trash.')) }).click();
await page.getByRole('button', { name: x('Rückgängig', 'Undo') }).waitFor();
await snap(170);

// Kalender
await nav(x('Kalender', 'Calendar')).click();
await page.getByRole('group', { name: x('Ansicht', 'View') }).getByRole('button', { name: x('Woche', 'Week') }).click();
await snap(150);
await browser.close();
server.kill();

// ---------- GIF ----------
const gif = GIFEncoder();
for (const f of frames) {
  const palette = quantize(f.data, 128, { format: 'rgb565' });
  gif.writeFrame(applyPalette(f.data, palette, 'rgb565'), f.width, f.height, { palette, delay: f.hold * 10, repeat: 0 });
}
gif.finish();
const file = join(root, 'docs', 'images', `demo.${lang}.gif`);
writeFileSync(file, gif.bytes());
console.log(`geschrieben: ${file} (${frames.length} Bilder, ${(gif.bytes().length / 1024 / 1024).toFixed(2)} MB)`);
