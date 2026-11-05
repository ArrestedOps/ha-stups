import { t } from './i18n/index.svelte';

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
  | 'summary'
  | 'voice'
  | 'report'
  | 'data'
  | 'beta';

/** Was über die Sichtbarkeit entscheidet: Rolle und Betriebsart (aus dem Store, hier als Werte, damit es sich testen lässt) */
export interface SettingsCtx {
  isAdmin: boolean;
  isChild: boolean;
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
  /** Zeilen, die gleich etwas tun statt eine Unterseite zu öffnen (nur „Home Assistant"): zurück zum Dashboard, HA-Kopfzeile ausblenden */
  actions?: ('back' | 'header')[];
}

/**
 * Die Gruppen der Einstellungen für diese Person: „Für mich" (alle), „Haushalt" und „Home Assistant" (nur Administratoren),
 * „Hilfe und Daten". Ein Kind sieht nur Sprache und Farbe (und im eigenen Container die Abmeldung); eine Gruppe ohne Seiten fehlt.
 */
export function settingsGroups(ctx: SettingsCtx): SettingsGroup[] {
  const admin = ctx.isAdmin && !ctx.isChild;
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
        ...page('people', t('Personen und Zugriff'), 'user', admin),
        ...page('watchers', t('Wächter'), 'eye', admin && ctx.watchers),
        ...page('templates', t('Vorlagen'), 'columns', admin),
        ...page('icons', t('Symbole'), 'spark', admin),
        ...page('dates', t('Termine'), 'clock', admin),
        ...page('summary', t('Tageszusammenfassung'), 'bell', admin && ctx.push),
      ],
    },
    {
      id: 'ha',
      title: t('Home Assistant'),
      pages: [
        ...page('dashboard', t('Dashboard und Kopfzeile'), 'home', admin && ctx.haUi),
        ...page('bubble', t('Dashboard-Button'), 'layers', admin && ctx.haUi),
        ...page('voice', t('Ansage und Lampe'), 'bell', admin && ctx.house),
      ],
    },
    {
      id: 'help',
      title: t('Hilfe und Daten'),
      pages: [
        ...page('report', t('Warum kommt nichts an?'), 'message', ctx.push && !ctx.isChild),
        ...page('data', admin && ctx.migration ? t('Papierkorb, Archiv, Umzug') : t('Papierkorb und Archiv'), 'archive', !ctx.isChild),
        ...page('beta', t('Beta'), 'flag', ctx.beta && !ctx.isChild),
      ],
    },
  ];
  return groups.filter((g) => g.pages.length > 0);
}

/**
 * Die Übersicht der Einstellungen: wie `settingsGroups`, dazu im Add-on in der Gruppe „Home Assistant" für **jede** Rolle „Zurück zum Dashboard"
 * und „HA-Kopfzeile ausblenden". Beides stand früher oben links in der Kopfzeile (für alle) und gehört nach dem neuen Design hierher.
 */
export function settingsOverview(ctx: SettingsCtx): SettingsGroup[] {
  // Die Zeile „Wächter" entfällt hier (Reiter Wächter, dort „Alle Wächter verwalten"); die Seite selbst bleibt
  const groups = settingsGroups(ctx)
    .map((g) => ({ ...g, pages: g.pages.filter((p) => p.id !== 'watchers') }))
    .filter((g) => g.pages.length > 0);
  if (!ctx.haUi) return groups;
  const actions: ('back' | 'header')[] = ['back', 'header'];
  const have = groups.find((g) => g.id === 'ha');
  if (have) return groups.map((g) => (g === have ? { ...g, actions } : g));
  const ha: SettingsGroup = { id: 'ha', title: t('Home Assistant'), pages: [], actions };
  const at = groups.findIndex((g) => g.id === 'help');
  return at < 0 ? [...groups, ha] : [...groups.slice(0, at), ha, ...groups.slice(at)];
}
