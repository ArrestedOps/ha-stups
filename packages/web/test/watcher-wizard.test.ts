import { describe, expect, it } from 'vitest';
import { backAction } from '../src/lib/watcher-wizard';

describe('Zurück im Assistenten (reine Schrittlogik)', () => {
  it('Schritt 4, 3, 2 gehen je einen Schritt zurück', () => {
    expect(backAction(4, false)).toEqual({ kind: 'step', step: 3 });
    expect(backAction(3, false)).toEqual({ kind: 'step', step: 2 });
    expect(backAction(2, false)).toEqual({ kind: 'step', step: 1 });
  });

  it('am ersten Schritt verlässt Zurück den Assistenten (zur vorherigen Auswahl bzw. Schließen)', () => {
    expect(backAction(1, false)).toEqual({ kind: 'leave' });
  });

  it('eine offene Entitätssuche schließt zuerst, in jedem Schritt; der Schritt bleibt', () => {
    for (const step of [1, 2, 3, 4] as const) expect(backAction(step, true)).toEqual({ kind: 'closePicker' });
  });
});
