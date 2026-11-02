import type { ActivityEntry } from './api';
import { deviceTz, formatDue } from './datetime';
import { t } from './i18n/index.svelte';

/** Text für einen Verlaufseintrag: Überschrift und darunter Zeit und Person. */
export function describeActivity(
  e: ActivityEntry,
  nowMs = Date.now(),
  tz = deviceTz(),
): { title: string; detail: string } {
  const when = formatDue(e.at, nowMs, tz);
  const detail = [when, e.byName].filter(Boolean).join(' · ') + (e.source === 'push' ? t(' (per Push)') : '');
  const due = (iso: string) => formatDue(iso, nowMs, tz);

  switch (e.kind) {
    case 'created':
      return { title: t('Angelegt'), detail };
    case 'nudged':
      return { title: t('Gestupst: {to}', { to: e.to ?? '?' }) + (e.text ? ` · ${e.text}` : ''), detail };
    case 'nudge_reply':
      return { title: e.text ?? t('Antwort'), detail };
    case 'repeated':
      return { title: t('Aus Wiederholung angelegt'), detail };
    case 'watcher':
      return { title: e.text ?? t('Wächter'), detail };
    case 'completed':
      return { title: t('Erledigt'), detail };
    case 'moved':
      return { title: t('Verschoben: {from} → {to}', { from: e.from ?? '?', to: e.to ?? '?' }), detail };
    case 'reopened':
      return { title: e.to ? t('Wieder geöffnet: {to}', { to: e.to }) : t('Wieder geöffnet'), detail };
    case 'due':
      if (!e.to) return { title: t('Termin entfernt'), detail };
      if (!e.from) return { title: t('Termin gesetzt: {due}', { due: due(e.to) }), detail };
      return { title: t('Termin: {from} → {to}', { from: due(e.from), to: due(e.to) }), detail };
  }
}
