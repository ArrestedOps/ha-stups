// Baut das Stups-Logo (Zeichen + Schriftzug auf dunkler Fläche, damit der Text auf hellem und dunklem Grund lesbar ist).
// Aufruf im Repository-Ordner: node dev/logo.mjs
// Das Zeichen (Kachel mit Häkchen und Sprungbahn) kommt aus docs/images/stups-icon.png.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { webkit } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const icon = pathToFileURL(join(root, 'docs', 'images', 'stups-icon.png')).href;

const html = `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; background: transparent; }
  .plate { width: 1200px; height: 330px; box-sizing: border-box; border-radius: 72px; background: linear-gradient(135deg, #1b181d, #0e0d10);
    display: flex; align-items: center; padding: 0 70px 0 38px; gap: 48px; }
  .plate img { width: 262px; height: 262px; }
  .word { font: 900 196px/1 'Arial Black', 'Segoe UI Black', Impact, sans-serif; letter-spacing: 0.005em; color: #fff4ec; padding-bottom: 14px; }
  .word i { font-style: normal; color: #ff6a1f; }
</style>
<div class="plate"><img src="${icon}"><div class="word">stups<i>.</i></div></div>`;

const dir = mkdtempSync(join(tmpdir(), 'stups-logo-'));
const page = join(dir, 'logo.html');
writeFileSync(page, html);

const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 330 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.goto(pathToFileURL(page).href);
await p.waitForTimeout(300);
const shot = await p.locator('.plate').screenshot({ omitBackground: true });
await browser.close();

for (const target of [join(root, 'docs', 'images', 'stups-logo.png'), join(root, 'stups', 'logo.png')]) {
  writeFileSync(target, shot);
  console.log('geschrieben:', target);
}
