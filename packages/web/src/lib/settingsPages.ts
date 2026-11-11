import { t } from './i18n/index.svelte';
import { mayDo, type Permission } from './permissions';

/** Die Unterseiten der Einstellungen */
export type SettingsPageId =
  | 'notifications'
  | 'look'
  | 'account'
  | 'people'
  | 'watchers'
  | 'templates'
  | 'icons'
  | 'dates'
  | 'dashboard'
  | 'bubble'
  | 'times'
  | 'voice'
  | 'report'
  | 'data'
  | 'feedback'
  | 'beta';

/** Was über die Sichtbarkeit entscheidet: Rolle und Betriebsart (aus dem Store, hier als Werte, damit es sich testen lässt) */
export interface SettingsCtx {
  isAdmin: boolean;
  isChild: boolean;
  /** Was ein Administrator dieser Person zusätzlich erlaubt hat (die Antwort des Servers; Administrator: alles, Kind: nichts) */
  permissions: readonly Permission[];
  /** eigener Container mit eigener Anmeldung */
  standalone: boolean;
  beta: boolean;
  /** Push gibt es in dieser Betriebsart */
  push: boolean;
  /** Wächter gibt es (Add-on oder Container mit Home Assistant) */
  watchers: boolean;
  /** Stups läuft als Add-on in Home Assistant */
  haUi: boolean;
  /** Haus-Kanäle (Ansage, Lampe) gibt es */
  house: boolean;
  /** Umzug zwischen zwei Add-ons (nur im Add-on) */
  migration: boolean;
}

export interface SettingsGroup {
  id: 'me' | 'household' | 'ha' | 'help';
  title: string;
  pages: { id: SettingsPageId; title: string; icon: string }[];
  /** Zeilen, die gleich etwas tun statt eine Unterseite zu öffnen: HA-Kopfzeile ausblenden (Home Assistant), Einrichtung nochmal durchgehen (Hilfe und Daten) */
  actions?: ('header' | 'onboarding')[];
}

/**
 * Die Gruppen der Einstellungen für diese Person: „Für mich" (alle), „Haushalt" und „Home Assistant" (Administratoren; ein Mitglied
 * mit Berechtigungen sieht die Seiten, für die es eine hat), „Hilfe und Daten". Ein Kind sieht nur Sprache und Farbe (und im eigenen
 * Container die Abmeldung); eine Gruppe ohne Seiten fehlt. Der Dashboard-Button (Panel-Pfad) und der Umzug bleiben Administratoren vorbehalten.
 */
export function settingsGroups(ctx: SettingsCtx): SettingsGroup[] {
  const admin = ctx.isAdmin && !ctx.isChild;
  const may = (key: Permission) => mayDo(ctx, key);
  const page = (id: SettingsPageId, title: string, icon: string, show: boolean) => (show ? [{ id, title, icon }] : []);
  const groups: SettingsGroup[] = [
    {
      id: 'me',
      title: t('Für mich'),
      pages: [
        ...page('notifications', t('Benachrichtigungen'), 'bell', ctx.push && !ctx.isChild),
        ...page('look', t('Sprache und Farbe'), 'settings', true),
        ...page('account', t('Konto und Anmeldung'), 'lock', ctx.standalone),
      ],
    },
    {
      id: 'household',
      title: t('Haushalt'),
      pages: [
        // Dort stehen auch die Haus-Kanäle je Person: wer „house“ hat, braucht die Seite ebenfalls
        ...page('people', t('Personen & Zugriff'), 'user', may('people') || (may('house') && ctx.house)),
        ...page('watchers', t('Wächter'), 'eye', may('watchers') && ctx.watchers),
        ...page('templates', t('Vorlagen'), 'columns', may('settings')),
        ...page('icons', t('Symbole'), 'spark', may('settings')),
        ...page('dates', t('Termine'), 'clock', may('settings')),
        ...page('times', t('Erinnerungszeiten'), 'bell', may('settings') && ctx.push),
      ],
    },
    {
      id: 'ha',
      title: t('Home Assistant'),
      pages: [
        // Das Dashboard des Home-Knopfs wählt jede Person selbst (kein Kind: es bekommt immer den Standard)
        ...page('dashboard', t('Dashboard'), 'home', ctx.haUi && !ctx.isChild),
        ...page('bubble', t('Dashboard-Button'), 'layers', admin && ctx.haUi),
        ...page('voice', t('Ansage und Lampe'), 'bell', may('house') && ctx.house),
      ],
    },
    {
      id: 'help',
      title: t('Hilfe und Daten'),
      pages: [
        ...page('report', t('Warum kommt nichts an?'), 'message', ctx.push && !ctx.isChild),
        ...page('data', admin && ctx.migration ? t('Papierkorb, Archiv, Umzug') : t('Papierkorb und Archiv'), 'archive', !ctx.isChild),
        // Die Liste der Rückmeldungen (die Zeile „Feedback & Ideen" zum Senden steht oben in der Übersicht, für jede Person)
        ...page('feedback', t('Feedback der Nutzer'), 'message', may('feedback')),
        ...page('beta', t('Beta'), 'flag', ctx.beta && !ctx.isChild),
      ],
    },
  ];
  return groups.filter((g) => g.pages.length > 0);
}

/**
 * Die Übersicht der Einstellungen: wie `settingsGroups`, dazu im Add-on in der Gruppe „Home Assistant" für **jede** Rolle „HA-Kopfzeile ausblenden".
 * „Zurück zum Dashboard" ist jetzt der Home-Knopf in der Kopfzeile; sein Ziel wählt jede Person auf der Seite „Dashboard".
 */
export function settingsOverview(ctx: SettingsCtx): SettingsGroup[] {
  // Die Zeile „Wächter" entfällt hier (Reiter Wächter, dort „Alle Wächter verwalten"); die Seite selbst bleibt
  const base = settingsGroups(ctx)
    .map((g) => ({ ...g, pages: g.pages.filter((p) => p.id !== 'watchers') }))
    .filter((g) => g.pages.length > 0)
    // „Einrichtung nochmal durchgehen" steht in „Hilfe und Daten" (für jeden, der die Gruppe sieht; ein Kind sieht sie nicht)
    .map((g): SettingsGroup => (g.id === 'help' ? { ...g, actions: [...(g.actions ?? []), 'onboarding'] } : g));
  if (!ctx.haUi) return base;
  const header: SettingsGroup['actions'] = ['header'];
  const have = base.find((g) => g.id === 'ha');
  if (have) return base.map((g) => (g === have ? { ...g, actions: [...(g.actions ?? []), ...header!] } : g));
  const ha: SettingsGroup = { id: 'ha', title: t('Home Assistant'), pages: [], actions: header };
  const at = base.findIndex((g) => g.id === 'help');
  return at < 0 ? [...base, ha] : [...base.slice(0, at), ha, ...base.slice(at)];
}
