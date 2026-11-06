import { api, ApiError, type BoardView, type HaEntity, type SavedWatcher, type WatcherItem, type WatcherRun } from './api';
import { t } from './i18n/index.svelte';
import type { EntityHistory } from './history';
import { can, closeSheet, openSettings, openSheet, toast, ui } from './store.svelte';
import type { OrderView, TemplateDraft, WatcherTemplate } from './watcher-types';
import { applyEntity, applyTemplate, emptyForm, formProblem, fromWatcher, stepProblem, toInput, type WatcherForm } from './watchers';
import { askCard, metNowOf } from './watcher-ask';
import { backAction } from './watcher-wizard';

export type Hit = { entityId: string; name: string; label?: string; unit?: string; draft?: TemplateDraft };

/**
 * Der Zustand des Wächter-Editors, den Ablauf (Bearbeiten) und Assistent (Anlegen) teilen: das Formular, was vom Server dazukommt
 * (Wächter, Läufe, Vorlagen, Board, Verlauf der Entität, Reihenfolge) und die Aktionen (speichern, testen, pausieren, löschen).
 * Die Oberfläche hängt nur an diesen Feldern; die Rechnerei steckt in `watchers.ts`, `watcher-flow.ts` und `history.ts`.
 */
export class WatcherEditor {
  readonly id: string | null;
  loading = $state(true);
  busy = $state(false);
  form = $state<WatcherForm>(emptyForm(ui.boardId ?? '', ''));
  item = $state<WatcherItem | null>(null);
  runs = $state<WatcherRun[]>([]);
  templates = $state<WatcherTemplate[]>([]);
  /** Warum sich die Karte nicht von selbst erledigen kann (leer = sie kann) */
  selfNote = $state('');
  view = $state<BoardView | null>(null);
  /** Assistent: Schritt 1 bis 4 */
  step = $state<1 | 2 | 3 | 4>(1);
  /** Schritte, die der Mensch schon durchlaufen hat (nur diese lassen sich oben antippen) */
  reached = $state(1);
  /** Verlauf der Entität (null: noch nicht geladen) und ob er gerade lädt */
  history = $state<EntityHistory | null>(null);
  historyBusy = $state(false);
  /** Reihenfolge für „An wen" */
  order = $state<OrderView | null>(null);
  /** Welche Suche offen ist (Auslöser oder „erledigt sich selbst") */
  picking = $state<'trigger' | 'done' | null>(null);
  query = $state('');
  searchDomain = $state('');
  /** Nur Administratoren und Personen mit dem Recht „watchers“ ändern Wächter; alle anderen sehen Einstellungen und Verlauf lesend */
  readonly readOnly = $derived(!can('watchers'));
  private historySeq = 0;
  private orderSeq = 0;
  private viewSeq = 0;

  constructor(id: string | null) {
    this.id = id;
  }

  /** Aus Einstellungen › Wächter geht es dorthin zurück; aus dem Reiter Wächter schließt es das Fenster, von anderswo geht es in die Einstellungen */
  back = (): void => {
    const fromSettings = ui.sheet?.type === 'watcher' && ui.sheet.from === 'settings';
    if (!fromSettings && ui.tab === 'watchers') closeSheet();
    else openSettings('watchers');
  };

  personName = (pid: string): string => ui.people.find((p) => p.id === pid)?.displayName ?? '?';

  async load(template: string | undefined, hit: Hit | undefined): Promise<void> {
    try {
      if (this.id) {
        const res = await api.watchers();
        const found = res.items.find((w) => w.id === this.id);
        if (found) {
          this.item = found;
          const names = new Map<string, HaEntity>();
          // Der Name der beobachteten Entität steht schon im Wächter (auch für Mitglieder ohne Suche)
          if (found.entityName) names.set(found.trigger.entityId, { entityId: found.trigger.entityId, name: found.entityName, state: found.entityState ?? '', unit: found.entityUnit, domain: '' });
          // Namen der Entitäten nachschlagen (Home Assistant liefert sie in der Suche; nur Administratoren)
          for (const eid of can('watchers') ? [found.trigger.entityId, found.done?.entityId].filter((x): x is string => !!x) : []) {
            const match = (await api.haEntities(eid).catch(() => [])).find((e) => e.entityId === eid);
            if (match) names.set(eid, match);
          }
          this.form = fromWatcher(found, names);
          this.runs = await api.watcherRuns(this.id).catch(() => []);
        }
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Konnte den Wächter nicht laden'), { tone: 'error' });
    }
    if (!this.id) this.templates = (await api.watcherTemplates().catch(() => [])).filter((x) => x.kind === 'watcher');
    this.loading = false;
    const wanted = !this.id && template ? this.templates.find((x) => x.id === template) : undefined;
    if (wanted) this.applyTemplate(wanted, hit);
  }

  // ---------- Vom Server nachladen (die Oberfläche ruft sie aus ihren Effekten auf) ----------

  /** Spalten und Kategorien des gewählten Boards */
  loadView(boardId: string): void {
    if (!boardId) return;
    const mine = ++this.viewSeq;
    api
      .board(boardId)
      .then((v) => {
        if (mine !== this.viewSeq) return;
        this.view = v;
        if (!v.columns.some((c) => c.id === this.form.columnId)) {
          this.form.columnId = (v.columns.find((c) => !c.isDone && !c.isPlanned) ?? v.columns[0])?.id ?? '';
        }
        this.form.categoryIds = this.form.categoryIds.filter((c) => v.categories.some((x) => x.id === c));
      })
      .catch(() => {
        if (mine === this.viewSeq) this.view = null;
      });
  }

  /** Verlauf der Entität mit der Regel des Formulars (Auslösepunkte); veraltete Antworten fallen weg */
  loadHistory(): void {
    const f = this.form;
    if (!f.entityId) {
      this.history = null;
      return;
    }
    const mine = ++this.historySeq;
    this.historyBusy = true;
    const rule = f.kind === 'state' ? { kind: 'state', to: f.to.trim() } : f.kind === 'above' || f.kind === 'below' ? { kind: f.kind, value: f.value.trim().replace(',', '.') } : {};
    api
      .entityHistory({ entityId: f.entityId, hours: 3, ...rule, ...(rule.kind ? { forMin: f.forMin.trim() === '' ? (f.kind === 'state' ? '0' : '3') : f.forMin.trim(), count: f.count.trim() || '1', cooldownMin: f.cooldownMin.trim() || '10' } : {}) })
      .then((h) => {
        if (mine === this.historySeq) this.history = h;
      })
      .catch(() => {
        if (mine === this.historySeq) this.history = null;
      })
      .finally(() => {
        if (mine === this.historySeq) this.historyBusy = false;
      });
  }

  /** Reihenfolge der Personen: für den gespeicherten Wächter dessen Stand (wer als Nächstes dran ist), mit dem Entwurf des Formulars */
  loadOrder(): void {
    const f = this.form;
    const mine = ++this.orderSeq;
    api
      .watcherOrder({ ...(this.id ? { watcherId: this.id } : {}), mode: f.assignMode, personIds: f.personIds, fallback: f.fallback, fallbackPersonId: f.fallbackPersonId })
      .then((o) => {
        if (mine === this.orderSeq) this.order = o;
      })
      .catch(() => {
        if (mine === this.orderSeq) this.order = null;
      });
  }

  // ---------- Entität suchen ----------

  startPicking(which: 'trigger' | 'done', q = '', domain = ''): void {
    this.picking = which;
    this.query = q;
    this.searchDomain = domain;
  }

  pick(e: HaEntity): void {
    if (this.picking === 'trigger') {
      this.form = applyEntity(this.form, e);
    } else {
      this.form.doneEntityId = e.entityId;
      this.form.doneEntityName = e.name;
    }
    this.picking = null;
  }

  applyTemplate(tpl: WatcherTemplate, found?: Hit): void {
    this.form = applyTemplate(this.form, tpl, found);
    // Ehrlich beim Selbst-Erledigen: ein Sensor, der das Erledigen nicht belegen kann, schaltet es aus und sagt warum
    this.selfNote = tpl.canSelfComplete ? '' : (tpl.whyNoSelfComplete ?? '');
    if (!found) this.startPicking('trigger', tpl.search, tpl.domain ?? '');
  }

  // ---------- Assistent ----------

  /** Ein Schritt weiter, wenn der aktuelle stimmt; sonst sagt eine Meldung, was fehlt */
  next(): boolean {
    const problem = stepProblem(this.form, this.step);
    if (problem) {
      toast(problem, { tone: 'error' });
      return false;
    }
    if (this.step < 4) {
      this.step = (this.step + 1) as 1 | 2 | 3 | 4;
      this.reached = Math.max(this.reached, this.step);
    }
    return true;
  }

  /**
   * „Zurück" im Assistenten (Kopfzeile, in jedem Schritt): zuerst eine offene Suche schließen, dann einen Schritt zurück (die Eingaben bleiben),
   * am ersten Schritt zur vorherigen Auswahl (siehe `leave`)
   */
  goBack(): void {
    const a = backAction(this.step, this.picking !== null);
    if (a.kind === 'closePicker') this.picking = null;
    else if (a.kind === 'step') this.step = a.step;
    else this.leave();
  }

  /** Den Assistenten am Anfang verlassen: aus „Gefunden" dorthin zurück, sonst wie Schließen */
  leave(): void {
    if (ui.sheet?.type === 'watcher' && ui.sheet.from === 'found') openSheet({ type: 'found' });
    else this.back();
  }

  /** Einen früheren Schritt oben antippen (nur bis zu dem, der schon erreicht ist) */
  goto(step: number): void {
    if (step >= 1 && step <= this.reached) this.step = step as 1 | 2 | 3 | 4;
  }

  // ---------- Speichern und Aktionen ----------

  async save(): Promise<void> {
    const problem = formProblem(this.form);
    if (problem) {
      toast(problem, { tone: 'error' });
      return;
    }
    this.busy = true;
    try {
      const saved = this.id ? await api.updateWatcher(this.id, toInput(this.form)) : await api.createWatcher(toInput(this.form));
      toast(t('Wächter gespeichert'));
      this.back();
      this.askAfterSave(saved);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Speichern fehlgeschlagen'), { tone: 'error' });
    }
    this.busy = false;
  }

  /** Gilt die Bedingung schon und löst der Wächter deshalb nicht von selbst aus, fragt die App, ob die Karte jetzt entstehen soll */
  private askAfterSave(saved: SavedWatcher): void {
    const met = metNowOf(saved);
    if (!met) return;
    ui.confirm = askCard(met, saved.card.title, async () => {
      try {
        await api.fireWatcherNow(saved.id);
        ui.watchers = await api.watchers().catch(() => ui.watchers);
        ui.rev += 1;
        toast(t('Karte angelegt'));
      } catch (e) {
        toast(e instanceof ApiError ? e.message : t('Karte konnte nicht angelegt werden'), { tone: 'error' });
      }
    });
  }

  async test(): Promise<void> {
    if (!this.id) return;
    this.busy = true;
    try {
      await api.testWatcher(this.id);
      toast(t('Testkarte angelegt'));
      this.runs = await api.watcherRuns(this.id).catch(() => this.runs);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Test fehlgeschlagen'), { tone: 'error' });
    }
    this.busy = false;
  }

  async resetCounter(): Promise<void> {
    if (!this.id) return;
    try {
      this.item = await api.resetWatcherCounter(this.id);
      toast(t('Zähler zurückgesetzt'));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Zurücksetzen fehlgeschlagen'), { tone: 'error' });
    }
  }

  async togglePause(): Promise<void> {
    if (!this.id) return;
    try {
      this.item = await api.updateWatcher(this.id, { active: !this.form.active });
      this.form.active = this.item.active;
      toast(this.item.active ? t('Wächter ist wieder aktiv') : t('Wächter pausiert'));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Änderung fehlgeschlagen'), { tone: 'error' });
    }
  }

  askRemove(): void {
    const id = this.id;
    if (!id) return;
    ui.confirm = {
      title: t('Wächter löschen?'),
      text: t('„{name}“ legt danach keine Karten mehr an. Bereits angelegte Karten bleiben.', { name: this.form.name }),
      label: t('Löschen'),
      run: async () => {
        try {
          await api.deleteWatcher(id);
          toast(t('Wächter gelöscht'));
          this.back();
        } catch (e) {
          toast(e instanceof ApiError ? e.message : t('Löschen fehlgeschlagen'), { tone: 'error' });
        }
      },
    };
  }
}
