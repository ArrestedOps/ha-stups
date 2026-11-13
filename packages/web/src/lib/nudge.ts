import type { NudgeResult, NudgeTarget, OpenNudge } from './api';
import { deviceTz } from './datetime';
import { t } from './i18n/index.svelte';

/** „14:32" in der Zeitzone des Geräts (24 Stunden in beiden Sprachen) */
export function clock(iso: string, tz = deviceTz()): string {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(iso));
}

/** Hinweis unter einer Person im Stups-Sheet: warum sie nicht wählbar ist oder wann zugestellt wird */
export function targetHint(target: NudgeTarget, tz = deviceTz()): string | null {
  if (target.reason === 'no_device') return t('hat kein Push-Gerät');
  if (target.reason === 'rate' && target.retryAt) return t('wieder ab {time}', { time: clock(target.retryAt, tz) });
  if (target.deliverAt) return t('wird um {time} zugestellt', { time: clock(target.deliverAt, tz) });
  return null;
}

/** Stupsen gibt es nur bei Aufgaben, die (auch) jemand anderem zugewiesen sind – nicht bei eigenen oder unzugewiesenen */
export const canNudge = (card: { assigneeIds: string[] }, meId: string | null): boolean =>
  meId !== null && card.assigneeIds.some((id) => id !== meId);

/** Wie viele offene Stupse an mich und von mir an dieser Aufgabe hängen (für das Abzeichen) */
export function nudgeBadge(card: { openNudges?: OpenNudge[] }, meId: string | null): { toMe: OpenNudge[]; fromMe: OpenNudge[] } {
  const list = card.openNudges ?? [];
  if (!meId) return { toMe: [], fromMe: [] };
  return { toMe: list.filter((n) => n.toId === meId), fromMe: list.filter((n) => n.fromId === meId) };
}

/** Text für den Hinweis nach dem Senden */
export function sentMessage(r: NudgeResult, nameOf: (id: string) => string, tz = deviceTz()): string {
  const queued = r.sent.filter((s) => s.status === 'queued');
  const skipped = r.skipped.filter((s) => s.reason === 'rate' && s.retryAt);
  const parts = [t('Gestupst!')];
  if (queued.length > 0) parts.push(t('{names} bekommt es um {time}.', { names: queued.map((s) => nameOf(s.to)).join(', '), time: clock(queued[0]!.deliverAt, tz) }));
  if (skipped.length > 0) parts.push(t('{names}: erst wieder ab {time}.', { names: skipped.map((s) => nameOf(s.to)).join(', '), time: clock(skipped[0]!.retryAt!, tz) }));
  return parts.join(' ');
}

/** Vorauswahl im Sheet: die vom Server vorgeschlagenen, sonst niemand */
export const preselected = (targets: NudgeTarget[]): string[] => targets.filter((target) => target.preselected && target.selectable).map((target) => target.id);
