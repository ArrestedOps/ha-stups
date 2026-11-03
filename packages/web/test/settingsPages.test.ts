import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { settingsGroups, type SettingsCtx } from '../src/lib/settingsPages';

const addon: SettingsCtx = { isAdmin: true, isChild: false, standalone: false, beta: false, push: true, watchers: true, haUi: true, house: true, migration: true };
const ids = (ctx: SettingsCtx) => settingsGroups(ctx).flatMap((g) => g.pages.map((p) => p.id));
const groupIds = (ctx: SettingsCtx) => settingsGroups(ctx).map((g) => g.id);

beforeEach(() => setLanguage('de'));

describe('Einstellungen nach Rolle und Betriebsart', () => {
  it('Administrator im Add-on: alle vier Gruppen, keine Konto-Seite', () => {
    expect(groupIds(addon)).toEqual(['me', 'household', 'ha', 'help']);
    expect(ids(addon)).toEqual(['notifications', 'look', 'people', 'watchers', 'templates', 'dates', 'dashboard', 'voice', 'report', 'data']);
  });

  it('Mitglied: nur „Für mich" und „Hilfe und Daten"', () => {
    const member = { ...addon, isAdmin: false };
    expect(groupIds(member)).toEqual(['me', 'help']);
    expect(ids(member)).toEqual(['notifications', 'look', 'report', 'data']);
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
    expect(ids(docker)).toEqual(['look', 'account', 'people', 'templates', 'dates', 'data']);
  });

  it('Docker mit Home Assistant: Wächter und Ansage sind da, das Dashboard nicht', () => {
    const dockerHa = { ...addon, standalone: true, haUi: false };
    expect(ids(dockerHa)).toContain('watchers');
    expect(ids(dockerHa)).toContain('voice');
    expect(ids(dockerHa)).not.toContain('dashboard');
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

  it('die Titel folgen der Sprache', () => {
    setLanguage('en');
    expect(settingsGroups(addon).map((g) => g.title)).toEqual(['For me', 'Household', 'Home Assistant', 'Help and data']);
  });
});
