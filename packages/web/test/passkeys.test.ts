import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/lib/api';
import { passkeyErrorText, passkeysSupported } from '../src/lib/passkeys';

describe('Meldungen zu Passkeys', () => {
  it('Fehler vom Server zeigen den Text des Servers', () => {
    expect(passkeyErrorText(new ApiError('Mehr als 10 Passkeys gehen nicht', 409))).toBe('Mehr als 10 Passkeys gehen nicht');
  });

  it('Abbrechen am Gerät, schon vorhandener Passkey und falsche Adresse haben eigene Texte', () => {
    expect(passkeyErrorText({ name: 'NotAllowedError' })).toMatch(/Abgebrochen/);
    expect(passkeyErrorText({ name: 'WebAuthnError', code: 'ERROR_CEREMONY_ABORTED' })).toMatch(/Abgebrochen/);
    expect(passkeyErrorText({ name: 'InvalidStateError' })).toMatch(/schon einen Passkey/);
    expect(passkeyErrorText({ code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' })).toMatch(/schon einen Passkey/);
    expect(passkeyErrorText({ name: 'SecurityError' })).toMatch(/HTTPS/);
  });

  it('alles andere bekommt eine allgemeine Meldung', () => {
    expect(passkeyErrorText(new Error('x'))).toBe('Das hat mit dem Passkey nicht geklappt');
    expect(passkeyErrorText(null)).toBe('Das hat mit dem Passkey nicht geklappt');
  });

  it('ohne Browser-Umgebung gelten Passkeys als nicht unterstützt', () => {
    expect(passkeysSupported()).toBe(false);
  });
});
