/**
 * Der Pfeil rechts in einer Zeile (`ListRow`, Snippet `right`) gehört zum Antippbereich: Ein Tipp darauf macht dasselbe wie ein Tipp auf die
 * Zeile. Das gilt nur, wenn rechts **allein ein Pfeil** steht. Zeilen mit Schalter, Zahlenfeld, Foto, Wert oder Knopf rechts bleiben, wie sie sind.
 */
export interface RightProbe {
  /** Zahl der Symbole im rechten Bereich */
  icons: number;
  /** davon Pfeile nach rechts (`data-icon="chevron-right"`) */
  arrows: number;
  /** es gibt etwas zum Bedienen (Knopf, Link, Eingabe, Schalter) */
  interactive: boolean;
  /** sichtbarer Text im rechten Bereich */
  text: string;
}

export const arrowOnly = (p: RightProbe): boolean => p.icons === 1 && p.arrows === 1 && !p.interactive && p.text.trim() === '';

/** Die Angaben aus dem DOM (nur, was `arrowOnly` braucht) */
export function probeRight(el: Pick<Element, 'querySelectorAll' | 'querySelector' | 'textContent'>): RightProbe {
  return {
    icons: el.querySelectorAll('svg').length,
    arrows: el.querySelectorAll('svg[data-icon="chevron-right"]').length,
    interactive: el.querySelector('button, a, input, select, textarea, [role="switch"], [role="checkbox"], [role="button"]') !== null,
    text: el.textContent ?? '',
  };
}
