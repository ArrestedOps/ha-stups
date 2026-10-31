/** Lässt ein Textfeld mit dem Inhalt wachsen (field-sizing kennen nicht alle iPhones). */
export function autogrow(node: HTMLTextAreaElement, _value?: unknown) {
  const fit = () => {
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  };
  fit();
  node.addEventListener('input', fit);
  return {
    update: fit,
    destroy() {
      node.removeEventListener('input', fit);
    },
  };
}
