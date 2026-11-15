import { valueText, type EntityHistory } from './history';

/**
 * Gemeinsam einrichten: was sich je Gerät aus dem Verlauf lesen lässt, ohne dass der Server mehr kann als heute. Jedes Gerät hat denselben Auslöser;
 * hier steht nur, ob er beim aktuellen Wert jetzt auslösen würde und wie der Wert aussieht.
 */
export interface DeviceRule {
  kind: string;
  to: string;
  value: string;
}

const num = (s: string | null | undefined): number | null => {
  if (s === null || s === undefined || s.trim() === '') return null;
  const n = Number(s.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Gilt die Bedingung beim aktuellen Wert schon? null, wenn sich das nicht sagen lässt (kein Verlauf, Kalender, Vorhersage) */
export function deviceMet(rule: DeviceRule, h: EntityHistory | null): boolean | null {
  const current = h?.current ?? null;
  if (current === null || current === 'unknown' || current === 'unavailable') return null;
  if (rule.kind === 'state') return rule.to.trim() === '' ? null : current === rule.to.trim();
  if (rule.kind === 'below' || rule.kind === 'above') {
    const v = num(current);
    const limit = num(rule.value);
    if (v === null || limit === null) return null;
    return rule.kind === 'below' ? v < limit : v > limit;
  }
  return null;
}

/** Der aktuelle Wert mit Einheit („14 %“); „–“, wenn es keinen gibt */
export const deviceValue = (h: EntityHistory | null, unit: string | null | undefined): string => valueText(h?.current ?? null, h?.kind === 'state' ? null : (unit ?? null)) || '–';
