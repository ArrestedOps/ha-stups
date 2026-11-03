import type { Today, TodayCard } from './api';
import { t, tn } from './i18n/index.svelte';

/** Der eine Satz unter „Heute": „3 für dich · 1 vom Haus"; ohne alles ein freundlicher Satz */
export function todaySentence(today: Pick<Today, 'house' | 'mine'>): string {
  const mine = today.mine.length;
  const house = today.house.length;
  if (mine > 0 && house > 0) return t('{mine} für dich · {house} vom Haus', { mine, house });
  if (mine > 0) return t('{n} für dich', { n: mine });
  if (house > 0) return t('{n} vom Haus', { n: house });
  return t('Heute ist nichts offen. Genieß den Tag.');
}

/** „vor 4 Min.", „vor 3 Std.", „vor 2 Tagen" (für „Waschmaschine fertig · vor 4 Min.") */
export function ageText(sinceIso: string, nowMs = Date.now()): string {
  const min = Math.max(0, Math.floor((nowMs - Date.parse(sinceIso)) / 60_000));
  if (min < 1) return t('gerade eben');
  if (min < 60) return t('vor {n} Min.', { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t('vor {n} Std.', { n: hours });
  return tn('vor {n} Tag', 'vor {n} Tagen', Math.floor(hours / 24));
}

/** Die kleine Quellzeile unter einer Karte: das Board, bei Karten vom Haus der Wächter (die Oberfläche färbt ihn türkis) */
export function sourceLine(card: Pick<TodayCard, 'boardName' | 'watcherId' | 'watcherName'>): { text: string; house: boolean } {
  if (card.watcherId) return { text: card.watcherName ?? card.boardName, house: true };
  return { text: card.boardName, house: false };
}

/** Wie dringend ist der Termin? Bestimmt die Farbe der Uhrzeit (nicht mehr ein Balken links an der Karte) */
export function dueTone(dueAt: string | null, nowMs: number, startOfTomorrowMs: number): 'overdue' | 'today' | 'later' {
  if (!dueAt) return 'later';
  const ms = Date.parse(dueAt);
  if (ms < nowMs) return 'overdue';
  return ms < startOfTomorrowMs ? 'today' : 'later';
}
