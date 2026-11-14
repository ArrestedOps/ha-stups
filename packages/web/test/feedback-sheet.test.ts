import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import FeedbackLink from '../src/components/FeedbackLink.svelte';
import FeedbackSheet from '../src/components/FeedbackSheet.svelte';
import { feedbackSheet, openFeedback, resetFeedback } from '../src/lib/feedbackSheet.svelte';
import { setLanguage } from '../src/lib/i18n/index.svelte';

// Das Fenster „Feedback", auf dem Server gerendert: Schritt 1 (Art wählen) und Schritt 2 (Text, Zähler, Bild)
const html = () => render(FeedbackSheet, { props: {} }).body;

/** Das öffnende Tag des Senden-Knopfs (der große Knopf am Fuß, 52 px hoch) */
const sendButton = (out: string) => {
  const start = out.lastIndexOf('<button', out.indexOf('flex h-[52px] w-full'));
  return out.slice(start, out.indexOf('>', start) + 1);
};

beforeEach(() => {
  setLanguage('de');
  resetFeedback();
});

describe('Feedback-Fenster: Schritt 1, Art wählen', () => {
  it('fünf große Kacheln mit Namen und Hinweis, Titel „Feedback", Hinweis zum Datenschutz', () => {
    openFeedback();
    const out = html();
    for (const k of ['bug', 'idea', 'praise', 'criticism', 'other']) expect(out, k).toContain(`data-testid="feedback-kind-${k}"`);
    for (const text of ['Fehler melden', 'Verbesserung oder Wunsch', 'Lob', 'Kritik', 'Sonstiges']) expect(out).toContain(text);
    expect(out).toContain('aria-label="Feedback"');
    expect(out).toContain('nur auf dieser Stups-Installation gespeichert und vom Administrator gelesen');
    expect(out).not.toContain('data-testid="feedback-text"');
    expect(out).not.toContain('Senden'); // der Senden-Knopf kommt erst mit der Art
  });

  it('jede Kachel hat ein Symbol (Pfad), und die Auswahl ist gut tippbar (mindestens 76 px hoch)', () => {
    openFeedback();
    const out = html();
    expect(out.match(/<svg/g)!.length).toBeGreaterThanOrEqual(5);
    expect(out).toMatch(/min-h-\[126px\]/);
    expect(out).toMatch(/min-h-\[76px\]/);
  });
});

describe('Feedback-Fenster: Schritt 2, Text', () => {
  it('Platzhalter und Titel richten sich nach der Art', () => {
    openFeedback('bug');
    let out = html();
    expect(out).toContain('aria-label="Feedback"');
    expect(out).toContain('Fehler melden'); // die Art steht in der Zeile unter dem Titel
    expect(out).toContain('placeholder="Was ist passiert? Was hast du erwartet?"');
    openFeedback('praise');
    out = html();
    expect(out).toContain('placeholder="Was gefällt dir besonders gut?"');
  });

  it('Textfeld mit Grenze 1000, Zähler, Bild-Knopf, Hinweis zu Version und Bildschirm, Senden gesperrt ohne Text', () => {
    openFeedback('idea');
    const out = html();
    expect(out).toContain('maxlength="1000"');
    expect(out).toMatch(/data-testid="feedback-count"[^>]*>\s*0 \/ 1000/);
    expect(out).toContain('Bild anhängen (optional)');
    expect(out).toContain('accept="image/*"');
    expect(out).toContain('Version und Bildschirm werden mitgesendet.');
    expect(sendButton(out)).toMatch(/\sdisabled(=""|\s|>)/);
    expect(out).toContain('nur auf dieser Stups-Installation gespeichert');
  });

  it('Zähler zeigt die Länge des Entwurfs und färbt sich kurz vor dem Limit', () => {
    openFeedback('idea');
    feedbackSheet.draft = 'a'.repeat(123);
    expect(html()).toMatch(/data-tone="ok"[^>]*data-testid="feedback-count"[^>]*>\s*123 \/ 1000|data-testid="feedback-count"[\s\S]{0,40}123 \/ 1000/);
    feedbackSheet.draft = 'a'.repeat(950);
    let out = html();
    expect(out).toContain('text-sig-orange');
    expect(out).toContain('950 / 1000');
    feedbackSheet.draft = 'a'.repeat(1000);
    out = html();
    expect(out).toContain('text-danger');
    expect(out).toContain('1000 / 1000');
  });

  it('mit Text ist Senden frei', () => {
    openFeedback('bug');
    feedbackSheet.draft = 'Es klemmt';
    const out = html();
    expect(sendButton(out)).not.toMatch(/\sdisabled(=""|\s|>)/);
  });

  it('lange Texte brechen um (wrap-anywhere im Feld)', () => {
    openFeedback('bug');
    expect(html()).toContain('wrap-anywhere');
  });

  it('englisch', () => {
    setLanguage('en');
    openFeedback('bug');
    const out = html();
    expect(out).toContain('Report a bug');
    expect(out).toContain('What happened? What did you expect?');
    expect(out).toContain('Attach an image (optional)');
  });
});

describe('Öffnen-Funktion', () => {
  it('ohne Art beginnt die Auswahl, ein Entwurf behält seine Art, ein neues Öffnen mit Art wählt sie vor', () => {
    openFeedback();
    expect(feedbackSheet).toMatchObject({ open: true, kind: null });
    feedbackSheet.kind = 'idea';
    feedbackSheet.draft = 'halb fertig';
    feedbackSheet.open = false;
    openFeedback();
    expect(feedbackSheet.kind).toBe('idea');
    openFeedback('bug');
    expect(feedbackSheet).toMatchObject({ kind: 'bug', draft: 'halb fertig' });
    resetFeedback();
    expect(feedbackSheet).toMatchObject({ open: false, kind: null, draft: '' });
    openFeedback();
    expect(feedbackSheet.kind).toBeNull();
  });
});

describe('Einstieg am Listenende', () => {
  it('Textknopf mit Sprechblase und Namen', () => {
    const out = render(FeedbackLink, { props: {} }).body;
    expect(out).toContain('Fehler oder Idee? Sag es uns');
    expect(out).toContain('data-testid="feedback-link"');
    expect(out).toMatch(/min-h-11/);
  });
});
