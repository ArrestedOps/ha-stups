import { ApiError } from '../api';
import { t } from '../i18n/index.svelte';
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
