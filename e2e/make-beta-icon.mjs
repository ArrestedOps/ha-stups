// Erzeugt Symbol und Logo der Beta-App (stups-beta/icon.png, logo.png) aus denen der normalen App mit einem „BETA"-Band.
// Aufruf im Repository-Ordner: node e2e/make-beta-icon.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { webkit } from '@playwright/test';

const root = join(import.meta.dirname, '..');
const dataUrl = (file) => `data:image/png;base64,${readFileSync(join(root, file)).toString('base64')}`;
const BETA = '#5b5bf0';

const browser = await webkit.launch();
async function render(name, width, height, body) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;background:transparent}
      .wrap{position:relative;width:${width}px;height:${height}px;overflow:hidden}
      img{display:block;width:100%;height:100%}
      ${body.css}
    </style><div class="wrap"><img src="${dataUrl(body.src)}">${body.html}</div>`,
  );
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
  writeFileSync(join(root, 'stups-beta', name), png);
  await page.close();
}

// Symbol: diagonales Band in der unteren rechten Ecke, an der runden Form des Symbols abgeschnitten
await render('icon.png', 128, 128, {
  src: 'stups/icon.png',
  css: `.wrap{clip-path:inset(0 round 29px)}
        .band{position:absolute;right:-34px;bottom:15px;width:150px;padding:5px 0;background:${BETA};color:#fff;font:800 17px/1 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:2px;text-align:center;transform:rotate(-35deg);box-shadow:0 1px 3px rgba(0,0,0,.35)}`,
  html: '<div class="band">BETA</div>',
});

// Logo: Plakette neben dem Schriftzug
await render('logo.png', 1200, 330, {
  src: 'stups/logo.png',
  css: `.badge{position:absolute;left:902px;top:112px;padding:14px 30px;border-radius:22px;background:${BETA};color:#fff;font:800 70px/1 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:6px}`,
  html: '<div class="badge">BETA</div>',
});
await browser.close();
console.log('stups-beta/icon.png und stups-beta/logo.png geschrieben');
