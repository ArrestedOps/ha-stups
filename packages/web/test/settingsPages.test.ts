import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { settingsGroups, settingsOverview, type SettingsCtx } from '../src/lib/settingsPages';

const addon: SettingsCtx = { isAdmin: true, isChild: false, standalone: false, beta: false, push: true, watchers: true, haUi: true, house: true, migration: true };
const ids = (ctx: SettingsCtx) => settingsGroups(ctx).flatMap((g) => g.pages.map((p) => p.id));
const groupIds = (ctx: SettingsCtx) => settingsGroups(ctx).map((g) => g.id);

beforeEach(() => setLanguage('de'));

describe('Einstellungen nach Rolle und Betriebsart', () => {
  it('Administrator im Add-on: alle vier Gruppen, keine Konto-Seite', () => {
    expect(groupIds(addon)).toEqual(['me', 'household', 'ha', 'help']);
    expect(ids(addon)).toEqual(['notifications', 'look', 'people', 'watchers', 'templates', 'icons', 'dates', 'summary', 'dashboard', 'bubble', 'voice', 'report', 'data', 'feedback']);
  });

  it('Mitglied: „Für mich", „Home Assistant" (nur die eigene Dashboard-Wahl) und „Hilfe und Daten"', () => {
    const member = { ...addon, isAdmin: false };
    expect(groupIds(member)).toEqual(['me', 'ha', 'help']);
    expect(ids(member)).toEqual(['notifications', 'look', 'dashboard', 'report', 'data']);
  });

  it('Dashboard-Wahl: jede Person im Add-on, nie ein Kind, nie im eigenen Container', () => {
    expect(ids(addon)).toContain('dashboard');
    expect(ids({ ...addon, isAdmin: false })).toContain('dashboard');
    expect(ids({ ...addon, isAdmin: false, isChild: true })).not.toContain('dashboard');
    expect(ids({ ...addon, isChild: true })).not.toContain('dashboard'); // auch ein Administrator, der als Kind eingetragen ist
    expect(ids({ ...addon, standalone: true, haUi: false })).not.toContain('dashboard');
  });

  it('Kind im Add-on: nur Sprache und Farbe', () => {
    expect(ids({ ...addon, isAdmin: false, isChild: true })).toEqual(['look']);
  });

  it('Kind im eigenen Container: Sprache und Farbe, dazu die Abmeldung', () => {
    expect(ids({ ...addon, isAdmin: false, isChild: true, standalone: true, haUi: false })).toEqual(['look', 'account']);
  });

  it('Docker ohne Home Assistant: Konto statt Home-Assistant-Gruppe, keine Wächter und kein Dashboard', () => {
    const docker = { ...addon, standalone: true, haUi: false, watchers: false, house: false, push: false };
    expect(groupIds(docker)).toEqual(['me', 'household', 'help']);
    expect(ids(docker)).toEqual(['look', 'account', 'people', 'templates', 'icons', 'dates', 'data', 'feedback']);
  });

  it('Docker mit Home Assistant: Wächter und Ansage sind da, das Dashboard nicht', () => {
    const dockerHa = { ...addon, standalone: true, haUi: false };
    expect(ids(dockerHa)).toContain('watchers');
    expect(ids(dockerHa)).toContain('voice');
    expect(ids(dockerHa)).not.toContain('dashboard');
  });

  it('Tageszusammenfassung nur für Administratoren und nur mit Push, Dashboard-Button nur im Add-on', () => {
    expect(ids(addon)).toContain('summary');
    expect(ids({ ...addon, isAdmin: false })).not.toContain('summary');
    expect(ids({ ...addon, push: false })).not.toContain('summary');
    expect(ids(addon)).toContain('bubble');
    expect(ids({ ...addon, standalone: true, haUi: false })).not.toContain('bubble');
    expect(ids({ ...addon, isAdmin: false })).not.toContain('bubble');
  });

  it('Die Übersicht zeigt keine Zeile „Wächter" (dafür gibt es den Reiter), die Seite bleibt über „Alle Wächter verwalten" erreichbar', () => {
    const overview = settingsOverview(addon).flatMap((g) => g.pages.map((p) => p.id));
    expect(overview).not.toContain('watchers');
    expect(overview).toContain('templates');
    expect(ids(addon)).toContain('watchers');
  });

  it('Beta nur im Beta-Kanal', () => {
    expect(ids(addon)).not.toContain('beta');
    expect(ids({ ...addon, beta: true })).toContain('beta');
    expect(ids({ ...addon, beta: true, isAdmin: false, isChild: true })).not.toContain('beta');
  });

  it('ohne Push entfallen Benachrichtigungen und „Warum kommt nichts an?"', () => {
    const quiet = ids({ ...addon, push: false });
    expect(quiet).not.toContain('notifications');
    expect(quiet).not.toContain('report');
  });

  it('„Symbole“ (Symbole aus Titeln erkennen) nur für Administratoren, nie für Mitglieder oder Kinder', () => {
    expect(ids(addon)).toContain('icons');
    expect(ids({ ...addon, isAdmin: false })).not.toContain('icons');
    expect(ids({ ...addon, isAdmin: true, isChild: true })).not.toContain('icons');
    expect(ids({ ...addon, isAdmin: false, isChild: true })).not.toContain('icons');
  });

  it('Feedback-Verwaltung (Liste der Rückmeldungen): nur Administratoren, nie ein Kind, in jeder Betriebsart', () => {
    expect(ids(addon)).toContain('feedback');
    expect(ids({ ...addon, standalone: true, haUi: false })).toContain('feedback');
    expect(ids({ ...addon, isAdmin: false })).not.toContain('feedback');
    expect(ids({ ...addon, isChild: true })).not.toContain('feedback');
    expect(settingsOverview(addon).find((g) => g.id === 'help')!.pages.map((p) => p.id)).toContain('feedback');
  });

  it('die Titel folgen der Sprache', () => {
    setLanguage('en');
    expect(settingsGroups(addon).map((g) => g.title)).toEqual(['For me', 'Household', 'Home Assistant', 'Help and data']);
  });
});

describe('Einstellungen › Home Assistant: „HA-Kopfzeile ausblenden" für alle im Add-on ("Zurück zum Dashboard" ist der Home-Knopf oben)', () => {
  const overview = (ctx: SettingsCtx) => settingsOverview(ctx).map((g) => [g.id, g.actions ?? []]);

  it('im Add-on steht die Gruppe für jede Rolle da, auch für Mitglied und Kind (der Home-Knopf oben ersetzt die Zeile „Zurück zum Dashboard")', () => {
    const member = { ...addon, isAdmin: false };
    expect(overview(member)).toEqual([['me', []], ['ha', ['header']], ['help', []]]);
    expect(overview({ ...member, isChild: true })).toEqual([['me', []], ['ha', ['header']]]);
    expect(settingsOverview({ ...member, isChild: true }).find((g) => g.id === 'ha')!.pages).toEqual([]);
  });

  it('der Administrator behält dort Dashboard-Auswahl und Ansage, dazu die Aktion', () => {
    const g = settingsOverview(addon).find((x) => x.id === 'ha')!;
    expect(g.actions).toEqual(['header']);
    expect(settingsOverview(addon).flatMap((x) => x.actions ?? [])).not.toContain('back');
    expect(g.pages.map((p) => p.id)).toEqual(['dashboard', 'bubble', 'voice']);
  });

  it('im eigenen Container (kein Home-Assistant-Panel) gibt es die Aktionen nicht', () => {
    const docker = { ...addon, standalone: true, haUi: false };
    expect(settingsOverview(docker).flatMap((g) => g.actions ?? [])).toEqual([]);
    expect(settingsOverview({ ...docker, isAdmin: false }).map((g) => g.id)).not.toContain('ha');
  });

  it('die Gruppe heißt Home Assistant, auch wo sie nur aus den Aktionen besteht', () => {
    setLanguage('en');
    expect(settingsOverview({ ...addon, isAdmin: false }).find((g) => g.id === 'ha')!.title).toBe('Home Assistant');
  });
});
