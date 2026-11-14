import { render } from 'svelte/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import NudgeCard from '../src/components/NudgeCard.svelte';
import ReminderEditor from '../src/components/ReminderEditor.svelte';
import WatcherFineEditor from '../src/components/WatcherFineEditor.svelte';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import type { ReminderSpec } from '../src/lib/reminder';
import { WatcherEditor } from '../src/lib/watcher-editor.svelte';

// Der Ablauf rechnet in der Zeitzone des Geräts
const tz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/Berlin';
});
afterAll(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});
beforeEach(() => setLanguage('de'));

const DUE = '2026-11-14T09:00:00.000Z'; // Sa 14.11. 10:00
const text = (s: string) => s.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const html = (reminder: ReminderSpec | null, dueAt: string | null = DUE, remindBeforeMin: number | null = null) =>
  render(ReminderEditor, { props: { dueAt, remindBeforeMin, reminder, onremind: () => undefined, onnag: () => undefined } }).body;

const daily: ReminderSpec = { anchor: 'due', afterMin: 4320, everyMin: 1440, max: 5, atTime: '09:00' };

describe('Erinnerung an einer Aufgabe', () => {
  it('„Vorher erinnern“ wie bisher, darunter „Nachhaken, wenn nicht erledigt“ mit allen Chips', () => {
    const out = text(html(null));
    expect(out).toContain('Vorher erinnern');
    expect(out).toContain('wie bisher');
    expect(out).toContain('Nachhaken, wenn nicht erledigt');
    for (const chip of ['Aus', 'Nach 1 Std.', 'Morgen', 'Nach 3 Tagen', 'Nach 1 Woche', 'Eigene …']) expect(out).toContain(chip);
    // ohne Wahl nichts Weiteres: keine Wiederholung, keine Zeilen, kein Ablauf
    expect(out).not.toContain('Danach wiederholen?');
    expect(out).not.toContain('Dein Ablauf');
  });

  it('eine Wahl, ein Weg: kein Dropdown im Satz und kein „bis erledigt“-Schalter', () => {
    const raw = html(daily);
    expect(text(raw)).not.toMatch(/bis erledigt/i);
    expect(raw).not.toContain('role="switch"');
    // nur das eine Auswahlfeld für „Vorher erinnern“ (und bei „Eigene …“ die Einheit)
    expect((raw.match(/<select/g) ?? []).length).toBe(1);
  });

  it('mit Wahl: Wiederholung, Uhrzeit (Tage), Höchstens, der Ablauf mit Termin und der Hinweis', () => {
    const raw = html(daily);
    const out = text(raw);
    expect(out).toContain('Danach wiederholen?');
    for (const chip of ['Nein', 'Stündlich', 'Täglich', 'Wöchentlich']) expect(out).toContain(chip);
    expect(out).toContain('Uhrzeit');
    expect(raw).toMatch(/type="time"[^>]*value="09:00"|value="09:00"[^>]*type="time"/);
    expect(out).toContain('Höchstens');
    expect(raw).toMatch(/aria-label="Höchstens so oft"/);
    expect(out).toContain('Dein Ablauf (Termin: Sa 14.11.)');
    expect(out).toContain('Di 17.11. 09:00 Mi 18.11. 09:00 Do 19.11. 09:00 Fr 20.11. 09:00 Sa 21.11. 09:00 (letzte)');
    expect(out).toContain('Mit der Erledigung endet alles automatisch. Ruhezeiten gelten. Nur für dich.');
  });

  it('Stunden: keine Uhrzeit; einmal: keine Zeile „Höchstens“', () => {
    const hours = text(html({ anchor: 'due', afterMin: 60, everyMin: 60, max: 3, atTime: null }));
    expect(hours).not.toContain('Uhrzeit');
    expect(hours).toContain('Höchstens');
    expect(hours).toContain('Sa 14.11. 11:00 Sa 14.11. 12:00 Sa 14.11. 13:00 (letzte)');
    const once = text(html({ anchor: 'due', afterMin: 60, everyMin: null, max: 1, atTime: null }));
    expect(once).not.toContain('Höchstens');
    expect(once).toContain('Sa 14.11. 11:00');
    expect(once).not.toContain('(letzte)');
  });

  it('„Eigene …“: Nach [Zahl] [Einheit]', () => {
    const raw = html({ anchor: 'due', afterMin: 90, everyMin: null, max: 1, atTime: null });
    expect(raw).toContain('data-testid="nag-first-custom"');
    expect(text(raw)).toMatch(/Nach\s+Min\.\s+Std\.\s+Tage\s+Wochen|Nach .*Min\./);
    expect(raw).toMatch(/aria-label="Zeit bis zum Nachhaken"/);
  });

  it('ohne Termin zählt es ab dem Anlegen, und der Ablauf sagt es; „Vorher erinnern“ entfällt', () => {
    const raw = html({ anchor: 'created', afterMin: 60, everyMin: null, max: 1, atTime: null }, null);
    const out = text(raw);
    expect(out).toContain('Dein Ablauf (ab dem Anlegen)');
    expect(out).not.toContain('Vorher erinnern');
  });

  it('englisch', () => {
    setLanguage('en');
    const out = text(html(daily));
    expect(out).toContain('Follow up if not done');
    expect(out).toContain('Repeat afterwards?');
    expect(out).toContain('Your schedule (due: Sat 14/11)');
    expect(out).toContain('(last)');
    expect(out).toContain('Everything ends automatically once the task is done. Quiet hours apply. Only for you.');
  });
});

function editor(extra: Record<string, string> = {}): WatcherEditor {
  const ed = new WatcherEditor(null);
  ed.loading = false;
  Object.assign(ed.form, extra);
  return ed;
}

describe('Wächter: Stupsen, wenn noch offen', () => {
  const card = (extra: Record<string, string>, wide = false) => render(NudgeCard, { props: { ed: editor(extra), wide } }).body;

  it('Handy: Aufgabe mit den Zeilen Nach / Wiederholen alle / Höchstens und dem Beispiel in der Aufgabe', () => {
    const raw = card({ nudgeAfter: '30', nudgeEvery: '30', nudgeMax: '3' });
    const out = text(raw);
    expect(out).toContain('Stupsen, wenn noch offen');
    expect(out).toContain('freundlich erinnern');
    expect(out).toMatch(/Nach\s/);
    expect(out).toContain('Wiederholen alle');
    expect(out).toContain('leer = nur einmal');
    expect(out).toContain('Höchstens');
    expect(out).toContain('Aufgabe angelegt 12:00 → Stups 12:30 · 13:00 · 13:30 (letzter)');
    expect(out).toContain('Endet, sobald die Aufgabe erledigt ist.');
    // Das Beispiel steht in der Aufgabe, nicht daneben
    expect(raw.indexOf('data-testid="nudge-example"')).toBeGreaterThan(raw.indexOf('data-testid="nudge-card"'));
  });

  it('ohne Wert bei „Nach“: kein Stups, kein Beispiel', () => {
    const out = text(card({}));
    expect(out).toContain('Leer lassen: kein Stups.');
    expect(out).not.toContain('Aufgabe angelegt 12:00');
  });

  it('ohne Wiederholung: Höchstens ist gesperrt, es gibt genau einen Stups', () => {
    const raw = card({ nudgeAfter: '45' });
    expect(text(raw)).toContain('Stups 12:45');
    expect(raw).toMatch(/<input[^>]*aria-label="Höchstens so viele Stupse"[^>]*disabled|<input[^>]*disabled[^>]*aria-label="Höchstens so viele Stupse"/);
  });

  it('Desktop: breite Aufgabe, drei Felder in einer Zeile mit einzeiligen Beschriftungen, Zeitstrahl rechts', () => {
    const raw = card({ nudgeAfter: '30', nudgeEvery: '30', nudgeMax: '3' }, true);
    const out = text(raw);
    expect(raw).toContain('data-wide');
    expect(raw).toContain('data-testid="nudge-fields"');
    // alle drei Felder liegen im selben Zeilen-Container, die Beschriftungen brechen nicht um
    const fields = raw.slice(raw.indexOf('data-testid="nudge-fields"'), raw.indexOf('data-testid="nudge-timeline"'));
    expect((fields.match(/<input/g) ?? []).length).toBe(3);
    expect((fields.match(/whitespace-nowrap/g) ?? []).length).toBe(3);
    expect(out).toContain('So läuft es ab');
    expect(out).toContain('Angelegt');
    expect(out).toContain('Stups 1');
    expect(out).toContain('Stups 3');
    expect(out).toContain('13:30 · letzter');
  });

  it('ersetzt „Stupsen nach Minuten“ im Feinschliff (Handy und Desktop)', () => {
    for (const columns of [false, true]) {
      const raw = render(WatcherFineEditor, { props: { ed: editor({ nudgeAfter: '30' }), columns } }).body;
      expect(raw).toContain('data-testid="nudge-card"');
      expect((raw.match(/data-testid="nudge-card"/g) ?? []).length).toBe(1);
    }
  });

  it('englisch', () => {
    setLanguage('en');
    const out = text(card({ nudgeAfter: '30', nudgeEvery: '30', nudgeMax: '3' }));
    expect(out).toContain('Task created 12:00 → Nudge 12:30 · 13:00 · 13:30 (last)');
    expect(out).toContain('Ends as soon as the task is done.');
  });
});
