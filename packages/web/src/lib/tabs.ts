/** Die vier Reiter der Leiste unten: Heute, Boards, Kalender, Zuhause (die Wächter) */
export type Tab = 'today' | 'boards' | 'calendar' | 'home';

export const TABS: readonly Tab[] = ['today', 'boards', 'calendar', 'home'];

/** Der gemerkte Reiter von diesem Gerät. Die alten Namen (Agenda, Wächter) führen zu den neuen; alles Unbekannte ist Heute. */
export function migrateTab(raw: string | null | undefined): Tab {
  if (raw === 'agenda') return 'today';
  if (raw === 'watchers') return 'home';
  return (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'today';
}

/**
 * Auf welchem Reiter die App startet: auf **Heute**. Nur Boards und Kalender werden von diesem Gerät gemerkt; Zuhause (und der alte
 * Name „watchers") führt zu Heute, denn wer dort zuletzt war, will beim Öffnen sehen, was für ihn dran ist.
 */
export function startTab(raw: string | null | undefined, visible: Tab[]): Tab {
  const tab = migrateTab(raw);
  return (tab === 'boards' || tab === 'calendar') && visible.includes(tab) ? tab : 'today';
}

/**
 * Welche Reiter es gibt. „Zuhause" zeigt die Wächter: nur mit Home Assistant (im Add-on immer, im eigenen Container, wenn er
 * Wächter kann) und nie für ein Kind (der Server verweigert sie ohnehin).
 */
export function visibleTabs(ctx: { watchers: boolean; isChild: boolean }): Tab[] {
  return TABS.filter((tab) => tab !== 'home' || (ctx.watchers && !ctx.isChild));
}
