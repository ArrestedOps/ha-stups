/**
 * Sicherheitsabstände (Statusleiste, Home-Balken) in der Home-Assistant-App.
 *
 * Stups läuft als Ingress-App in einem iframe. Seit Home Assistant 2026.8 polstert das App-Panel diesen iframe selbst mit den
 * Abständen: Dann endet die Seite über dem Rand, und darunter bleibt ein Streifen, den die Leiste unten nicht füllen kann.
 * Eine App kann das übernehmen: Sie schickt `home-assistant/subscribe-properties` mit `handleSafeArea: true` an das übergeordnete
 * Fenster. Das Panel füllt den iframe dann ganz aus und antwortet mit `home-assistant/properties` und `safeAreaInsets`
 * (top, right, bottom, left als Pixel-Text); bei Drehen des Geräts kommt eine neue Antwort.
 * Home Assistant vor 2026.8 kennt die Nachricht nicht und antwortet nicht: Dann gelten die Werte aus app.css (eingebettet 0).
 */

/**
 * Die Anmeldung bei Home Assistant. Home Assistant liest bei jeder Anmeldung `handleSafeArea` neu: Es muss in JEDER Anmeldung stehen,
 * auch in der für den Kiosk-Modus (Kopfzeile ausblenden), sonst schaltet die letzte Nachricht die Übernahme wieder ab.
 */
export function subscribeMessage(opts: { kioskMode?: boolean } = {}) {
  return { type: 'home-assistant/subscribe-properties', handleSafeArea: true, ...(opts.kioskMode ? { kioskMode: true } : {}) } as const;
}

export const SUBSCRIBE_MESSAGE = subscribeMessage();
export const UNSUBSCRIBE_MESSAGE = { type: 'home-assistant/unsubscribe-properties' } as const;

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Ein Abstand aus der Antwort: „34px“ oder eine Zahl; alles andere (auch unaufgelöstes env(), negative oder irre große Werte) ist 0 */
export function parseInset(value: unknown): number {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && /^\s*\d+(\.\d+)?px\s*$/.test(value)) n = parseFloat(value);
  else return 0;
  return Number.isFinite(n) && n >= 0 && n <= 300 ? n : 0;
}

/** Die Abstände aus einer Nachricht von Home Assistant; null, wenn es keine Antwort mit safeAreaInsets ist */
export function insetsFromMessage(data: unknown): Insets | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const msg = data as { type?: unknown; safeAreaInsets?: unknown };
  if (msg.type !== 'home-assistant/properties') return null;
  const s = msg.safeAreaInsets;
  if (typeof s !== 'object' || s === null || Array.isArray(s)) return null;
  const i = s as Record<string, unknown>;
  return { top: parseInset(i.top), right: parseInset(i.right), bottom: parseInset(i.bottom), left: parseInset(i.left) };
}

/**
 * Welcher Teil der Abstände liegt wirklich auf unserem iframe? Hat Home Assistant oben schon eine eigene Leiste (der iframe beginnt
 * darunter) oder endet der iframe über dem Rand, darf der Abstand dort nicht noch einmal gezählt werden. Ohne Lage des iframes
 * (anderer Ursprung, kein Zugriff) gelten die Werte unverändert.
 */
export function effectiveInsets(raw: Insets, frame: { top: number; bottom: number } | null, parentHeight: number | null): Insets {
  if (!frame || parentHeight === null) return raw;
  return {
    ...raw,
    top: Math.max(0, raw.top - Math.max(0, frame.top)),
    bottom: Math.max(0, raw.bottom - Math.max(0, parentHeight - frame.bottom)),
  };
}

/** Was startSafeArea von der Umgebung braucht (im Browser die echten Objekte, im Test Ersatz) */
export interface SafeAreaEnv {
  embedded: boolean;
  parent: unknown;
  /** Lage des iframes im übergeordneten Fenster, wenn der Zugriff erlaubt ist (gleicher Ursprung) */
  frameRect(): { top: number; bottom: number } | null;
  parentHeight(): number | null;
  postToParent(message: unknown): void;
  listen(fn: (e: { source: unknown; data: unknown }) => void): void;
  onResize(fn: () => void): void;
  setVar(name: string, value: string): void;
  addClass(name: string): void;
}

/** Meldet sich bei Home Assistant an und setzt --safe-top, --safe-bottom, --safe-left, --safe-right aus der Antwort */
export function startSafeArea(env: SafeAreaEnv): void {
  if (!env.embedded) return;
  let last: Insets | null = null;
  const apply = () => {
    if (!last) return;
    const v = effectiveInsets(last, env.frameRect(), env.parentHeight());
    env.setVar('--safe-top', `${v.top}px`);
    env.setVar('--safe-bottom', `${v.bottom}px`);
    env.setVar('--safe-left', `${v.left}px`);
    env.setVar('--safe-right', `${v.right}px`);
    env.addClass('safe-managed');
  };
  env.listen((e) => {
    if (e.source !== env.parent) return;
    const insets = insetsFromMessage(e.data);
    if (!insets) return;
    last = insets;
    apply();
  });
  env.onResize(apply);
  env.postToParent(SUBSCRIBE_MESSAGE);
}

/** Die Umgebung im Browser */
export function browserSafeAreaEnv(): SafeAreaEnv {
  const root = document.documentElement;
  const inFrame = (() => {
    try {
      return window.parent !== window;
    } catch {
      return true;
    }
  })();
  return {
    embedded: inFrame,
    parent: inFrame ? window.parent : null,
    frameRect() {
      try {
        const r = window.frameElement?.getBoundingClientRect();
        return r ? { top: r.top, bottom: r.bottom } : null;
      } catch {
        return null; // anderer Ursprung
      }
    },
    parentHeight() {
      try {
        return window.parent.innerHeight;
      } catch {
        return null;
      }
    },
    postToParent: (m) => window.parent.postMessage(m, '*'),
    listen: (fn) => window.addEventListener('message', (e) => fn({ source: e.source, data: e.data })),
    onResize: (fn) => window.addEventListener('resize', fn),
    setVar: (name, value) => root.style.setProperty(name, value),
    addClass: (name) => root.classList.add(name),
  };
}
