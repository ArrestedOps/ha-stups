import { render } from 'svelte/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfirmDialog from '../src/components/ConfirmDialog.svelte';
import { api } from '../src/lib/api';
import { setLanguage } from '../src/lib/i18n/index.svelte';
import { closeSheet, ui } from '../src/lib/store.svelte';
import { WatcherEditor } from '../src/lib/watcher-editor.svelte';
import { askCard, metNowOf } from '../src/lib/watcher-ask';
import { emptyForm } from '../src/lib/watchers';
import type { WatcherItem } from '../src/lib/watcher-types';

const met = { entityName: 'Tür Waschküche', stateText: 'aus', reason: 'already_met' as const };

beforeEach(() => {
  setLanguage('de');
  closeSheet();
  ui.confirm = null;
});
afterEach(() => vi.restoreAllMocks());

describe('metNowOf: was der Server nach dem Speichern meldet', () => {
  it('gibt eine vollständige Meldung zurück, alles andere ist keine Frage', () => {
    expect(metNowOf({ metNow: met })).toEqual(met);
    expect(metNowOf({ metNow: null })).toBeNull();
    expect(metNowOf({})).toBeNull();
    expect(metNowOf({ metNow: { entityName: 'x', stateText: '', reason: 'already_met' } })).toBeNull();
    expect(metNowOf({ metNow: { entityName: '', stateText: 'aus', reason: 'already_met' } })).toBeNull();
    expect(metNowOf({ metNow: { entityName: 'x', stateText: 'aus', reason: 'anderes' } as never })).toBeNull();
  });
});

describe('askCard: der Wortlaut der Rückfrage', () => {
  it('deutsch', () => {
    const c = askCard(met, 'Tür schließen', () => undefined);
    expect(c.title).toBe('Karte jetzt erstellen?');
    expect(c.text).toBe('Tür Waschküche ist gerade aus – die Bedingung ist also schon erfüllt. Soll jetzt eine Karte „Tür schließen“ erstellt werden?');
    expect(c.label).toBe('Ja, Karte erstellen');
    expect(c.cancelLabel).toBe('Nein, erst beim nächsten Mal');
    expect(c.tone).toBe('primary');
  });

  it('englisch', () => {
    setLanguage('en');
    const c = askCard({ ...met, entityName: 'Laundry door', stateText: 'off' }, 'Close the door', () => undefined);
    expect(c.title).toBe('Create a card now?');
    expect(c.text).toBe('Laundry door is currently off – so the condition is already met. Create a card “Close the door” now?');
    expect(c.label).toBe('Yes, create card');
    expect(c.cancelLabel).toBe('No, wait for the next time');
  });
});

describe('Rückfrage als Dialog', () => {
  const html = () => render(ConfirmDialog, { props: {} }).body;

  it('de: Dialog mit Text und den zwei Knöpfen, ohne Papierkorb-Symbol', () => {
    ui.confirm = askCard(met, 'Tür schließen', () => undefined);
    const out = html();
    expect(out).toContain('role="alertdialog"');
    expect(out).toContain('aria-modal="true"');
    expect(out).toContain('aria-describedby="confirm-text"');
    expect(out).toContain('Tür Waschküche ist gerade aus');
    expect(out).toContain('Ja, Karte erstellen');
    expect(out).toContain('Nein, erst beim nächsten Mal');
    expect(out).not.toContain('Abbrechen">'); // der Knopf trägt die gewählte Beschriftung
    expect(out).not.toContain('bg-danger-grad');
    expect(out).toContain('bg-accent-grad');
  });

  it('en: derselbe Dialog auf Englisch', () => {
    setLanguage('en');
    ui.confirm = askCard({ ...met, stateText: 'off' }, 'Close the door', () => undefined);
    const out = html();
    expect(out).toContain('Yes, create card');
    expect(out).toContain('No, wait for the next time');
    expect(out).toContain('is currently off');
  });

  it('ein Löschen-Dialog bleibt rot mit „Abbrechen“', () => {
    ui.confirm = { title: 'Karte löschen?', text: 'Weg.', label: 'Löschen', run: () => undefined };
    const out = html();
    expect(out).toContain('bg-danger-grad');
    expect(out).toContain('>Abbrechen<');
  });
});

describe('Nach dem Speichern im Editor', () => {
  const created = (metNow: unknown, id = 'w1'): WatcherItem => ({ id, card: { title: 'Tür schließen' }, metNow }) as unknown as WatcherItem;
  const editor = (id: string | null = null) => {
    const ed = new WatcherEditor(id);
    ed.form = { ...emptyForm('b', 'c'), name: 'Tür offen', entityId: 'binary_sensor.tuer', entityName: 'Tür', kind: 'state', to: 'off', title: 'Tür schließen', assignMode: 'none' as const };
    return ed;
  };

  it('Anlegen mit metNow: die Frage erscheint, „Ja“ legt die Karte über fire-now an', async () => {
    vi.spyOn(api, 'createWatcher').mockResolvedValue(created(met));
    const fire = vi.spyOn(api, 'fireWatcherNow').mockResolvedValue(created(null));
    await editor().save();
    expect(ui.confirm?.label).toBe('Ja, Karte erstellen');
    expect(ui.confirm?.text).toContain('„Tür schließen“');
    expect(fire).not.toHaveBeenCalled();
    await ui.confirm!.run();
    expect(fire).toHaveBeenCalledWith('w1');
  });

  it('Ändern mit metNow ebenso (Id des geänderten Wächters)', async () => {
    vi.spyOn(api, 'updateWatcher').mockResolvedValue(created(met, 'w7'));
    const fire = vi.spyOn(api, 'fireWatcherNow').mockResolvedValue(created(null, 'w7'));
    await editor('w7').save();
    await ui.confirm!.run();
    expect(fire).toHaveBeenCalledWith('w7');
  });

  it('ohne metNow keine Frage', async () => {
    vi.spyOn(api, 'createWatcher').mockResolvedValue(created(null));
    await editor().save();
    expect(ui.confirm).toBeNull();
  });

  it('„Nein“ (Dialog schließen) ruft nichts auf', async () => {
    vi.spyOn(api, 'createWatcher').mockResolvedValue(created(met));
    const fire = vi.spyOn(api, 'fireWatcherNow');
    await editor().save();
    ui.confirm = null;
    expect(fire).not.toHaveBeenCalled();
  });
});
