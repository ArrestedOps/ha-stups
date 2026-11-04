/** Die Reiter der Leiste unten: Aufgaben (mit Heute und Kalender), Boards und Wächter (das frühere Zuhause) */
export type Tab = 'tasks' | 'boards' | 'watchers';

export const TABS: readonly Tab[] = ['tasks', 'boards', 'watchers'];

/**
 * Der gemerkte Reiter von diesem Gerät. Die alten Namen führen zu den neuen: Heute, Agenda und Kalender sind jetzt Aufgaben,
 * Zuhause (und der noch ältere Name „watchers") ist der Reiter Wächter; alles Unbekannte ist Aufgaben.
 */
export function migrateTab(raw: string | null | undefined): Tab {
  if (raw === 'today' || raw === 'agenda' || raw === 'calendar') return 'tasks';
  if (raw === 'home') return 'watchers';
  return (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'tasks';
}

/**
 * Auf welchem Reiter die App startet: auf **Aufgaben**. Nur Boards wird von diesem Gerät gemerkt; Wächter führt zu Aufgaben, denn
 * wer dort zuletzt war, will beim Öffnen sehen, was für ihn dran ist.
 */
export function startTab(raw: string | null | undefined, visible: Tab[]): Tab {
  const tab = migrateTab(raw);
  return tab === 'boards' && visible.includes(tab) ? tab : 'tasks';
}

/**
 * Welche Reiter es gibt. „Wächter" gibt es nur mit Home Assistant (im Add-on immer, im eigenen Container, wenn er Wächter kann)
 * und nie für ein Kind (der Server verweigert sie ohnehin): Kind und Docker ohne Home Assistant haben zwei Reiter.
 */
export function visibleTabs(ctx: { watchers: boolean; isChild: boolean }): Tab[] {
  return TABS.filter((tab) => tab !== 'watchers' || (ctx.watchers && !ctx.isChild));
}
