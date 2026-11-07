import { render } from 'svelte/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import RecurrenceEditor from '../src/components/RecurrenceEditor.svelte';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import type { Recurrence } from '../src/lib/recurrence';

// Die Beispiele rechnen in der Zeitzone des Geräts
const tz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/Berlin';
});
afterAll(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});

const DUE = '2026-11-14T09:00:00.000Z'; // Sa 14.11. 10:00
const html = (value: Recurrence | null, dueAt: string | null = DUE) =>
  render(RecurrenceEditor, { props: { value, dueAt, carryOver: ['description'], onchange: () => undefined, oncarry: () => undefined } }).body;
const text = (s: string) => s.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const tolerant: Recurrence = { type: 'fixed', freq: 'weekly', every: 2, weekdays: [6], lateTolerance: 3 };

describe('Wiederholung: Editor in der Oberfläche', () => {
  it('ohne Regel nur die Auswahl „Wie oft?“, alle Chips, nichts zur Verspätung', () => {
    const out = text(html(null, null));
    for (const chip of ['Nie', 'Stündlich', 'Täglich', 'Wöchentlich', 'Alle 2 Wochen', 'Monatlich', 'Jährlich', 'Eigene …']) expect(out).toContain(chip);
    expect(out).not.toContain('Und wenn ich später fertig werde?');
  });

  it('mit Toleranz: drei Karten, Toleranz-Zeile und die Beispiele aus der echten Regel', () => {
    const raw = html(tolerant);
    const out = text(raw);
    expect(out).toContain('Plan bleibt fest');
    expect(out).toContain('Kleine Verspätung ist okay');
    expect(out).toContain('Neu zählen ab Erledigung');
    expect(out).toContain('Toleranz');
    expect(out).toContain('so viele Tage darfst du zu spät sein');
    expect(out).toContain('Bis 3 Tage zu spät: Plan bleibt.');
    expect(out).toContain('Erledigt Mo 16.11. → nächstes Mal Sa 28.11.');
    expect(out).toContain('Mehr als 3 Tage zu spät: Plan beginnt neu, nächster Samstag nach 2 Wochen.');
    expect(out).toContain('Erledigt Mi 18.11. → nächstes Mal Sa 5.12.');
    expect(out).toContain('Erledigt Mi 18.11. → nächstes Mal Sa 28.11.'); // Karte „Plan bleibt fest"
    expect(out).toContain('Erledigt Mi 18.11. → nächstes Mal Mi 2.12.'); // Karte „Neu zählen"
    expect(raw).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*>[^]*?Kleine Verspätung ist okay/);
    expect(raw).toMatch(/aria-label="Toleranz in Tagen"/);
  });

  it('Vorschau mit den nächsten drei Terminen', () => {
    const out = text(html({ type: 'fixed', freq: 'weekly', every: 2, weekdays: [6] }));
    expect(out).toContain('alle 2 Wochen (Sa)');
    expect(out).toContain('Nächste Termine:');
    expect(out).toContain('Sa 14.11. Sa 28.11. Sa 12.12.');
  });

  it('ohne Termin: „Erster Termin wird automatisch gesetzt“', () => {
    const out = text(html({ type: 'fixed', freq: 'weekly', every: 1, weekdays: [6] }, null));
    expect(out).toContain('Erster Termin wird automatisch gesetzt:');
    expect(out).toContain('Sa ');
  });

  it('Stündlich, Täglich und Jährlich: nur „Plan bleibt fest“ und „Neu zählen“, Stündlich mit Zeitfenster', () => {
    for (const freq of ['hourly', 'daily', 'yearly'] as const) {
      const raw = html({ type: 'fixed', freq, every: 1 });
      const out = text(raw);
      expect(raw, freq).not.toContain('data-handling="tolerant"');
      expect(out, freq).toContain('Plan bleibt fest');
      expect(out, freq).toContain('Neu zählen ab Erledigung');
      expect(out, freq).toContain('gibt es nur bei wöchentlich und monatlich');
    }
    expect(text(html({ type: 'fixed', freq: 'hourly', every: 3 }))).toContain('Nur zwischen bestimmten Uhrzeiten');
    expect(text(html({ type: 'fixed', freq: 'daily', every: 1 }))).not.toContain('Nur zwischen bestimmten Uhrzeiten');
    const win = html({ type: 'fixed', freq: 'hourly', every: 3, window: { from: '08:00', to: '20:00' } });
    expect(win).toContain('value="08:00"');
    expect(win).toContain('value="20:00"');
  });

  it('Neu zählen: die Karte ist gewählt, keine Wochentage', () => {
    const raw = html({ type: 'after_completion', every: 2, unit: 'weeks' });
    const out = text(raw);
    expect(out).toContain('Immer alle 2 Wochen nach Erledigung.');
    expect(out).not.toContain('An welchem Tag?');
  });

  it('auf Englisch', () => {
    setLanguage('en');
    const out = text(html(tolerant));
    expect(out).toContain('A little late is fine');
    expect(out).toContain('how many days you may be late');
    expect(out).toContain('Done Mon 16/11 → next time Sat 28/11');
    expect(out).toContain('Up to 3 days late: Plan stays.');
    expect(out).toContain('Count again from completion');
  });
});
