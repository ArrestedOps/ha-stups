import { api, ApiError, type PasskeyInfo } from './api';

/** Passkeys brauchen eine sichere Seite (HTTPS oder localhost) und einen Browser mit WebAuthn */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true && 'PublicKeyCredential' in window;
}

// Die Bibliothek wird erst gebraucht, wenn jemand einen Passkey nutzt
const browser = () => import('@simplewebauthn/browser');

export async function signInWithPasskey(): Promise<void> {
  const { startAuthentication } = await browser();
  const { ceremonyId, options } = await api.passkeyLoginOptions();
  const response = await startAuthentication({ optionsJSON: options });
  await api.passkeyLogin(ceremonyId, response);
}

export async function createPasskey(name: string): Promise<PasskeyInfo> {
  const { startRegistration } = await browser();
  const { ceremonyId, options } = await api.passkeyRegistrationOptions();
  const response = await startRegistration({ optionsJSON: options });
  return api.addPasskey({ ceremonyId, response, name });
}

/** Meldung für Fehler vom Server und vom Gerät. Abbrechen am Gerät ist kein Fehler, den man erklären müsste. */
export function passkeyErrorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  const name = (err as { name?: string; code?: string } | null)?.name;
  const code = (err as { code?: string } | null)?.code;
  if (name === 'NotAllowedError' || code === 'ERROR_CEREMONY_ABORTED') return 'Abgebrochen oder vom Gerät abgelehnt';
  if (name === 'InvalidStateError' || code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'Dieses Gerät hat schon einen Passkey für Stups';
  if (name === 'SecurityError') return 'Passkeys gehen nur über die HTTPS-Adresse von Stups';
  return 'Das hat mit dem Passkey nicht geklappt';
}
