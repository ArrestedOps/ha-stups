import type { NudgeResult, NudgeTarget, OpenNudge } from './api';
import { deviceTz } from './datetime';

/** „14:32" in der Zeitzone des Geräts */
export function clock(iso: string, tz = deviceTz()): string {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(iso));
}

/** Hinweis unter einer Person im Stups-Sheet: warum sie nicht wählbar ist oder wann zugestellt wird */
export function targetHint(t: NudgeTarget, tz = deviceTz()): string | null {
  if (t.reason === 'no_device') return 'hat kein Push-Gerät';
  if (t.reason === 'rate' && t.retryAt) return `wieder ab ${clock(t.retryAt, tz)}`;
  if (t.deliverAt) return `wird um ${clock(t.deliverAt, tz)} zugestellt`;
  return null;
}

/** Stupsen gibt es nur bei Karten, die (auch) jemand anderem zugewiesen sind – nicht bei eigenen oder unzugewiesenen */
export const canNudge = (card: { assigneeIds: string[] }, meId: string | null): boolean =>
  meId !== null && card.assigneeIds.some((id) => id !== meId);

/** Wie viele offene Stupse an mich und von mir an dieser Karte hängen (für das Abzeichen) */
export function nudgeBadge(card: { openNudges?: OpenNudge[] }, meId: string | null): { toMe: OpenNudge[]; fromMe: OpenNudge[] } {
  const list = card.openNudges ?? [];
  if (!meId) return { toMe: [], fromMe: [] };
  return { toMe: list.filter((n) => n.toId === meId), fromMe: list.filter((n) => n.fromId === meId) };
}

/** Text für den Hinweis nach dem Senden */
export function sentMessage(r: NudgeResult, nameOf: (id: string) => string, tz = deviceTz()): string {
  const queued = r.sent.filter((s) => s.status === 'queued');
  const skipped = r.skipped.filter((s) => s.reason === 'rate' && s.retryAt);
  const parts = ['Gestupst!'];
  if (queued.length > 0) parts.push(`${queued.map((s) => nameOf(s.to)).join(', ')} bekommt es um ${clock(queued[0]!.deliverAt, tz)}.`);
  if (skipped.length > 0) parts.push(`${skipped.map((s) => nameOf(s.to)).join(', ')}: erst wieder ab ${clock(skipped[0]!.retryAt!, tz)}.`);
  return parts.join(' ');
}

/** Vorauswahl im Sheet: die vom Server vorgeschlagenen, sonst niemand */
export const preselected = (targets: NudgeTarget[]): string[] => targets.filter((t) => t.preselected && t.selectable).map((t) => t.id);
