import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Access, AccessResult } from '../access.js';
import type { Accounts } from '../accounts.js';
import type { AutomationEntry } from '../automation-cards.js';
import type { BetaGate } from '../beta-gate.js';
import type { Directory } from '../directory.js';
import { ValidationError } from '../errors.js';
import type { EventBus } from '../events.js';
import type { FileStore } from '../files.js';
import type { HaState, WatcherProbe } from '../ha.js';
import type { HousePush } from '../house.js';
import type { Passkeys } from '../passkeys.js';
import type { PushGateway } from '../push.js';
import type { Capabilities } from '../runtime.js';
import type { Store, User } from '../store.js';
import type { ExportResult } from '../transfer.js';
import type { WatcherData } from '../watcher-data.js';
import type { Watchers } from '../watchers.js';
import { t } from '../i18n/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
    /** Rolle und Zugriff des angemeldeten Home-Assistant-Benutzers */
    access: AccessResult | null;
  }
}

export interface ApiDeps {
  store: Store;
  /** Looks up the <title> of a page. Injected so tests need no network. */
  fetchTitle?: (url: string) => Promise<string | null>;
  /** Löst Google-Kurzlinks auf; null = nichts zu tun */
  resolveMapsLink?: (url: string) => Promise<{ url: string; title: string | null } | null>;
  /** Meldet Änderungen an alle verbundenen Geräte (Live-Sync). */
  bus?: EventBus;
  /** Räumt Push-Nachrichten auf, wenn eine Karte in der App erledigt wurde; tick stellt neue Stupse sofort zu. */
  notifier?: { clearFor(cardId: string): Promise<void>; tick?(): Promise<number> };
  ha?: {
    listDashboards(): Promise<{ title: string; path: string }[]>;
    listNotifyServices?(): Promise<string[]>;
    probeWatchers?(entityId?: string): Promise<WatcherProbe>;
    getStates?(): Promise<HaState[]>;
  };
  /** Haus-Kanäle (nur mit Verbindung zu Home Assistant): der Weg für Test und Ergebnis, `sync` gleicht das Abonnement auf die Heimkehr ab */
  house?: { push: HousePush; sync(): Promise<void>; entityOwners(): Promise<Map<string, string>> };
  /** Wächter (nur mit Verbindung zu Home Assistant) */
  watchers?: Pick<Watchers, 'view' | 'activity' | 'onSaved' | 'test' | 'resetCounter' | 'syncSubscriptions'>;
  watcherData?: WatcherData;
  /** Letzte Ereignisse stups_create_card mit Ergebnis (für die Diagnose) */
  automationLog?: () => AutomationEntry[];
  /** Personen und Administratoren aus Home Assistant; ohne sie gelten Personen als Administratoren */
  directory?: Directory;
  /** Zugriffsregeln; Vorgabe ergibt sich aus Store und Verzeichnis */
  access?: Access;
  /** Vorgabe aus den Add-on-Optionen */
  defaultDashboardPath?: string;
  /** Eigene Konten mit Passwort (Betrieb ohne Home Assistant); ohne sie gibt es keine Routen für die Benutzerverwaltung */
  accounts?: Accounts;
  passkeys?: Passkeys;
  /** Schalter für Push und Wächter in der Beta (in der normalen App nicht gesetzt oder ohne Wirkung) */
  betaGate?: BetaGate;
  /** Was in dieser Betriebsart verfügbar ist (Wächter, Sensoren, Push-Wege); die Oberfläche richtet sich danach */
  capabilities?: Capabilities;
  /** Push-Weg der Betriebsart; für Test-Nachricht und den Stand der Zustellung */
  push?: PushGateway;
  /** Push über ntfy: Adresse des Servers (für die Anleitung in der App) und wann der Testknopf zuletzt zurückgemeldet hat */
  ntfy?: { url: string; roundTrip: (personId: string) => string | null };
  /** Ablage für Anhänge, ohne sie gibt es keine Uploads */
  files?: FileStore;
  /** Schreibt Datenbank und Anhänge für den Umzug in eine andere App nach /share */
  exportData?: () => ExportResult;
}

export type Params = { id: string };

export function body(req: FastifyRequest): Record<string, any> {
  const b = req.body;
  if (b === undefined || b === null) return {};
  if (typeof b !== 'object' || Array.isArray(b)) throw new ValidationError(t('Der Inhalt der Anfrage muss ein Objekt sein'));
  return b as Record<string, any>;
}

/** Was alle Routen-Dateien (api/*.ts) gemeinsam brauchen: die Abhängigkeiten und die kleinen Hilfen aus api.ts */
export interface ApiKit {
  deps: ApiDeps;
  store: Store;
  access: Access;
  body: typeof body;
  requireAdmin: (req: FastifyRequest) => void;
  noContent: (reply: FastifyReply) => FastifyReply;
  fetchTitle: (url: string) => Promise<string | null>;
  resolveMapsLink: (url: string) => Promise<{ url: string; title: string | null } | null>;
}
