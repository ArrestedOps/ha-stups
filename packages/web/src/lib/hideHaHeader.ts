/**
 * Blendet die Kopfzeile von Home Assistant (Titel und Menü) für dieses Panel aus.
 *
 * Das geht, weil Stups unter derselben Adresse läuft wie Home Assistant: Die App darf in die Seite
 * darum hineinsehen, in der sie eingebettet ist. Es wirkt nur auf die Elemente rund um dieses eine Panel,
 * nie auf andere Seiten. Sieht danach etwas falsch aus (Seite zu klein), wird alles sofort zurückgenommen.
 */
const STYLE_ID = 'stups-hide-header';
// ha-panel-app (Add-on-Panel) baut die Kopfzeile als <div class="header"> und verkürzt dafür das iframe,
// hass-subpage nutzt <div class="toolbar">. Beides wird ausgeblendet und das iframe wieder voll groß gemacht.
const SELECTORS = '.header, .toolbar, .mdc-top-app-bar, .mdc-top-app-bar__row, header';
const CSS = `
  :host { --header-height: 0px !important; --mdc-top-app-bar-height: 0px !important; }
  ${SELECTORS} { display: none !important; }
  iframe { height: 100% !important; }
`;

const memoKey = 'stups.hideHaHeader';

export function isHeaderHidingWanted(): boolean {
  try {
    return localStorage.getItem(memoKey) !== 'off';
  } catch {
    return true;
  }
}

export function setHeaderHidingWanted(on: boolean): void {
  try {
    localStorage.setItem(memoKey, on ? 'on' : 'off');
  } catch {
    /* egal */
  }
}

/** Shadow-Roots aller Elemente, die unsere eingebettete Seite umgeben (von innen nach außen) */
function surroundingRoots(frame: Element): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  let node: Node | null = frame;
  while (node) {
    const el = node as Element;
    if (el.shadowRoot) roots.push(el.shadowRoot);
    const parent: Node | null = node.parentNode;
    node = parent && (parent as ShadowRoot).host && parent.nodeType === 11 ? (parent as ShadowRoot).host : parent;
  }
  return roots;
}

function containsComposed(outer: Element, inner: Element): boolean {
  let node: Node | null = inner;
  while (node) {
    if (node === outer) return true;
    const parent: Node | null = node.parentNode;
    node = parent && (parent as ShadowRoot).host && parent.nodeType === 11 ? (parent as ShadowRoot).host : parent;
  }
  return false;
}

/**
 * Offizieller Weg: Eine eingebettete App darf Home Assistant bitten, in den Kiosk-Modus zu wechseln.
 * HA blendet dann Kopfzeile und Seitenleiste aus und nimmt es zurück, sobald die App geschlossen wird.
 */
function requestKioskMode(on: boolean): void {
  try {
    if (window.parent === window) return;
    window.parent.postMessage(
      on ? { type: 'home-assistant/subscribe-properties', id: 1, kioskMode: true } : { type: 'home-assistant/unsubscribe-properties', id: 1 },
      window.location.origin,
    );
  } catch {
    /* egal */
  }
}

export function showHaHeader(): void {
  requestKioskMode(false);
  try {
    const frame = window.frameElement;
    if (!frame) return;
    for (const root of surroundingRoots(frame)) root.getElementById(STYLE_ID)?.remove();
  } catch {
    /* kein Zugriff */
  }
}

/** true, wenn die Kopfzeile jetzt ausgeblendet ist */
export function hideHaHeader(): boolean {
  try {
    const frame = window.frameElement;
    if (!frame || window.parent === window) return false;
    let applied = false;
    for (const root of surroundingRoots(frame)) {
      if (root.getElementById(STYLE_ID)) {
        applied = true;
        continue;
      }
      // Nur Kopfzeilen ausblenden, die unsere Seite nicht selbst enthalten, sonst verschwände die ganze App
      const candidates = [...root.querySelectorAll(SELECTORS)];
      const hasHeader = candidates.some((c) => !containsComposed(c, frame));
      if (!hasHeader) continue;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      root.appendChild(style);
      applied = true;
    }
    return applied;
  } catch {
    return false;
  }
}

/**
 * Blendet die Kopfzeile aus, sobald sie da ist (Home Assistant baut sie kurz nach uns auf), und nimmt es
 * zurück, falls unsere Seite danach auffällig klein ist.
 */
export function applyHeaderHiding(): void {
  if (!isHeaderHidingWanted()) return;
  requestKioskMode(true);
  let tries = 0;
  const attempt = () => {
    tries += 1;
    const done = hideHaHeader();
    if (done) {
      setTimeout(() => {
        const frame = window.frameElement as HTMLElement | null;
        if (frame && frame.getBoundingClientRect().height < 200) showHaHeader();
      }, 600);
    } else if (tries < 8) {
      setTimeout(attempt, 500 * tries);
    }
  };
  attempt();
}
