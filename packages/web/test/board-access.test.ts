import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import BoardAccessDialog from '../src/components/BoardAccessDialog.svelte';
import BoardVisibilityPicker from '../src/components/BoardVisibilityPicker.svelte';
import ListRow from '../src/components/ui/ListRow.svelte';
import WatcherFairnessRow from '../src/components/WatcherFairnessRow.svelte';
import WatcherRow from '../src/components/WatcherRow.svelte';
import WatcherTableRow from '../src/components/WatcherTableRow.svelte';
import type { Board, BoardAccessPreview, HomeItem, User } from '../src/lib/api';
import { afterText, boardCounts, boardPeople, boardWho, watcherBoardOption } from '../src/lib/boardAccess';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { arrowOnly, probeRight } from '../src/lib/rowTap';
import { ui } from '../src/lib/store.svelte';
import { WatcherEditor } from '../src/lib/watcher-editor.svelte';
import { isProblem, problemText, watcherLayout } from '../src/lib/watcherList';

const person = (id: string, name: string, over: Partial<User> = {}): User => ({ id, displayName: name, name, isPerson: true, color: null, isChild: false, ...over }) as User;
const rene = person('rene', 'Rene');
const anna = person('anna', 'Anna');
const tom = person('tom', 'Tom');
const people = [rene, anna, tom];
const board = (over: Partial<Board> = {}): Board => ({ id: 'b1', name: 'Haushalt', icon: null, color: null, position: 'a0', archiveAfterDays: 7, visibility: 'all', ownerId: null, countsForFairness: true, memberIds: [], ...over });

beforeEach(() => {
  setLanguage('de');
  ui.people = people;
  ui.me = rene;
  ui.isChild = false;
  ui.desktop = false;
});

describe('Wer ein Board sieht (Anzeige)', () => {
  it('alle, nur der Besitzer, Besitzer und Mitglieder', () => {
    expect(boardPeople(board(), people).map((p) => p.id)).toEqual(['rene', 'anna', 'tom']);
    expect(boardPeople(board({ visibility: 'private', ownerId: 'anna' }), people).map((p) => p.id)).toEqual(['anna']);
    expect(boardPeople(board({ visibility: 'selected', ownerId: 'rene', memberIds: ['anna'] }), people).map((p) => p.id)).toEqual(['rene', 'anna']);
    expect(boardPeople(undefined, people)).toHaveLength(3);
  });

  it('die Zeile der Board-Auswahl: „Name · Alle", „Name · Rene, Anna", privat nicht wählbar', () => {
    expect(watcherBoardOption(board(), people)).toEqual({ id: 'b1', label: 'Haushalt · Alle', short: 'Haushalt', disabled: false });
    expect(watcherBoardOption(board({ name: 'Bad-Umbau', visibility: 'selected', ownerId: 'rene', memberIds: ['anna'] }), people).label).toBe('Bad-Umbau · Rene, Anna');
    expect(watcherBoardOption(board({ name: 'Meine Ideen', visibility: 'private', ownerId: 'rene' }), people)).toMatchObject({ label: '🔒 Meine Ideen · privat', disabled: true });
  });

  it('Fairness: ein privates Board zählt nie, auch wenn der Wert true ist', () => {
    expect(boardCounts(board())).toBe(true);
    expect(boardCounts(board({ countsForFairness: false }))).toBe(false);
    expect(boardCounts(board({ visibility: 'private', countsForFairness: true }))).toBe(false);
    expect(boardWho(board({ visibility: 'private' }), people)).toBe('privat');
  });

  it('„Danach": „Rene (reihum)", sonst leer', () => {
    expect(afterText(['Rene'], 'rotation')).toBe('Rene (reihum)');
    expect(afterText(['Rene', 'Tom'], 'fixed')).toBe('Rene, Tom (fest)');
    expect(afterText([], 'rotation')).toBe('');
  });
});

describe('Auswahl beim Anlegen und Ändern (Karten, Schalter)', () => {
  const picker = (over: Record<string, unknown> = {}) =>
    render(BoardVisibilityPicker, { props: { visibility: 'all', memberIds: [], counts: true, ownerId: 'rene', onvisibility: () => undefined, onmembers: () => undefined, oncounts: () => undefined, ...over } }).body;

  it('drei Karten, bei „Alle" ist der Schalter an und bedienbar', () => {
    const out = picker();
    for (const x of ['🔒 Nur ich', '🏠 Alle in Stups', '👥 Ausgewählte Personen', 'Zählt zur Fairness der Woche']) expect(out).toContain(x);
    expect(out).toMatch(/data-testid="visibility-all"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-testid="visibility-all"/);
    expect(out).toMatch(/role="switch"[^>]*aria-checked="true"/);
    expect(out).not.toMatch(/role="switch"[^>]*\bdisabled=""/);
  });

  it('„Nur ich": Schalter ausgegraut, aus, nicht bedienbar, Text „Private Boards zählen nie mit.", keine zusätzliche Zeile „nie"', () => {
    const out = picker({ visibility: 'private', counts: true });
    expect(out).toMatch(/role="switch"[^>]*aria-checked="false"[^>]*\bdisabled=""|\bdisabled=""[^>]*role="switch"[^>]*aria-checked="false"/);
    expect(out).toContain('Private Boards zählen nie mit.');
    expect(out).toMatch(/data-variant="setting"[^>]*>/);
    expect(out.match(/Private Boards zählen nie mit\./g)).toHaveLength(1);
    expect(out).not.toMatch(/>nie</);
  });

  it('„Ausgewählte Personen" zeigt Chips ohne den Besitzer; die anderen Wahlen nicht', () => {
    const out = picker({ visibility: 'selected', memberIds: ['anna'] });
    expect(out).toContain('data-testid="visibility-members"');
    expect(out).toContain('Anna');
    expect(out).toContain('Tom');
    expect(out).not.toMatch(/visibility-members[\s\S]*Rene/);
    expect(picker()).not.toContain('visibility-members');
  });

  it('ein Kind sieht nur „Nur ich"', () => {
    ui.isChild = true;
    const out = picker({ visibility: 'private' });
    expect(out).toContain('🔒 Nur ich');
    expect(out).not.toContain('Alle in Stups');
    expect(out).not.toContain('Ausgewählte Personen');
  });
});

describe('Dialog „Person entfernen" und „Board kann nicht privat werden"', () => {
  const preview: BoardAccessPreview = {
    removedIds: ['anna'],
    watchers: [
      { watcherId: 'w1', name: 'Waschmaschine fertig', mode: 'rotation', before: ['rene', 'anna'], after: ['rene'], missing: false, circleEmpty: false, fallbackCleared: false },
      { watcherId: 'w2', name: 'Heizung prüfen', mode: 'fixed', before: ['anna'], after: [], missing: true, circleEmpty: false, fallbackCleared: false },
    ],
    blocking: [{ id: 'w3', name: 'Müll rausbringen' }],
    assigneeCards: 2,
  };
  const dialog = (over: Record<string, unknown> = {}) =>
    render(BoardAccessDialog, { props: { kind: 'remove', boardName: 'Bad-Umbau', title: 'Anna aus „Bad-Umbau“ entfernen?', preview, onclose: () => undefined, ...over } }).body;

  it('zeigt ALLE betroffenen Wächter mit „jetzt → danach", bei Rest „Rene (reihum)", bei niemand die orange Zeile', () => {
    const out = dialog();
    expect(out).toContain('Das ändert 2 Wächter. Es gehen keine Karten verloren.');
    expect(out).toContain('Waschmaschine fertig');
    expect(out).toContain('Rene, Anna');
    expect(out).toContain('Rene (reihum)');
    expect(out).toContain('Heizung prüfen');
    expect(out).toContain('niemand');
    expect(out).toContain('Wächter legt keine Karten an, bis neue Zuständige gewählt sind');
    expect(out.match(/data-missing/g)).toHaveLength(1);
  });

  it('Handy: Liste untereinander; Desktop: breit (860 px), Tabelle mit festen Breiten, Wächter und „jetzt" in einer Zeile', () => {
    expect(dialog()).toContain('data-testid="access-list"');
    expect(dialog()).not.toContain('<table');
    ui.desktop = true;
    const out = dialog();
    expect(out).toContain('max-w-[860px]');
    expect(out).toContain('<table');
    expect(out).toContain('table-fixed');
    expect(out).toMatch(/<th[^>]*whitespace-nowrap[^>]*>Wächter</);
    expect(out).toMatch(/<th[^>]*whitespace-nowrap[^>]*>Zuständige jetzt</);
    // „Danach" darf umbrechen: keine nowrap-Klasse in der letzten Spalte
    expect(out).toMatch(/<th class="py-2 font-bold">Danach</);
    // feste Breiten
    expect(out).toContain('width: 220px');
    expect(out).toContain('width: 200px');
    // die Zellen der ersten beiden Spalten brechen nicht um
    expect(out.match(/whitespace-nowrap/g)!.length).toBeGreaterThanOrEqual(6);
  });

  it('„Board kann nicht privat werden": Liste der Wächter mit „Wächter öffnen"', () => {
    const out = dialog({ kind: 'blocked', title: 'Board kann nicht privat werden' });
    expect(out).toContain('Board kann nicht privat werden');
    expect(out).toContain('Müll rausbringen');
    expect(out).toContain('Wächter öffnen');
    expect(out).not.toContain('data-testid="access-confirm"');
  });
});

describe('Zählt zur Fairness (Wächter): gesperrt, wenn das Board nicht zählt', () => {
  const row = (b: Board) => {
    ui.boards = [{ ...b, openCards: 0 }];
    const ed = new WatcherEditor(null);
    ed.form.boardId = b.id;
    return render(WatcherFairnessRow, { props: { ed } }).body;
  };

  it('zählt das Board: Schalter an und bedienbar, „Board Haushalt zählt mit"', () => {
    const out = row(board());
    expect(out).toContain('Board Haushalt zählt mit');
    expect(out).toMatch(/role="switch"[^>]*aria-checked="true"/);
    expect(out).not.toContain('data-locked');
  });

  it('zählt das Board nicht: grau, aus, gesperrt, „Board zählt nicht mit: nicht möglich"', () => {
    const out = row(board({ countsForFairness: false }));
    expect(out).toContain('Board zählt nicht mit: nicht möglich');
    expect(out).toContain('data-locked');
    expect(out).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(out).toMatch(/role="switch"[^>]*\bdisabled=""|\bdisabled=""[^>]*role="switch"/);
  });

  it('ein privates Board sperrt ihn ebenso', () => {
    expect(row(board({ visibility: 'private', ownerId: 'rene' }))).toContain('data-locked');
  });
});

describe('Wächter mit Problem: ganz oben, roter Rand, Status als Text', () => {
  const item = (over: Partial<HomeItem> = {}): HomeItem =>
    ({
      watcherId: 'w',
      name: 'W',
      subject: '',
      status: 'ok',
      entity: 'E',
      value: null,
      phase: 'quiet',
      since: null,
      progress: null,
      nextCard: 'K',
      entityMissing: false,
      openCard: null,
      nextEvent: null,
      active: true,
      category: null,
      trigger: { entityId: 'sensor.x', kind: 'below', to: null, value: 1, forMin: 0, count: 1 },
      entityUnit: null,
      lastFiredAt: null,
      lastAssigneeIds: [],
      assign: { mode: 'rotation', personIds: [] },
      ...over,
    }) as HomeItem;

  it('Probleme stehen vor „Wartet" und „Läuft gerade", in keiner anderen Gruppe', () => {
    const l = watcherLayout([
      item({ watcherId: 'ruhig', name: 'Ruhig' }),
      item({ watcherId: 'wartet', name: 'Wartet', phase: 'waiting', openCard: { id: 'k', title: 'K', boardId: 'b', assigneeIds: [], createdAt: '2026-11-06T10:00:00Z' } }),
      item({ watcherId: 'laeuft', name: 'Läuft', phase: 'running' }),
      item({ watcherId: 'a', name: 'Heizung prüfen', status: 'assignees_missing' }),
      item({ watcherId: 'b', name: 'Fenster', status: 'entity_missing', entityMissing: true }),
      item({ watcherId: 'c', name: 'Garten', status: 'target_missing', active: false }),
    ]);
    expect(l.problems.map((i) => i.watcherId)).toEqual(['b', 'c', 'a']); // nach Namen: Fenster, Garten, Heizung prüfen
    expect(l.waiting.map((i) => i.watcherId)).toEqual(['wartet']);
    expect(l.running.map((i) => i.watcherId)).toEqual(['laeuft']);
    expect(l.groups.flatMap((g) => g.items.map((i) => i.watcherId))).toEqual(['ruhig']);
  });

  it('der Grund als Text, Probleme erkannt', () => {
    expect(problemText(item({ status: 'assignees_missing' }))).toBe('Keine Karten: braucht neue Zuständige');
    expect(problemText(item({ status: 'target_missing' }))).toMatch(/Pausiert/);
    expect(problemText(item({ entityMissing: true }))).toBe('Entität fehlt');
    expect(problemText(item())).toBeNull();
    expect(isProblem(item({ status: 'ok' }))).toBe(false);
  });

  const props = (it: HomeItem) => ({ item: it, nowMs: Date.parse('2026-11-06T12:00:00Z'), canToggle: true, onopen: () => undefined, ontoggle: () => undefined });

  it('Handy: roter Rand (Danger-Token), nicht orange, mit dem Status als Text; die Liste selbst bleibt wie sie ist', () => {
    const out = render(WatcherRow, { props: props(item({ status: 'assignees_missing' })) }).body;
    expect(out).toContain('row-problem');
    expect(out).not.toContain('row-new');
    expect(out).toMatch(/text-danger[^>]*data-testid="watcher-status">Keine Karten: braucht neue Zuständige</);
    const ok = render(WatcherRow, { props: props(item()) }).body;
    expect(ok).not.toContain('row-problem');
    expect(ok).toContain('border-line');
  });

  it('Desktop: dieselbe Tabellenzeile, Status „Keine Karten"', () => {
    const out = render(WatcherTableRow, { props: props(item({ status: 'assignees_missing' })) }).body;
    expect(out).toContain('data-status="noassign"');
    expect(out).toContain('Keine Karten');
  });

  it('der rote Rand steht in app.css mit dem Danger-Token', async () => {
    const css = (await import('node:fs')).readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.row-problem \{ border-color: var\(--danger\); \}/);
  });
});

describe('Der Pfeil rechts gehört zum Antippbereich (ListRow)', () => {
  const probe = (html: { icons: number; arrows: number; interactive: boolean; text: string }) => arrowOnly(html);
  it('nur ein Pfeil ohne Bedienelement und Text zählt', () => {
    expect(probe({ icons: 1, arrows: 1, interactive: false, text: '  ' })).toBe(true);
  });
  it('Schalter, Zahlenfeld, Wert oder anderes Symbol rechts: nicht', () => {
    expect(probe({ icons: 0, arrows: 0, interactive: true, text: '' })).toBe(false); // Schalter, Eingabe, Knopf
    expect(probe({ icons: 1, arrows: 1, interactive: true, text: '' })).toBe(false);
    expect(probe({ icons: 1, arrows: 1, interactive: false, text: '12 Min.' })).toBe(false);
    expect(probe({ icons: 1, arrows: 0, interactive: false, text: '' })).toBe(false); // Haken, Zahnrad …
    expect(probe({ icons: 2, arrows: 1, interactive: false, text: '' })).toBe(false);
  });
  it('probeRight liest die Angaben aus dem DOM', () => {
    const el = { querySelectorAll: (q: string) => (q === 'svg' ? [1] : q.includes('chevron-right') ? [1] : []), querySelector: () => null, textContent: ' ' };
    expect(arrowOnly(probeRight(el as never))).toBe(true);
    const withButton = { ...el, querySelector: () => ({}) };
    expect(arrowOnly(probeRight(withButton as never))).toBe(false);
  });
  it('die Zeile trägt Zeiger und Klick am rechten Bereich nur mit onclick; der Icon-Baustein nennt seinen Namen', () => {
    const out = render(ListRow, { props: { title: 'Termin', onclick: () => undefined, right: (() => '') as never } }).body;
    expect(out).toContain('data-row-open');
  });
});
