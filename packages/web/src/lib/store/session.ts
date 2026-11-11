import { api, setUnauthorizedHandler } from '../api';
import { hueFromStorage } from '../accent';
import { applyHeaderHiding } from '../hideHaHeader';
import { i18n, languageFromStorage } from '../i18n/index.svelte';
import { startSync } from '../sync';
import { reportPanelPath, takeDeepLink } from './dashboard-link';
import { ensureColumn, refresh } from './load';
import { memo } from './memo';
import { openCard, restoreView } from './navigation';
import { ACCENT_KEY, LANGUAGE_KEY, applyAccentHue, applyLanguage } from './preferences';
import { applyRole, feat, ui } from './state.svelte';
import { errorText } from './toasts';

/** Nach einer erfolgreichen Anmeldung oder Einrichtung: alles frisch laden (Sitzung, Synchronisierung, Ansicht) */
export function reloadApp(): void {
  location.reload();
}

export async function logout(): Promise<void> {
  try {
    await api.logout();
  } finally {
    reloadApp();
  }
}

export async function init(): Promise<void> {
  applyLanguage(languageFromStorage(memo.get(LANGUAGE_KEY)));
  applyAccentHue(hueFromStorage(memo.get(ACCENT_KEY)));
  try {
    ui.caps = await api.capabilities().catch(() => null);
    if (ui.caps?.auth === 'session') {
      setUnauthorizedHandler(() => {
        ui.gate = 'login'; // Sitzung abgelaufen: zurück zur Anmeldung
      });
      const status = await api.authStatus();
      if (status.setupRequired || !status.authenticated) {
        ui.gate = status.setupRequired ? 'setup' : 'login';
        ui.ready = true;
        return;
      }
    }
    const me = await api.me();
    ui.me = me.user;
    // Die Wahl der Person gilt auf allen Geräten. Meldet dieses Gerät eine andere Sprache als zuletzt, erfährt es der Server (für Push)
    applyLanguage(me.user.languageChoice);
    applyAccentHue(me.user.accentHue ?? null);
    if (me.allowed && me.user.language !== i18n.lang) void api.setLanguage(me.user.languageChoice, i18n.lang).catch(() => undefined);
    applyRole(me);
    ui.onboarding = { needs: me.allowed && me.needsOnboarding, progress: me.onboardingProgress ?? null };
    if (!me.allowed) {
      // Home Assistant kennt den Benutzer, Stups lässt ihn nicht hinein: nur die Erklärung zeigen
      ui.allowed = false;
      ui.ready = true;
      return;
    }
    const [boards, settings] = await Promise.all([api.boards(), api.settings()]);
    ui.people = me.people;
    ui.boards = boards;
    ui.settings = settings;
    const remembered = memo.get('stups.board');
    ui.boardId = boards.find((b) => b.id === remembered)?.id ?? boards[0]?.id ?? null;
    ui.columnId = memo.get('stups.column');
    restoreView();
    if (ui.boardId) ui.view = await api.board(ui.boardId);
    ensureColumn();
    ui.watchers = await api.watchers().catch(() => null);
    ui.archivedBoards = ui.isChild ? [] : await api.archivedBoards().catch(() => []);
    ui.ready = true;
  } catch (e) {
    ui.fatal = errorText(e);
    return;
  }

  if (feat.haUi) applyHeaderHiding();
  const cardId = takeDeepLink();
  if (cardId) openCard(cardId);
  reportPanelPath();
  startSync(
    (info) => void refresh(info),
    (online) => (ui.online = online),
  );
}
