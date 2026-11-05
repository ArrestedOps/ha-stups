/** Was sich mit der Tastatur erreichen lässt */
export const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Fokusfalle: Wohin springt der Fokus bei Tab (oder Umschalt+Tab) in einem Fenster mit `count` erreichbaren Elementen,
 * wenn gerade `current` den Fokus hat (-1: nichts davon)? null = der Browser darf selbst weiterspringen.
 */
export function wrapTarget(count: number, current: number, backwards: boolean): number | null {
  if (count === 0) return null;
  if (backwards) return current <= 0 ? count - 1 : null;
  return current === -1 || current >= count - 1 ? 0 : null;
}

/**
 * Fokus in ein Fenster (Sheet) legen: beim Öffnen hinein, Tab bleibt darin, beim Schließen zurück an den Auslöser.
 * `isTop`: nur das oberste von mehreren übereinander liegenden Fenstern fängt Tab.
 */
export function focusScope(node: HTMLElement, opts: { isTop?: () => boolean } = {}) {
  const trigger = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  // Hat ein Feld im Fenster den Fokus schon selbst genommen (autofocus), bleibt er dort
  queueMicrotask(() => {
    if (!node.contains(document.activeElement)) node.focus({ preventScroll: true });
  });

  function visible(el: HTMLElement): boolean {
    return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || e.defaultPrevented || opts.isTop?.() === false) return;
    const list = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
    if (list.length === 0) {
      e.preventDefault();
      node.focus({ preventScroll: true });
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const target = wrapTarget(list.length, active ? list.indexOf(active) : -1, e.shiftKey);
    if (target !== null) {
      e.preventDefault();
      list[target]!.focus();
    }
  }
  node.addEventListener('keydown', onKeydown);

  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
      const active = document.activeElement;
      // Zurück an den Auslöser, solange der Fokus nicht schon woanders (absichtlich) liegt
      if (trigger && trigger.isConnected && (!active || active === document.body || node.contains(active))) trigger.focus({ preventScroll: true });
    },
  };
}
