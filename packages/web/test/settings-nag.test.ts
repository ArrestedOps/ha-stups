import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import NagPage from '../src/components/settings/NagPage.svelte';
import SummaryPage from '../src/components/settings/SummaryPage.svelte';
import type { Settings } from '../src/lib/api';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { ui } from '../src/lib/store.svelte';

const html = () => render(NagPage, { props: {} }).body;
const settings = (patch: Partial<Settings> = {}): Settings =>
  ({ overdueNagTime: null, defaultOverdueNagTime: '18:00', effectiveOverdueNagTime: '18:00', ...patch }) as Settings;

beforeEach(() => {
  setLanguage('de');
  ui.isAdmin = true;
  ui.permissions = [];
  ui.settings = settings();
});

describe('Seite „Nachhaken um …"', () => {
  it('zeigt die wirksame Uhrzeit im Feld', () => {
    ui.settings = settings({ overdueNagTime: '20:15', effectiveOverdueNagTime: '20:15' });
    expect(html()).toMatch(/id="nag-time"[^>]*value="20:15"/);
  });

  it('ohne eigene Uhrzeit: Hinweis auf die Standard-Uhrzeit, keine Zeile „Zurücksetzen"', () => {
    const out = html();
    expect(out).toContain('Gerade gilt die Standard-Uhrzeit (18:00).');
    expect(out).not.toContain('Zurücksetzen');
  });

  it('mit eigener Uhrzeit: die Zeile „Zurücksetzen" nennt die Standard-Uhrzeit', () => {
    ui.settings = settings({ overdueNagTime: '20:15', effectiveOverdueNagTime: '20:15' });
    const out = html();
    expect(out).toContain('Zurücksetzen');
    expect(out).toContain('Standard-Uhrzeit nehmen (18:00)');
  });

  it('ohne das Recht „App-Einstellungen" ist das Feld gesperrt und es gibt kein Zurücksetzen', () => {
    ui.isAdmin = false;
    ui.permissions = [];
    ui.settings = settings({ overdueNagTime: '20:15', effectiveOverdueNagTime: '20:15' });
    const out = html();
    expect(out).toMatch(/<input[^>]*id="nag-time"[^>]*disabled/);
    expect(out).not.toContain('Zurücksetzen');
  });
});

describe('Seite „Tageszusammenfassung" im Add-on', () => {
  it('nennt die Standard-Uhrzeit, nicht die Konfiguration (die Option gilt seit der Übernahme beim ersten Start nicht mehr)', () => {
    ui.isAdmin = true;
    ui.settings = { dailySummaryTime: null, defaultDailySummaryTime: '08:00', effectiveDailySummaryTime: '08:00' } as Settings;
    const out = render(SummaryPage, { props: {} }).body;
    expect(out).toContain('Gerade gilt die Standard-Uhrzeit (08:00).');
    expect(out).not.toContain('Konfiguration');
    ui.settings = { dailySummaryTime: '06:30', defaultDailySummaryTime: '08:00', effectiveDailySummaryTime: '06:30' } as Settings;
    const own = render(SummaryPage, { props: {} }).body;
    expect(own).toContain('Wieder die Standard-Uhrzeit nehmen (08:00)');
    expect(own).not.toContain('Konfiguration der App');
  });
});
