import type { Directory } from './directory.js';
import type { Store, User } from './store.js';

export interface AccessResult {
  user: User;
  /** Darf Personen, Zugriff und Dashboard ändern: Administrator in Home Assistant */
  isAdmin: boolean;
  /** Darf die App benutzen */
  allowed: boolean;
  /** Hat die eingeschränkten Rechte eines Kindes (ein Administrator ist nie Kind, auch wenn es eingetragen ist) */
  isChild: boolean;
}

export interface Access {
  evaluate(who: { id: string; name: string; displayName: string }): Promise<AccessResult>;
}

/**
 * Zugriffsregeln:
 * - „alle": jeder Home-Assistant-Benutzer darf die App öffnen.
 * - „nur freigegebene": nur Personen der Liste und Administratoren. Wer sonst öffnet, steht unter „Wartet auf Freigabe".
 * Administrator ist, wer es in Home Assistant ist. Liefert Home Assistant die Benutzerliste nicht, gelten die
 * Personen der Liste als Administratoren, und gibt es noch gar keine Person, darf der Erste einrichten.
 */
export function createAccess(deps: { store: Store; directory?: Directory }): Access {
  const { store, directory } = deps;
  return {
    async evaluate(who) {
      const user = store.resolveUser({ haId: who.id, name: who.name, displayName: who.displayName });
      const fromHa = directory ? await directory.isAdmin(who.id) : null;
      const noPeople = store.people().length === 0;
      const isAdmin = fromHa ?? (user.isPerson || noPeople);
      const allowed = store.getAccessMode() === 'everyone' || isAdmin || user.isPerson;
      const isChild = user.isChild && user.isPerson && !isAdmin;
      return { user, isAdmin, allowed, isChild };
    },
  };
}
