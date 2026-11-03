/** Wer darf eine Anfrage eines Kindes bestätigen? Spiegelt die Regel im Server (store/confirmation.ts); der Server entscheidet am Ende. */
export interface ConfirmPerson {
  id: string;
  isChild: boolean;
}

export function mayConfirm(
  me: ConfirmPerson | null,
  isAdmin: boolean,
  child: { id: string; confirmers: string[] } | undefined,
): boolean {
  if (!me || me.isChild || me.id === child?.id) return false;
  if (isAdmin) return true;
  if (!child) return false;
  // Ohne Auswahl dürfen alle Erwachsenen, sonst nur die Gewählten
  return child.confirmers.length === 0 || child.confirmers.includes(me.id);
}

/** Wartet die Karte auf eine Bestätigung? */
export const waitingForConfirmation = (card: { confirmRequestedAt: string | null; completedAt: string | null }): boolean =>
  card.confirmRequestedAt !== null && card.completedAt === null;
