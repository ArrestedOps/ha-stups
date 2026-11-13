import { describe, expect, it } from 'vitest';
import { mayConfirm, waitingForConfirmation } from '../src/lib/confirm';

const ben = { id: 'ben', isChild: false };
const oma = { id: 'oma', isChild: false };
const mia = { id: 'mia', isChild: true };
const child = { id: 'mia', confirmers: ['ben'] };

describe('mayConfirm', () => {
  it('die gewählten Personen dürfen, andere Erwachsene nicht', () => {
    expect(mayConfirm(ben, false, child)).toBe(true);
    expect(mayConfirm(oma, false, child)).toBe(false);
  });

  it('Administratoren immer', () => {
    expect(mayConfirm(oma, true, child)).toBe(true);
  });

  it('ohne Auswahl alle Erwachsenen', () => {
    expect(mayConfirm(oma, false, { id: 'mia', confirmers: [] })).toBe(true);
  });

  it('nie ein Kind und nie das Kind selbst', () => {
    expect(mayConfirm(mia, true, child)).toBe(false);
    expect(mayConfirm({ id: 'mia', isChild: false }, true, child)).toBe(false);
    expect(mayConfirm({ id: 'lena', isChild: true }, false, { id: 'mia', confirmers: [] })).toBe(false);
  });

  it('ohne bekanntes Kind nur Administratoren', () => {
    expect(mayConfirm(ben, false, undefined)).toBe(false);
    expect(mayConfirm(ben, true, undefined)).toBe(true);
  });

  it('niemand angemeldet: nein', () => {
    expect(mayConfirm(null, true, child)).toBe(false);
  });
});

describe('waitingForConfirmation', () => {
  it('nur eine offene Aufgabe mit Anfrage wartet', () => {
    expect(waitingForConfirmation({ confirmRequestedAt: '2026-11-04T09:00:00Z', completedAt: null })).toBe(true);
    expect(waitingForConfirmation({ confirmRequestedAt: null, completedAt: null })).toBe(false);
    expect(waitingForConfirmation({ confirmRequestedAt: '2026-11-04T09:00:00Z', completedAt: '2026-11-04T10:00:00Z' })).toBe(false);
  });
});
