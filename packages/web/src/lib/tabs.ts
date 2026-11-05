/** Die Reiter der Leiste unten: Aufgaben (mit Heute und Kalender), Boards und Wächter (das frühere Zuhause) */
export type Tab = 'tasks' | 'boards' | 'watchers';

export const TABS: readonly Tab[] = ['tasks', 'boards', 'watchers'];

/**
 * Ein gespeicherter Reitername (aus einer älteren Fassung) als heutiger Reiter. Die alten Namen führen zu den neuen: Heute, Agenda
 * und Kalender sind jetzt Aufgaben, Zuhause (und der noch ältere Name „watchers") ist der Reiter Wächter; alles Unbekannte ist Aufgaben.
 * Der Start richtet sich nicht danach (siehe `startTab`).
 */
export function migrateTab(raw: string | null | undefined): Tab {
  if (raw === 'today' || raw === 'agenda' || raw === 'calendar') return 'tasks';
  if (raw === 'home') return 'watchers';
  return (TABS as readonly string[]).includes(raw ?? '') ? (raw as Tab) : 'tasks';
}

/**
 * Auf welchem Reiter die App startet: immer auf **Aufgaben**, auch nach dem Neuladen und wenn dieses Gerät früher auf Boards oder
 * Wächter war. Wer die App öffnet, will sehen, was für ihn dran ist; der Reiter wird deshalb nirgends gemerkt (ein alter Eintrag
 * `stups.tab` wird nicht mehr gelesen). Ein Link auf eine Karte öffnet sie wie bisher über dem Reiter Aufgaben.
 */
export const startTab = (): Tab => 'tasks';

/**
 * Welche Reiter es gibt. „Wächter" gibt es nur mit Home Assistant (im Add-on immer, im eigenen Container, wenn er Wächter kann)
 * und nie für ein Kind (der Server verweigert sie ohnehin): Kind und Docker ohne Home Assistant haben zwei Reiter.
 */
export function visibleTabs(ctx: { watchers: boolean; isChild: boolean }): Tab[] {
  return TABS.filter((tab) => tab !== 'watchers' || (ctx.watchers && !ctx.isChild));
}
