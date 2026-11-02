/**
 * Waagerecht scrollende Leiste (Spalten-Tabs, Filter-Chips):
 * - setzt data-fade-start / data-fade-end, damit ein Verlauf am Rand zeigt, dass man wischen kann (app.css, .edge-fade)
 * - holt die aktive Auswahl (aria-selected oder aria-pressed) in den sichtbaren Bereich, wenn sich `key` ändert
 */
export function fadeState(scrollLeft: number, scrollWidth: number, clientWidth: number): { start: boolean; end: boolean } {
  const max = scrollWidth - clientWidth;
  return { start: scrollLeft > 2, end: max > 2 && scrollLeft < max - 2 };
}

/** Wie weit die Leiste scrollen muss, damit das Element (Rechteck relativ zum Fenster) in der Leiste sichtbar ist; 0 = schon sichtbar */
export function revealDelta(item: { left: number; right: number }, strip: { left: number; right: number }, pad = 12): number {
  if (item.left < strip.left + pad) return item.left - strip.left - pad;
  if (item.right > strip.right - pad) return item.right - strip.right + pad;
  return 0;
}

export function scrollStrip(node: HTMLElement, _key?: unknown) {
  const update = () => {
    const f = fadeState(node.scrollLeft, node.scrollWidth, node.clientWidth);
    node.dataset.fadeStart = String(f.start);
    node.dataset.fadeEnd = String(f.end);
  };
  const reveal = () => {
    const active = node.querySelector<HTMLElement>('[aria-selected="true"], [aria-pressed="true"]');
    if (!active) return;
    const delta = revealDelta(active.getBoundingClientRect(), node.getBoundingClientRect());
    if (delta !== 0) node.scrollBy({ left: delta });
    update();
  };

  node.classList.add('edge-fade');
  node.addEventListener('scroll', update, { passive: true });
  const observer = new ResizeObserver(update);
  observer.observe(node);
  update();
  // nach dem ersten Aufbau (Schriften und Zahlen können die Breite noch ändern)
  const frame = requestAnimationFrame(reveal);

  return {
    update() {
      requestAnimationFrame(reveal);
    },
    destroy() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      node.removeEventListener('scroll', update);
    },
  };
}
