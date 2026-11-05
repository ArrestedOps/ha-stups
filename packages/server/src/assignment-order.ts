import type { AssignMode, AssignRule } from './watcher-types.js';

/** Eine Person im Kreis eines Wächters: ob sie zu Hause ist (null = nicht zu erkennen) und ob sie als Nächstes dran ist */
export interface OrderEntry {
  id: string;
  present: boolean | null;
  next: boolean;
}

export interface OrderView {
  mode: AssignMode;
  /** Der Kreis in der Reihenfolge, in der die Karten verteilt werden, wer als Nächstes dran ist zuerst */
  circle: OrderEntry[];
  /** Es gibt eine Reihenfolge (reihum): die Oberfläche zeichnet Pfeile dazwischen */
  ordered: boolean;
  /** Wie viele aus dem Kreis zu Hause sind; null, wenn sich niemand zuordnen lässt (kein Home Assistant, keine HA-Person) */
  home: number | null;
}

/** Der Kreis eines Wächters: die gewählten Personen, sonst alle (wie bei der Zuweisung) */
export function circleOf(rule: Pick<AssignRule, 'personIds'>, people: { id: string }[]): string[] {
  const eligible = new Set(people.map((p) => p.id));
  const order = rule.personIds.length > 0 ? rule.personIds : people.map((p) => p.id);
  return order.filter((id) => eligible.has(id));
}

/**
 * Die Reihenfolge für die Oberfläche („An wen"). Rechnet nichts weiter: `nextId` kommt aus der Zuweisung (`decide`), die Rotation
 * rückt nicht vor. Bei reihum steht die Person, die als Nächstes dran ist, vorn und die anderen folgen im Kreis.
 */
export function orderView(input: { rule: Pick<AssignRule, 'mode' | 'personIds'>; people: { id: string }[]; present: Map<string, boolean | null>; nextId: string | null }): OrderView {
  const pool = circleOf(input.rule, input.people);
  const ordered = input.rule.mode === 'rotation' || input.rule.mode === 'rotation_present';
  const start = ordered && input.nextId ? pool.indexOf(input.nextId) : -1;
  const rotated = start > 0 ? [...pool.slice(start), ...pool.slice(0, start)] : pool;
  const circle = rotated.map((id) => ({ id, present: input.present.get(id) ?? null, next: ordered && id === input.nextId }));
  const known = circle.filter((e) => e.present !== null);
  return { mode: input.rule.mode, circle, ordered, home: known.length === 0 ? null : known.filter((e) => e.present).length };
}
