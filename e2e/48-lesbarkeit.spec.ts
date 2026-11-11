import { expect, test, type Page } from '@playwright/test';
import { openBoards } from './helpers';

/**
 * Lesbarkeit und Bedienung unter ungünstigen Umständen: Tastatur, kleine Bildschirme, vergrößerte Schrift und lange deutsche Wörter.
 * Eine Schriftvergrößerung auf 150 % entspricht für das Layout einer Breite von 390 / 1,5 = 260 CSS-Pixeln; darum wird bei 320 (kleines
 * Handy) und 260 Pixeln Breite geprüft. Gemeint ist: nichts ragt seitlich heraus, nichts ist abgeschnitten, jeder Knopf bleibt erreichbar.
 * Farbe spielt keine Rolle: läuft nur im dunklen Projekt.
 */
// Playwright verlangt hier ein Destructuring-Muster als erstes Argument, auch wenn keine Fixture gebraucht wird
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'dunkel', 'Farbe spielt hier keine Rolle, einmal reicht');
});

const LANG = 'Donaudampfschifffahrtsgesellschaftskapitänsmützenreinigung nachreichen und Steuererklärungsunterlagen vollständig zusammenstellen';
const BOARD = 'Wochenendhausrenovierungsvorbereitungen';

/** Was seitlich herausragt: die Seite selbst und jedes sichtbare Element, das über den rechten oder linken Rand hinausgeht */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > w) out.push(`Seite scrollt seitlich (${document.documentElement.scrollWidth} > ${w})`);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || style.position === 'fixed') continue;
      // in einer eigenen Scrollleiste (Reiter, Chips) darf Inhalt hinausreichen; gemeint ist, was die Seite selbst verbreitert
      let clipped = false;
      for (let p: HTMLElement | null = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;
      if (r.right > w + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''} ${Math.round(r.left)}..${Math.round(r.right)} von ${w}`);
    }
    return out.slice(0, 8);
  });
}

/** Alle sichtbaren Knöpfe und Felder liegen mit ihrem ganzen Rahmen im Bild und haben einen Namen für Vorlese-Programme */
async function reachable(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const bad: string[] = [];
    const root = document.querySelector('[role=dialog]:last-of-type') ?? document.body;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role=button], [role=checkbox], [role=radio], [role=tab]'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
      let scroller = false;
      for (let p: HTMLElement | null = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll') scroller = true;
      }
      const name = (el.getAttribute('aria-label') || el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute('title') || '').trim();
      if (!name && !(el as HTMLInputElement).labels?.length) bad.push(`ohne Namen: ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
      if (!scroller && (r.left < -1 || r.right > w + 1)) bad.push(`außerhalb: ${name.slice(0, 30)} ${Math.round(r.left)}..${Math.round(r.right)} von ${w}`);
    }
    return bad.slice(0, 8);
  });
}

for (const width of [320, 260]) {
  test(`Schmal (${width} px, entspricht großer Schrift): Aufgaben, Boards, Neue Aufgabe und Einstellungen mit langen Wörtern`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 640 });
    const board = (await (await request.post('/api/boards', { data: { name: BOARD } })).json()) as { id: string };
    const view = (await (await request.get(`/api/boards/${board.id}`)).json()) as { columns: { id: string }[] };
    await request.post(`/api/boards/${board.id}/cards`, { data: { columnId: view.columns[0]!.id, title: LANG, dueAt: new Date(Date.now() + 2 * 3600_000).toISOString(), description: LANG + ' ' + LANG } });
    await page.addInitScript((id) => localStorage.setItem('stups.board', id), board.id);
    await page.goto('/');

    // Aufgaben
    await expect(page.getByTestId('tasks')).toBeVisible();
    expect(await overflow(page), 'Aufgaben').toEqual([]);
    expect(await reachable(page), 'Aufgaben: Bedienelemente').toEqual([]);

    // Boards
    await openBoards(page);
    // schmal sind die Spalten Reiter; die Karte hat einen Termin und liegt unter „Geplant"
    await page.getByRole('tab', { name: /^Geplant/ }).click();
    await expect(page.getByText(LANG.slice(0, 30)).first()).toBeVisible();
    expect(await overflow(page), 'Boards').toEqual([]);
    expect(await reachable(page), 'Boards: Bedienelemente').toEqual([]);

    // Karte öffnen: Titel und Beschreibung mit langen Wörtern
    await page.getByText(LANG.slice(0, 30)).first().click();
    const detail = page.getByRole('dialog').last();
    await expect(detail).toBeVisible();
    expect(await overflow(page), 'Karte').toEqual([]);
    expect(await reachable(page), 'Karte: Bedienelemente').toEqual([]);
    await page.keyboard.press('Escape');

    // Neue Aufgabe mit langem Titel
    await page.getByRole('button', { name: 'Neue Karte', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Neue Aufgabe' });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel('Was steht an?').fill(LANG);
    expect(await overflow(page), 'Neue Aufgabe').toEqual([]);
    expect(await reachable(page), 'Neue Aufgabe: Bedienelemente').toEqual([]);
    await page.keyboard.press('Escape');

    // Einstellungen
    await page.getByRole('button', { name: 'Einstellungen öffnen' }).click();
    await expect(page.getByRole('dialog').getByText('Einstellungen', { exact: true }).first()).toBeVisible();
    expect(await overflow(page), 'Einstellungen').toEqual([]);
    expect(await reachable(page), 'Einstellungen: Bedienelemente').toEqual([]);
  });
}

test('Tastatur: Tab führt nacheinander zu sichtbaren, benannten Bedienelementen; Escape schließt Fenster und gibt den Fokus zurück', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('tasks')).toBeVisible();
  const seen: string[] = [];
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const name = (el.getAttribute('aria-label') || el.textContent || (el as HTMLInputElement).placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return { name, visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth, tag: el.tagName.toLowerCase() };
    });
    expect(f, `Tab ${i + 1}: Fokus verloren`).not.toBeNull();
    expect(f!.visible, `Tab ${i + 1}: ${f!.name} ist nicht im Bild`).toBe(true);
    expect(f!.name, `Tab ${i + 1}: ${f!.tag} ohne Namen`).not.toBe('');
    seen.push(f!.name);
  }
  // es wandert wirklich weiter (kein Hängenbleiben auf einem Element)
  expect(new Set(seen).size, seen.join(' | ')).toBeGreaterThan(6);

  // Einstellungen mit der Tastatur öffnen und schließen: der Fokus kehrt zum Auslöser zurück
  const avatar = page.getByRole('button', { name: 'Einstellungen öffnen' });
  await avatar.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(avatar).toBeFocused();
});
