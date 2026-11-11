import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import TimesPage from '../src/components/settings/TimesPage.svelte';
import type { Settings } from '../src/lib/api';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { ui } from '../src/lib/store.svelte';

const html = () => render(TimesPage, { props: {} }).body;
const settings = (patch: Partial<Settings> = {}): Settings =>
  ({
    dailySummaryTime: null,
    defaultDailySummaryTime: '08:00',
    effectiveDailySummaryTime: '08:00',
    overdueNagTime: null,
    defaultOverdueNagTime: '18:00',
    effectiveOverdueNagTime: '18:00',
    ...patch,
  }) as Settings;

beforeEach(() => {
  setLanguage('de');
  ui.isAdmin = true;
  ui.permissions = [];
  ui.settings = settings();
});

describe('Seite „Erinnerungszeiten"', () => {
  it('hat beide Uhrzeiten auf einer Seite: Tageszusammenfassung und Nachhaken um …', () => {
    const out = html();
    expect(out).toContain('Erinnerungszeiten');
    expect(out).toMatch(/id="summary-time"[^>]*value="08:00"/);
    expect(out).toMatch(/id="nag-time"[^>]*value="18:00"/);
  });

  it('zeigt die wirksame Uhrzeit im Feld', () => {
    ui.settings = settings({ overdueNagTime: '20:15', effectiveOverdueNagTime: '20:15', dailySummaryTime: '06:30', effectiveDailySummaryTime: '06:30' });
    const out = html();
    expect(out).toMatch(/id="nag-time"[^>]*value="20:15"/);
    expect(out).toMatch(/id="summary-time"[^>]*value="06:30"/);
  });

  it('ohne eigene Uhrzeit: Hinweis auf die Standard-Uhrzeit, keine Zeile „Zurücksetzen"', () => {
    const out = html();
    expect(out).toContain('Gerade gilt die Standard-Uhrzeit (18:00).');
    expect(out).toContain('Gerade gilt die Standard-Uhrzeit (08:00).');
    expect(out).not.toContain('Zurücksetzen');
  });

  it('mit eigener Uhrzeit: die Zeile „Zurücksetzen" nennt die Standard-Uhrzeit, nur bei der geänderten', () => {
    ui.settings = settings({ overdueNagTime: '20:15', effectiveOverdueNagTime: '20:15' });
    const out = html();
    expect(out.match(/Zurücksetzen/g)).toHaveLength(1);
    expect(out).toContain('Standard-Uhrzeit nehmen (18:00)');
    expect(out).toContain('Gerade gilt die Standard-Uhrzeit (08:00).');
  });

  it('ohne das Recht „App-Einstellungen" sind die Felder gesperrt und es gibt kein Zurücksetzen', () => {
    ui.isAdmin = false;
    ui.permissions = [];
    ui.settings = settings({ overdueNagTime: '20:15', effectiveOverdueNagTime: '20:15', dailySummaryTime: '06:30', effectiveDailySummaryTime: '06:30' });
    const out = html();
    expect(out).toMatch(/<input[^>]*id="nag-time"[^>]*disabled/);
    expect(out).toMatch(/<input[^>]*id="summary-time"[^>]*disabled/);
    expect(out).not.toContain('Zurücksetzen');
  });

  it('nennt die Standard-Uhrzeit, nicht die Konfiguration (die Option gilt seit der Übernahme beim ersten Start nicht mehr)', () => {
    ui.settings = settings({ dailySummaryTime: '06:30', effectiveDailySummaryTime: '06:30' });
    const out = html();
    expect(out).toContain('Wieder die Standard-Uhrzeit nehmen (08:00)');
    expect(out).not.toContain('Konfiguration');
  });
});
