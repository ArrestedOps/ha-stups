import { api } from '../api';
import { readHaDefaultPanel, resolveDashboardPath, type DashboardSource } from '../dashboard';
import { t } from '../i18n/index.svelte';
import { ui } from './state.svelte';
import { toast } from './toasts';

// ---------- Home Assistant: Link zur Karte, Panel-Pfad, Zurück zum Dashboard ----------

/** Aus dem Push: ?card=<id> in der Adresse von Home Assistant (außerhalb des iframes). */
export function takeDeepLink(): string | null {
  try {
    const url = new URL(window.parent.location.href);
    const id = url.searchParams.get('card');
    if (id) {
      url.searchParams.delete('card');
      window.parent.history.replaceState(null, '', url.toString());
    }
    return id;
  } catch {
    return null;
  }
}

/** Meldet dem Server den Pfad des Panels, damit Push-Nachrichten die App öffnen können. */
export function reportPanelPath(): void {
  try {
    if (window.parent === window) return;
    const path = window.parent.location.pathname;
    // Nur Administratoren dürfen den Pfad ändern (er steckt in jeder Push-Adresse); andere melden nichts
    if (ui.isAdmin && ui.settings && ui.settings.panelPath !== path) void api.saveSettings({ panelPath: path }).catch(() => undefined);
  } catch {
    /* kein Zugriff auf das übergeordnete Fenster */
  }
}

/** Das Ziel des Home-Knopfs für diese Person (ein Kind immer der Standard) */
export function dashboardTarget(): { path: string; source: DashboardSource } {
  return resolveDashboardPath({
    person: ui.isChild ? null : (ui.me?.dashboardPath ?? null),
    haDefaultPanel: readHaDefaultPanel(),
    addon: ui.settings?.effectiveDashboardPath ?? null,
  });
}

export function goToDashboard(): void {
  const { path } = dashboardTarget();
  try {
    if (window.parent === window) {
      toast(t('Zurück zum Dashboard geht nur innerhalb von Home Assistant'));
      return;
    }
    window.parent.history.pushState(null, '', path);
    window.parent.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  } catch {
    try {
      window.top!.location.assign(path);
    } catch {
      toast(t('Das Dashboard konnte nicht geöffnet werden'), { tone: 'error' });
    }
  }
}
