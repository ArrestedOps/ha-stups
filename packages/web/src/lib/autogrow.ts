/** Lässt ein Textfeld mit dem Inhalt wachsen (field-sizing kennen nicht alle iPhones). Ändert sich die Breite (Bildlaufleiste, Fenstergröße), wird neu gemessen. */
export function autogrow(node: HTMLTextAreaElement, _value?: unknown) {
  const fit = () => {
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  };
  fit();
  // bind:value setzt den Inhalt erst nach dem Einhängen: danach noch einmal messen (sonst bleibt ein langer Titel einzeilig)
  const later = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fit) : 0;
  node.addEventListener('input', fit);
  // Lädt die Schrift erst jetzt (Inter), ändert sich die Zeilenbreite des Textes, nicht die des Feldes
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  fonts?.addEventListener?.('loadingdone', fit);
  void fonts?.ready?.then(fit);
  let width = node.clientWidth;
  const watch =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (node.clientWidth === width) return;
          width = node.clientWidth;
          fit();
        });
  watch?.observe(node);
  return {
    update: fit,
    destroy() {
      node.removeEventListener('input', fit);
      watch?.disconnect();
      fonts?.removeEventListener?.('loadingdone', fit);
      if (later && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(later);
    },
  };
}
