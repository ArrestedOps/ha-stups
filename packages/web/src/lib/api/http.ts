import { i18n, t } from '../i18n/index.svelte';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** der ganze Antwortinhalt, z. B. die abgelehnten Empfänger beim Stupsen */
    readonly data?: unknown,
  ) {
    super(message);
  }
}

/** Wird aufgerufen, wenn der Server „nicht angemeldet" meldet (Sitzung abgelaufen oder beendet) */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

/** Jede ändernde Anfrage trägt diese Kopfzeile; der Server lehnt sonst Anfragen ab, die von einer fremden Seite kommen */
export const clientHeaders = () => ({ 'x-stups-client': '1', 'x-stups-language': i18n.lang });

// Relative Adresse: funktioniert unter dem wechselnden Ingress-Pfad von Home Assistant.
/** Eine Anfrage an die API mit gemeinsamer Fehlerbehandlung (auch für Uploads: 401 führt zur Anmeldung) */
/** Zeitlimit je Anfrage; Uploads (Dateien) brauchen auf langsamem WLAN länger */
export const REQUEST_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

export async function send<T>(path: string, init: RequestInit, timeoutMs = init.body instanceof FormData || init.body instanceof Blob ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS): Promise<T> {
  return (await sendRaw<T>(path, init, timeoutMs)).data;
}

/** Wie `send`, dazu die Kopfzeilen der Antwort (für Listen mit Gesamtzahl) */
async function sendRaw<T>(path: string, init: RequestInit, timeoutMs: number): Promise<{ data: T; headers: Headers }> {
  // Ohne Zeitlimit bliebe eine hängende Anfrage ewig „lädt": nach 30 Sekunden Fehler statt endlosem Warten
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  init.signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    let res: Response;
    try {
      res = await fetch(`api/${path}`, { ...init, signal: controller.signal });
    } catch {
      throw timedOut ? new ApiError(t('Zeitüberschreitung: der Server antwortet nicht'), 0) : new ApiError(t('Keine Verbindung zum Server'), 0);
    }
    return { data: await readResponse<T>(path, res, () => timedOut), headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

async function readResponse<T>(path: string, res: Response, timedOut: () => boolean): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => (timedOut() ? undefined : {}));
  if (data === undefined) throw new ApiError(t('Zeitüberschreitung: der Server antwortet nicht'), 0);
  if (res.status === 401 && !path.startsWith('auth/')) onUnauthorized?.();
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? t('Fehler {status}', { status: res.status }), res.status, data);
  return data as T;
}

function req<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return send<T>(path, {
    method,
    headers: body === undefined ? clientHeaders() : { ...clientHeaders(), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

export const get = <T>(p: string, signal?: AbortSignal) => req<T>('GET', p, undefined, signal);

/** Eine Liste samt Gesamtzahl aus `x-total-count` (NaN, wenn der Server sie nicht nennt) */
export async function getList<T>(p: string, signal?: AbortSignal): Promise<{ items: T[]; total: number }> {
  const { data, headers } = await sendRaw<T[]>(p, { method: 'GET', headers: clientHeaders(), signal }, REQUEST_TIMEOUT_MS);
  const total = Number(headers.get('x-total-count') ?? Number.NaN);
  return { items: data, total };
}
export const post = <T>(p: string, b: unknown = {}, signal?: AbortSignal) => req<T>('POST', p, b, signal);
export const patch = <T>(p: string, b: unknown) => req<T>('PATCH', p, b);
export const put = <T>(p: string, b: unknown) => req<T>('PUT', p, b);
export const del = (p: string) => req<void>('DELETE', p);
