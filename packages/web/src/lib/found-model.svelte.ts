import { api, ApiError } from './api';
import { startOfTomorrow } from './datetime';
import { blockReason, hitId, pickableInGroup } from './foundGroups';
import { t, tn } from './i18n/index.svelte';
import type { Recurrence } from './recurrence';
import { clearAll, prune, selectAll, toggle, type Selection } from './selection';
import { refresh, toast, ui } from './store.svelte';
import type { WatcherSuggestion, WatcherTemplate } from './watcher-types';

/**
 * „Gefunden“: was Handy (FoundList im Fenster) und Desktop (FoundDesk im Reiter) gemeinsam brauchen. Die Treffer von Home Assistant, die
 * ausgeblendeten, die Vorlagen und die Auswahl; dazu die Aktionen (ausblenden, einblenden, wiederkehrende Aufgabe anlegen).
 * Gewählt wird nur innerhalb einer Vorlage und Fassung; was nicht passt, bleibt sichtbar und nennt seinen Grund (`blocked`).
 */
export class FoundModel {
  suggestions = $state<WatcherSuggestion[] | null>(null);
  /** Ausgeblendet: nicht mehr vorgeschlagen, wieder einblendbar */
  hidden = $state<WatcherSuggestion[]>([]);
  templates = $state<WatcherTemplate[]>([]);
  error = $state('');
  selection = $state<Selection>(clearAll());
  busy = $state<string | null>(null);

  readonly selectedHits = $derived((this.suggestions ?? []).filter((s) => this.selection.has(hitId(s))));
  readonly device = $derived(this.templates.filter((x) => x.kind === 'watcher'));
  readonly recurring = $derived(this.templates.filter((x) => x.kind === 'recurring'));

  titleOf = (id: string): string => this.templates.find((x) => x.id === id)?.title ?? id;

  async load(): Promise<void> {
    this.templates = await api.watcherTemplates().catch(() => []);
    try {
      await this.reload();
    } catch (e) {
      this.suggestions = [];
      this.error = e instanceof ApiError ? e.message : t('Keine Verbindung zu Home Assistant');
    }
  }

  async reload(): Promise<void> {
    const r = await api.watcherSuggestions();
    this.suggestions = r.items;
    this.hidden = r.hidden ?? [];
    // Treffer, die es nicht mehr gibt (eingerichtet, ausgeblendet, in Home Assistant weg), fallen aus der Auswahl
    this.selection = prune(this.selection, r.items.map(hitId));
  }

  // ---------- Auswahl ----------

  isOn = (s: WatcherSuggestion): boolean => this.selection.has(hitId(s));
  /** Der Grund, warum der Treffer zur Auswahl nicht passt (null: er passt oder nichts ist gewählt) */
  blocked = (s: WatcherSuggestion): string | null => blockReason(this.selectedHits, s, this.titleOf);
  pick = (s: WatcherSuggestion): void => {
    if (this.blocked(s)) return;
    this.selection = toggle(this.selection, hitId(s));
  };
  /** „Stattdessen wählen“: die bisherige Auswahl fällt weg, dieser Treffer beginnt eine neue */
  replaceWith = (s: WatcherSuggestion): void => {
    this.selection = new Set([hitId(s)]);
  };
  /** „Alle auswählen“ im Kopf einer Gruppe: alle, die zur Auswahl passen; sind sie schon alle gewählt, wieder ab */
  pickGroup = (items: WatcherSuggestion[]): void => {
    const ids = pickableInGroup(items, this.selectedHits).map(hitId);
    this.selection = ids.length > 0 && ids.every((id) => this.selection.has(id)) ? new Set([...this.selection].filter((id) => !ids.includes(id))) : selectAll(this.selection, ids);
  };
  clear = (): void => {
    this.selection = clearAll();
  };

  // ---------- Aktionen ----------

  async hide(s: WatcherSuggestion): Promise<void> {
    try {
      await api.hideSuggestion(s.templateId, s.entityId);
      toast(t('„{name}“ ausgeblendet. Stups schlägt es nicht mehr vor.', { name: s.name }));
      await this.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Ausblenden fehlgeschlagen'), { tone: 'error' });
    }
  }

  async hideSelected(): Promise<void> {
    const hits = this.selectedHits.map((s) => ({ templateId: s.templateId, entityId: s.entityId }));
    if (hits.length === 0) return;
    try {
      await api.hideSuggestions(hits);
      toast(tn('{n} Treffer ausgeblendet. Stups schlägt sie nicht mehr vor.', '{n} Treffer ausgeblendet. Stups schlägt sie nicht mehr vor.', hits.length));
      this.selection = clearAll();
      await this.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Ausblenden fehlgeschlagen'), { tone: 'error' });
    }
  }

  async unhide(s: WatcherSuggestion): Promise<void> {
    try {
      await api.unhideSuggestion(s.templateId, s.entityId);
      await this.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Einblenden fehlgeschlagen'), { tone: 'error' });
    }
  }

  /** Eine wiederkehrende Aufgabe aus der Vorlage: morgen zur Standard-Uhrzeit, danach wie die Wiederholung es sagt */
  async createRecurring(tpl: WatcherTemplate, boardId: string): Promise<void> {
    if (!tpl.recurring || !boardId || this.busy) return;
    this.busy = tpl.id;
    try {
      const view = await api.board(boardId);
      const column = view.columns.find((c) => !c.isDone && !c.isPlanned) ?? view.columns[0];
      if (!column) throw new Error(t('Das Board hat keine Spalte'));
      const [h, m] = (ui.settings?.defaultDueTime ?? '09:00').split(':').map(Number) as [number, number];
      const due = new Date(startOfTomorrow() + (h * 60 + m) * 60_000);
      await api.createCard(boardId, { columnId: column.id, title: tpl.recurring.title, dueAt: due.toISOString(), recurrence: tpl.recurring.recurrence as unknown as Recurrence });
      toast(t('Aufgabe „{title}“ angelegt', { title: tpl.recurring.title }));
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('Anlegen fehlgeschlagen'), { tone: 'error' });
    }
    this.busy = null;
  }
}
