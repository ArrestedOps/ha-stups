import type { ActivityEntry } from './api';
import { deviceTz, formatDue } from './datetime';

/** Text für einen Verlaufseintrag: Überschrift und darunter Zeit und Person. */
export function describeActivity(
  e: ActivityEntry,
  nowMs = Date.now(),
  tz = deviceTz(),
): { title: string; detail: string } {
  const when = formatDue(e.at, nowMs, tz);
  const detail = [when, e.byName].filter(Boolean).join(' · ') + (e.source === 'push' ? ' (per Push)' : '');
  const due = (iso: string) => formatDue(iso, nowMs, tz);

  switch (e.kind) {
    case 'created':
      return { title: 'Angelegt', detail };
    case 'nudged':
      return { title: `Gestupst: ${e.to ?? '?'}${e.text ? ` · ${e.text}` : ''}`, detail };
    case 'nudge_reply':
      return { title: `${e.text ?? 'Antwort'}`, detail };
    case 'repeated':
      return { title: 'Aus Wiederholung angelegt', detail };
    case 'watcher':
      return { title: e.text ?? 'Wächter', detail };
    case 'completed':
      return { title: 'Erledigt', detail };
    case 'moved':
      return { title: `Verschoben: ${e.from ?? '?'} → ${e.to ?? '?'}`, detail };
    case 'reopened':
      return { title: e.to ? `Wieder geöffnet: ${e.to}` : 'Wieder geöffnet', detail };
    case 'due':
      if (!e.to) return { title: 'Termin entfernt', detail };
      if (!e.from) return { title: `Termin gesetzt: ${due(e.to)}`, detail };
      return { title: `Termin: ${due(e.from)} → ${due(e.to)}`, detail };
  }
}
