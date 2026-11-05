/**
 * Wohin der Home-Knopf führt: das Dashboard, das die Person gewählt hat; sonst das Standard-Dashboard, das sie in Home Assistant eingestellt hat
 * (Browser-Speicher der Home-Assistant-Seite, Schlüssel `defaultPanel`); sonst die Option `dashboard_path` der App; sonst „/".
 */

export const DASHBOARD_PATH_MAX = 200;

/** Ein Pfad auf Home Assistant selbst: beginnt mit „/", kein „//" am Anfang, kein Schema, kein „\", keine Leer- oder Steuerzeichen, höchstens 200 Zeichen (wie im Server) */
export function isDashboardPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= DASHBOARD_PATH_MAX &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !value.includes('://') &&
    ![...value].some((ch) => ch <= ' ' || ch === '\u007f')
  );
}

export type DashboardSource = 'person' | 'ha' | 'addon' | 'root';

export interface DashboardInput {
  /** die Wahl der Person (null oder fehlend: nichts gewählt) */
  person?: string | null;
  /** das in Home Assistant eingestellte Standard-Dashboard (Kennung wie `lovelace` oder `dashboard-handy`), wenn lesbar */
  haDefaultPanel?: string | null;
  /** die Option der App (`dashboard_path`) */
  addon?: string | null;
}

/** Die Kennung eines Dashboards in Home Assistant: Buchstaben, Ziffern, Bindestrich, Unterstrich */
const PANEL = /^[A-Za-z0-9_-]{1,100}$/;

export function resolveDashboardPath(input: DashboardInput): { path: string; source: DashboardSource } {
  if (isDashboardPath(input.person)) return { path: input.person, source: 'person' };
  if (typeof input.haDefaultPanel === 'string' && PANEL.test(input.haDefaultPanel)) return { path: `/${input.haDefaultPanel}`, source: 'ha' };
  if (isDashboardPath(input.addon)) return { path: input.addon, source: 'addon' };
  return { path: '/', source: 'root' };
}

/**
 * Das Standard-Dashboard aus den Einstellungen von Home Assistant: dessen Seite liegt unter demselben Ursprung wie Stups (Ingress), also
 * liest `window.parent.localStorage` den Schlüssel `defaultPanel` (JSON-Text, zum Beispiel "lovelace"). Alles, was schiefgeht, ergibt null.
 */
export function readHaDefaultPanel(win: { parent: Window } | undefined = typeof window === 'undefined' ? undefined : window): string | null {
  try {
    if (!win || win.parent === (win as unknown as Window)) return null;
    const raw = win.parent.localStorage.getItem('defaultPanel');
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return typeof value === 'string' && PANEL.test(value) ? value : null;
  } catch {
    return null;
  }
}
