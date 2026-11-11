import { ApiError } from '../api';
import { t } from '../i18n/index.svelte';
import { refresh } from './load';
import { ui, type Toast } from './state.svelte';

// ---------- Hinweise ----------

let toastId = 0;

export function toast(text: string, opts: { tone?: Toast['tone']; action?: Toast['action'] } = {}): void {
  const t: Toast = { id: ++toastId, text, tone: opts.tone ?? 'info', action: opts.action };
  ui.toasts.push(t);
  setTimeout(() => dismissToast(t.id), opts.action ? 7000 : 4000);
}

export function dismissToast(id: number): void {
  const i = ui.toasts.findIndex((t) => t.id === id);
  if (i >= 0) ui.toasts.splice(i, 1);
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : t('Etwas ist schiefgelaufen'));

/**
 * Wie `act`, sagt aber, ob es geklappt hat. `act` gibt bei einem Fehler und bei einer Aktion ohne Ergebnis (löschen)
 * beide `undefined` zurück; wer danach etwas bestätigt („Karte gelöscht“, „Gespeichert“), braucht dieses Ergebnis.
 */
export async function actResult<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    const value = await fn();
    await refresh();
    return { ok: true, value };
  } catch (e) {
    toast(errorText(e), { tone: 'error' });
    await refresh();
    return { ok: false };
  }
}

/** Führt eine Aktion aus, lädt danach neu und meldet Fehler als Hinweis. */
export async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
  const r = await actResult(fn);
  return r.ok ? r.value : undefined;
}
