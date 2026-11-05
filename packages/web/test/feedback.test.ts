import { describe, expect, it } from 'vitest';
import {
  canSendFeedback,
  counterInfo,
  FEEDBACK_KINDS,
  FEEDBACK_MAX,
  feedbackAsText,
  feedbackContext,
  kindHint,
  kindLabel,
  messagePlaceholder,
  type FeedbackItem,
} from '../src/lib/feedback';
import { setLanguage } from '../src/lib/i18n/index.svelte';

describe('Arten', () => {
  it('fünf Arten in dieser Reihenfolge, jede mit Symbol und Farbe', () => {
    expect(FEEDBACK_KINDS.map((k) => k.id)).toEqual(['bug', 'idea', 'praise', 'criticism', 'other']);
    for (const k of FEEDBACK_KINDS) {
      expect(k.symbol ?? k.icon, k.id).toBeTruthy();
      expect(k.color, k.id).toBeTruthy();
    }
  });

  it('Symbole der Bibliothek gibt es wirklich', async () => {
    const { symbolById } = await import('../src/lib/symbols/library');
    for (const k of FEEDBACK_KINDS) if (k.symbol) expect(symbolById(k.symbol), k.symbol).toBeDefined();
  });

  it('Name, Hinweis und Platzhalter sind je Art verschieden und in beiden Sprachen da', () => {
    for (const lang of ['de', 'en'] as const) {
      setLanguage(lang);
      const texts = FEEDBACK_KINDS.map((k) => [kindLabel(k.id), kindHint(k.id), messagePlaceholder(k.id)]);
      for (const col of [0, 1, 2]) expect(new Set(texts.map((r) => r[col])).size, `${lang} Spalte ${col}`).toBe(5);
    }
    setLanguage('de');
    expect(messagePlaceholder('bug')).toBe('Was ist passiert? Was hast du erwartet?');
    expect(kindLabel('bug')).toBe('Fehler melden');
    setLanguage('en');
    expect(kindLabel('bug')).toBe('Report a bug');
  });
});

describe('Zeichenzähler', () => {
  it('zeigt „123 / 1000"', () => {
    expect(FEEDBACK_MAX).toBe(1000);
    expect(counterInfo(0).text).toBe('0 / 1000');
    expect(counterInfo(123).text).toBe('123 / 1000');
    expect(counterInfo(1000).text).toBe('1000 / 1000');
  });

  it('Farbe: normal, kurz vor dem Limit warnt (ab 900), am Limit voll', () => {
    expect(counterInfo(0).tone).toBe('ok');
    expect(counterInfo(899).tone).toBe('ok');
    expect(counterInfo(900).tone).toBe('warn');
    expect(counterInfo(999).tone).toBe('warn');
    expect(counterInfo(1000).tone).toBe('full');
  });

  it('sagt, wie viel noch geht, und liest Überlänge als voll', () => {
    expect(counterInfo(990).left).toBe(10);
    expect(counterInfo(1000).left).toBe(0);
    expect(counterInfo(1200)).toMatchObject({ left: 0, tone: 'full', text: '1200 / 1000' });
  });
});

describe('Senden erlaubt?', () => {
  const ok = { kind: 'bug' as const, message: 'Es klemmt', busy: false };
  it('Art und Text sind nötig, Leerraum zählt nicht', () => {
    expect(canSendFeedback(ok)).toBe(true);
    expect(canSendFeedback({ ...ok, kind: null })).toBe(false);
    expect(canSendFeedback({ ...ok, message: '' })).toBe(false);
    expect(canSendFeedback({ ...ok, message: '  \n\t ' })).toBe(false);
  });
  it('höchstens 1000 Zeichen (nach dem Kürzen), nicht während des Sendens', () => {
    expect(canSendFeedback({ ...ok, message: 'a'.repeat(1000) })).toBe(true);
    expect(canSendFeedback({ ...ok, message: `  ${'a'.repeat(1000)}  ` })).toBe(true);
    expect(canSendFeedback({ ...ok, message: 'a'.repeat(1001) })).toBe(false);
    expect(canSendFeedback({ ...ok, busy: true })).toBe(false);
  });
});

describe('Kontext, der mitgesendet wird', () => {
  it('Ansicht, Sprache, Hell/Dunkel, Fenstergröße, eingebettet', () => {
    expect(feedbackContext({ tab: 'boards', lang: 'en', dark: false, width: 390.4, height: 844.7, embedded: true })).toEqual({
      view: 'boards',
      language: 'en',
      scheme: 'light',
      viewport: { w: 390, h: 845 },
      embedded: true,
    });
    expect(feedbackContext({ tab: 'tasks', lang: 'de', dark: true, width: 1280, height: 800, embedded: false })).toMatchObject({ view: 'tasks', scheme: 'dark', embedded: false });
  });

  it('enthält nichts außer diesen Feldern (keine Person, kein Token, keine Adresse)', () => {
    const c = feedbackContext({ tab: 'watchers', lang: 'de', dark: true, width: 1, height: 1, embedded: false });
    expect(Object.keys(c).sort()).toEqual(['embedded', 'language', 'scheme', 'view', 'viewport']);
  });
});

describe('Als Text kopieren', () => {
  const item: FeedbackItem = {
    id: 'f1',
    personId: 'u1',
    personName: 'Anna',
    kind: 'bug',
    message: 'Der Knopf tut nichts.\nZweite Zeile',
    hasImage: true,
    hasThumb: true,
    status: 'neu',
    createdAt: '2026-11-05T09:00:00.000Z',
    meta: { version: '1.28.0-beta.1', channel: 'beta', view: 'boards', language: 'de', scheme: 'dark', viewport: { w: 390, h: 844 }, embedded: true, userAgent: 'Mozilla/5.0 (iPhone)' },
  };

  it('Art, Zeit, Text, Absender und die technischen Angaben für einen Fehlerbericht', () => {
    const text = feedbackAsText(item, 'Europe/Berlin');
    expect(text).toContain('Fehler melden');
    expect(text).toContain('05.11.2026 10:00');
    expect(text).toContain('Der Knopf tut nichts.\nZweite Zeile');
    expect(text).toContain('Anna');
    expect(text).toContain('1.28.0-beta.1');
    expect(text).toContain('Boards');
    expect(text).toContain('390 × 844');
    expect(text).toContain('Dunkel');
    expect(text).toContain('Home Assistant');
    expect(text).toContain('Mozilla/5.0 (iPhone)');
    expect(text).toContain('Bild');
  });

  it('ohne Angaben fehlt die Zeile nicht, sondern bleibt kurz', () => {
    const text = feedbackAsText({ ...item, personName: null, hasImage: false, meta: {} }, 'Europe/Berlin');
    expect(text).toContain('Der Knopf tut nichts.');
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
    expect(text).not.toContain('Bild');
  });

  it('englisch', () => {
    setLanguage('en');
    expect(feedbackAsText(item, 'Europe/Berlin')).toContain('Report a bug');
  });
});
