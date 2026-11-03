import { t } from './i18n/index.svelte';

/** Die Unterseiten der Einstellungen */
export type SettingsPageId =
  | 'notifications'
  | 'look'
  | 'account'
  | 'people'
  | 'watchers'
  | 'templates'
  | 'dates'
  | 'dashboard'
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
}

export interface SettingsGroup {
  id: 'me' | 'household' | 'ha' | 'help';
  title: string;
  pages: { id: SettingsPageId; title: string; icon: string }[];
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
        ...page('people', t('Personen und Kinder'), 'user', admin),
        ...page('watchers', t('Wächter'), 'eye', admin && ctx.watchers),
        ...page('templates', t('Vorlagen'), 'columns', admin),
        ...page('dates', t('Termine'), 'clock', admin),
      ],
    },
    {
      id: 'ha',
      title: t('Home Assistant'),
      pages: [
        ...page('dashboard', t('Dashboard und Kopfzeile'), 'home', admin && ctx.haUi),
        ...page('voice', t('Ansage und Lampe'), 'bell', admin && ctx.house),
      ],
    },
    {
      id: 'help',
      title: t('Hilfe und Daten'),
      pages: [
        ...page('report', t('Warum kommt nichts an?'), 'message', ctx.push && !ctx.isChild),
        ...page('data', t('Papierkorb, Archiv, Umzug'), 'archive', !ctx.isChild),
        ...page('beta', t('Beta'), 'flag', ctx.beta && !ctx.isChild),
      ],
    },
  ];
  return groups.filter((g) => g.pages.length > 0);
}
