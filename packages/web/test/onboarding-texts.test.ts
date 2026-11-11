import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import OnboardingDone from '../src/components/OnboardingDone.svelte';
import OnboardingTest from '../src/components/OnboardingTest.svelte';
import { ob } from '../src/lib/onboarding.svelte';

/**
 * Die Einrichtung sagt, was wirklich der Fall ist: ein gescheiterter Sendeversuch ist kein Zustellproblem, und das Versprechen
 * „dein Zuhause meldet sich von selbst" gibt es nur, wenn ein Wächter eingerichtet wurde.
 */
const html = (c: any, props: Record<string, unknown> = {}) => render(c, { props }).body;
const decode = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/<!--[^>]*-->/g, '');

beforeEach(() => {
  Object.assign(ob, { test: 'idle', testDone: false, testError: '', watchersDone: false, peopleDone: false, watcherNames: [], peopleNames: [] });
});

describe('Abschlussseite', () => {
  it('ohne eingerichteten Wächter kein Versprechen, dass sich das Zuhause von selbst meldet', () => {
    const out = decode(html(OnboardingDone));
    expect(out).not.toContain('Ab jetzt meldet sich dein Zuhause von selbst.');
    expect(out).toContain('Stups ist bereit. Du kannst jetzt mit deinen Aufgaben starten.');
  });

  it('mit mindestens einem Wächter bleibt es bei dem Satz', () => {
    Object.assign(ob, { watchersDone: true, watcherNames: ['Waschmaschine'] });
    const out = decode(html(OnboardingDone));
    expect(out).toContain('Ab jetzt meldet sich dein Zuhause von selbst.');
    expect(out).not.toContain('Stups ist bereit.');
  });

  it('„Testnachricht gesendet“ behauptet nicht, dass sie angekommen ist', () => {
    ob.testDone = true;
    const out = decode(html(OnboardingDone));
    expect(out).toContain('Testnachricht gesendet');
    expect(out).not.toMatch(/angekommen/);
  });
});

describe('Testnachricht: gescheitert, gesendet', () => {
  it('ein gescheiterter Sendeversuch heißt „konnte nicht gesendet werden“ und nennt den Grund des Servers, ohne Handy-Rat', () => {
    Object.assign(ob, { test: 'failed', testError: 'Für dich ist noch kein Push-Weg eingetragen' });
    const out = decode(html(OnboardingTest, { member: true }));
    expect(out).toContain('Die Testnachricht konnte nicht gesendet werden.');
    expect(out).toContain('Für dich ist noch kein Push-Weg eingetragen');
    expect(out).not.toContain('Die Nachricht ist nicht angekommen.');
    expect(out).not.toContain('Mitteilungen erlaubt');
    expect(out).toContain('Weiter ohne Test');
  });

  it('ohne Grund vom Server bleibt ein allgemeiner Satz zur Verbindung', () => {
    Object.assign(ob, { test: 'failed', testError: '' });
    const out = decode(html(OnboardingTest, { member: true }));
    expect(out).toContain('Die Testnachricht konnte nicht gesendet werden.');
    expect(out).toContain('Prüfe die Verbindung zu Home Assistant.');
  });

  it('gesendet: die Frage, ob sie angekommen ist, und erst hier der Hinweis zur Companion App und den Mitteilungen', () => {
    Object.assign(ob, { test: 'sent', testDone: true });
    const out = decode(html(OnboardingTest, { member: true }));
    expect(out).toContain('Gesendet. Schau auf dein Handy: Hast du die Nachricht bekommen?');
    expect(out).toContain('Nichts zu sehen? Prüfe, ob die Companion App auf dem Handy angemeldet ist und Mitteilungen erlaubt sind.');
    expect(out).not.toContain('konnte nicht gesendet werden');
  });
});
