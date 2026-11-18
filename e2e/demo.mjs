// Nimmt ein kurzes Demo-GIF auf (iPhone-Ansicht, erfundene Daten, ohne Ton): Aufgaben mit „Vom Haus“, Schnell-Eingabe, Wächter, Gefunden,
// Einrichten mit Diagramm, Stupsen und Kalender. Läuft wie die Screenshots gegen den Server mit nachgebautem Home Assistant (e2e/server-ha.mjs).
// Aufruf im Repository-Ordner (nach pnpm build): node e2e/demo.mjs --lang en|de   →  docs/images/demo.<lang>.gif
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import gifenc from 'gifenc';
import pngjs from 'pngjs';
import { devices, webkit } from '@playwright/test';

const { applyPalette, GIFEncoder, quantize } = gifenc;
const { PNG } = pngjs;
const lang = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'en';
if (lang !== 'de' && lang !== 'en') throw new Error('--lang muss de oder en sein');
const EN = lang === 'en';
const x = (de, en) => (EN ? en : de);

const root = join(import.meta.dirname, '..');
const PORT = 18520;
const base = `http://127.0.0.1:${PORT}`;
const mock = `http://127.0.0.1:${PORT + 1}`;
const server = spawn(process.execPath, [join(root, 'e2e', 'server-ha.mjs')], { env: { ...process.env, PORT: String(PORT), MOCK_NAMES: 'anna,ben' }, stdio: 'ignore' });
process.on('exit', () => server.kill());

const headers = { 'content-type': 'application/json', 'x-stups-language': lang };
const api = async (method, path, body) => {
  const res = await fetch(`${base}/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : method === 'POST' ? '{}' : undefined });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};
const setState = (entityId, state, attributes = {}) =>
  fetch(`${mock}/mock/state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityId, state, attributes }) });
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
const people = await api('GET', 'people');
for (const p of people) await api('PATCH', `access/people/${p.id}`, { notifyServices: [`mobile_app_${p.name.toLowerCase()}_e2e`], quietOff: true });
const anna = people.find((p) => p.name === 'Anna');
const ben = people.find((p) => p.name === 'Ben');
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

// Ein Wächter für die Waschmaschine: sein Test legt die Aufgabe an, die oben unter „Vom Haus“ steht
const washer = x('Waschmaschine fertig', 'Washing machine done');
const wash = await api('POST', 'watchers', {
  name: washer,
  trigger: { entityId: 'sensor.waschmaschine_leistung', kind: 'below', value: 5, forMin: 3 },
  card: { boardId: board.id, columnId: open, title: x('Waschmaschine ausräumen', 'Empty the washing machine'), due: { kind: 'in', minutes: 30 } },
  assign: { mode: 'rotation_present', personIds: [] },
});
await setState('person.anna', 'home', { friendly_name: 'Anna', user_id: 'dev-anna' });
await setState('person.ben', 'not_home', { friendly_name: 'Ben', user_id: 'ha-ben-e2e' });
await api('POST', `watchers/${wash.id}/test`);
// Verlauf der Waschmaschine: zwei Waschgänge in den letzten drei Stunden (erfundene Werte)
const minAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
const pts = [[175, 2], [165, 900], [150, 1800], [140, 700], [130, 60], [120, 2], [100, 2], [90, 900], [75, 1700], [60, 800], [45, 1300], [30, 500], [15, 300], [2, 412]];
await fetch(`${mock}/mock/history`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityId: 'sensor.waschmaschine_leistung', points: pts.map(([m, v]) => ({ state: String(v), at: minAgo(m) })) }) });
// Batterie im Bad: ein Jahr Langzeitstatistik (von 100 % auf gut 10 %), die Rohdaten der Woche sind flach (erfundene Werte)
const day = 86_400_000;
const stats = Array.from({ length: 330 }, (_, i) => ({ start: Date.now() - (330 - i) * day, mean: Math.round(Math.max(12, 100 - 0.3143 * i) * 10) / 10 }));
await fetch(`${mock}/mock/statistics`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityId: 'sensor.bad_batterie', points: stats }) });
await fetch(`${mock}/mock/history`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityId: 'sensor.bad_batterie', points: [{ state: '12', at: new Date(Date.now() - 5 * day).toISOString() }] }) });
await setState('sensor.waschmaschine_leistung', '412', { friendly_name: x('Waschmaschine Leistung', 'Washing machine power'), unit_of_measurement: 'W' });

// ---------- Aufnahme ----------
const frames = [];
const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, locale: x('de-DE', 'en-GB'), timezoneId: 'Europe/Berlin', colorScheme: 'dark', extraHTTPHeaders: { 'x-stups-language': lang } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
/** Ein Bild merken; `hold` ist die Anzeigedauer in Hundertstelsekunden */
const snap = async (hold = 80) => {
  // Hinweise („Aufgabe angelegt“ …) erst verschwinden lassen, damit sie nicht in den nächsten Bildern hängen
  await page.getByRole('status').first().waitFor({ state: 'detached', timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(260);
  const png = PNG.sync.read(await page.screenshot());
  frames.push({ data: png.data, width: png.width, height: png.height, hold });
};

const nav = (name) => page.getByRole('navigation', { name: x('Ansicht', 'View') }).getByRole('button', { name });
await page.goto(base + '/');
await nav(x('Aufgaben', 'Tasks')).waitFor();
await page.getByTestId('today-house').waitFor();
await snap(150);

// Schnell-Eingabe: Zeile Stück für Stück tippen, die Chips erscheinen
await page.getByRole('button', { name: x('Neue Aufgabe', 'New task'), exact: true }).click();
const title = page.getByLabel(x('Was steht an?', 'What needs doing?'));
const line = x('Blumen gießen morgen 19 Uhr @Ben #Haushalt jede Woche !!', 'Water the plants tomorrow 7pm @Ben #Home every week !!');
const stops = [line.indexOf(x(' morgen', ' tomorrow')), line.indexOf('@'), line.indexOf(x('jede', 'every')), line.length];
await snap(60);
let typed = 0;
for (const stop of stops) {
  await title.pressSequentially(line.slice(typed, stop), { delay: 15 });
  typed = stop;
  await snap(stop === line.length ? 220 : 70);
}
await page.getByRole('button', { name: x('Aufgabe anlegen', 'Create task'), exact: true }).click();
await page.getByTestId('tasks').waitFor();
await snap(130);

// Wächter: „Stups hat Geräte gefunden“, dann ein Gerät einrichten
await nav(x('Wächter', 'Watchers')).click();
await page.getByTestId('home-found').first().waitFor();
await snap(140);
await page.getByTestId('home-found').first().click();
await page.getByTestId('found-hit').first().waitFor();
await snap(160);
await page.getByTestId('found-search').fill('Bad Fenster');
const hit = page.getByTestId('found-hit').filter({ hasText: 'Bad Fenster Batterie' });
await hit.waitFor();
await snap(120);
await hit.getByRole('button', { name: x('Einrichten', 'Set up') }).click();
await page.getByTestId('graph-trend').waitFor();
await snap(200);
await page.getByRole('button', { name: x('Zurück', 'Back') }).first().click().catch(() => undefined);
await page.keyboard.press('Escape');

// Stupsen: eine Aufgabe öffnen, die Vorschläge passen zur Aufgabe
await nav(x('Aufgaben', 'Tasks')).click();
await page.getByTestId('scope-button').click();
await page.getByRole('menuitemradio', { name: x('Alle Aufgaben', 'All tasks') }).click();
await page.getByText(x('Fenster putzen', 'Clean the windows')).first().click();
await page.getByRole('dialog').getByRole('button', { name: x(/stupsen/, /^Nudge/) }).click();
await page.getByTestId('nudge-preview').waitFor();
await snap(190);
await page.getByRole('button', { name: x('Stups senden', 'Send nudge') }).click();
await page.getByRole('status').filter({ hasText: x('Gestupst', 'Nudged') }).waitFor();
await snap(160);

// Erledigen: Kreis links an der überfälligen Aufgabe, dann „Rückgängig“ im Hinweis
await nav(x('Aufgaben', 'Tasks')).click();
await page.getByRole('checkbox', { name: new RegExp(x('„Müll rausbringen“ erledigen', 'Complete .Take out the trash.')) }).click();
await page.getByRole('button', { name: x('Rückgängig', 'Undo') }).waitFor();
await snap(170);

// Kalender
await nav(x('Kalender', 'Calendar')).click();
await page.getByRole('radiogroup', { name: x('Ansicht', 'View') }).getByRole('radio', { name: x('Woche', 'Week'), exact: true }).click();
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
