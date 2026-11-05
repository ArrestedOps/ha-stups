/**
 * Auf dem iPhone ändert die Bildschirmtastatur das Layout-Fenster nicht, nur die sichtbare Fläche (visualViewport).
 * Ein unten verankertes Sheet läge sonst hinter der Tastatur. Hier steht, wie weit es hochrücken muss
 * und wie hoch es höchstens sein darf.
 */
export interface SheetInsets {
  /** Abstand zum unteren Rand des Layout-Fensters in px (0 = keine Tastatur) */
  bottom: number;
  /** Höchstens so hoch, damit Kopfzeile und Eingabefeld sichtbar bleiben */
  maxHeight: number | null;
}

export function sheetInsets(innerHeight: number, vvHeight: number, vvOffsetTop: number): SheetInsets {
  const hidden = Math.round(innerHeight - vvHeight - vvOffsetTop);
  // Kleine Abweichungen (Adressleiste, Rundung) sind keine Tastatur
  if (hidden < 80) return { bottom: 0, maxHeight: null };
  return { bottom: hidden, maxHeight: Math.max(240, Math.round(vvHeight - 12)) };
}

/**
 * Desktop ab 1024 px Breite (Tailwind `lg:`). Alles, was nur anders aussieht, löst `lg:` in CSS; diese Abfrage brauchen nur die Stellen,
 * an denen die Logik unterscheidet (Detailspalte statt Sheet, Ziehen mit der Maus, Seitenleiste statt Leiste unten).
 */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/** Das Fenster, das die Abfrage beantwortet (matchMedia): im Test und auf dem Server gibt es keins */
export interface MediaWatcher {
  matches: boolean;
  addEventListener(type: 'change', listener: (e: { matches: boolean }) => void): void;
  removeEventListener(type: 'change', listener: (e: { matches: boolean }) => void): void;
}

const defaultMatchMedia = (query: string): MediaWatcher | null => (typeof matchMedia === 'function' ? matchMedia(query) : null);

/** Ist das Fenster jetzt breit genug für die Desktop-Ansicht? Ohne matchMedia (Server, Test) nein. */
export function isDesktop(match: (query: string) => MediaWatcher | null = defaultMatchMedia): boolean {
  return match(DESKTOP_QUERY)?.matches ?? false;
}

/**
 * Meldet den Zustand sofort und bei jedem Wechsel über die 1024 px. Gibt die Funktion zurück, die das Beobachten beendet
 * (ohne matchMedia passiert nichts und sie ist leer).
 */
export function watchDesktop(onchange: (desktop: boolean) => void, match: (query: string) => MediaWatcher | null = defaultMatchMedia): () => void {
  const mq = match(DESKTOP_QUERY);
  if (!mq) return () => undefined;
  const on = (e: { matches: boolean }) => onchange(e.matches);
  onchange(mq.matches);
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
}
