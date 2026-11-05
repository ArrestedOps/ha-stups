import type { Directory } from './directory.js';
import { PERMISSIONS, type Permission } from './permissions.js';
import type { Store, User } from './store.js';

export interface AccessResult {
  user: User;
  /** Darf Personen, Zugriff und Dashboard ändern: Administrator in Home Assistant */
  isAdmin: boolean;
  /** Darf die App benutzen */
  allowed: boolean;
  /** Hat die eingeschränkten Rechte eines Kindes (ein Administrator ist nie Kind, auch wenn es eingetragen ist) */
  isChild: boolean;
  /**
   * Was die Person zusätzlich darf (siehe permissions.ts): ein Administrator alles, ein Kind nichts, ein Mitglied nach Eintrag in der
   * Datenbank. Wer nicht in der Liste der Personen steht, hat nichts, egal was in der Datenbank steht.
   */
  permissions: Permission[];
}

export interface Access {
  evaluate(who: { id: string; name: string; displayName: string }): Promise<AccessResult>;
}

/**
 * Zugriffsregeln:
 * - „alle": jeder Home-Assistant-Benutzer darf die App öffnen.
 * - „nur freigegebene": nur Personen der Liste und Administratoren. Wer sonst öffnet, steht unter „Wartet auf Freigabe".
 * Administrator ist, wer es in Home Assistant ist. Sind die Rollen unbekannt (Home Assistant antwortet nicht), wird
 * niemand befördert: kein Administrator, ein Kind bleibt Kind (aus der Datenbank). Nur wenn es noch gar keine Person
 * gibt, darf der Erste einrichten. Ganz ohne Verzeichnis (lokale Entwicklung) gelten Personen als Administratoren.
 */
export function createAccess(deps: { store: Store; directory?: Directory }): Access {
  const { store, directory } = deps;
  return {
    async evaluate(who) {
      const user = store.resolveUser({ haId: who.id, name: who.name, displayName: who.displayName });
      const noPeople = store.people().length === 0;
      let isAdmin: boolean;
      if (!directory) isAdmin = user.isPerson || noPeople;
      else isAdmin = (await directory.isAdmin(who.id)) ?? noPeople; // unbekannte Rollen: keine Beförderung
      const allowed = store.getAccessMode() === 'everyone' || isAdmin || user.isPerson;
      const isChild = user.isChild && user.isPerson && !isAdmin;
      const permissions = isAdmin ? [...PERMISSIONS] : user.isPerson && !isChild ? store.permissionsOf(user.id) : [];
      return { user, isAdmin, allowed, isChild, permissions };
    },
  };
}
