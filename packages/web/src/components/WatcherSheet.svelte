<script lang="ts">
  import { onMount } from 'svelte';
  import { WatcherEditor } from '../lib/watcher-editor.svelte';
  import type { SavedWatcher } from '../lib/watcher-types';
  import type { HitInit } from '../lib/store.svelte';
  import WatcherFlow from './WatcherFlow.svelte';
  import WatcherWizard from './WatcherWizard.svelte';

  /**
   * Der Wächter-Editor. Ein vorhandener Wächter (`id`) öffnet als Ablauf (WaechterC), ein neuer als Assistent in vier Schritten (WaechterB bis B4).
   * `template`: Kennung einer Vorlage, die gleich angewendet wird; `hit`: der Treffer aus „Gefunden“ (Entität schon gewählt).
   * `personIds`, `onsaved`, `onback`: nur die Einrichtung beim ersten Start (Personen vorgewählt, was nach dem Speichern und beim Schließen geschieht).
   * Hier laufen die Abfragen, die sich nach dem Formular richten (Board, Verlauf der Entität, Reihenfolge); die Bilder stehen in den Kindern.
   */
  let {
    id,
    template = undefined,
    hit = undefined,
    hits = undefined,
    personIds = undefined,
    category = undefined,
    onsaved = undefined,
    onback = undefined,
    inline = false,
  }: {
    id: string | null;
    template?: string;
    hit?: HitInit;
    /** mehrere Treffer derselben Art: gemeinsam einrichten */
    hits?: HitInit[];
    personIds?: string[];
    category?: string;
    onsaved?: (saved: SavedWatcher) => void;
    onback?: () => void;
    /** Desktop: der Ablauf steht aufgeklappt unter der Zeile in der Liste statt in einem Fenster */
    inline?: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally
  const ed = new WatcherEditor(id, { onsaved, onback });
  onMount(() => void ed.load(template, hit, personIds, category, hits));

  // Spalten und Kategorien des gewählten Boards
  $effect(() => {
    const boardId = ed.form.boardId;
    if (!ed.loading) ed.loadView(boardId);
  });

  // Verlauf der Entität: im Ablauf immer, im Assistenten in Schritt 1; mit der Regel des Formulars (Auslösepunkte), kurz verzögert beim Tippen
  $effect(() => {
    const f = ed.form;
    void [f.entityId, f.kind, f.to, f.value, f.forMin, f.count, f.cooldownMin];
    if (ed.loading || !f.entityId || (!ed.id && ed.step !== 1)) return;
    const timer = setTimeout(() => ed.loadHistory(), 350);
    return () => clearTimeout(timer);
  });

  // Reihenfolge der Personen: im Ablauf immer, im Assistenten in Schritt 3
  $effect(() => {
    const f = ed.form;
    void [f.assignMode, f.personIds.join(','), f.fallback, f.fallbackPersonId];
    if (ed.loading || (!ed.id && ed.step !== 3)) return;
    const timer = setTimeout(() => ed.loadOrder(), 250);
    return () => clearTimeout(timer);
  });
</script>

{#if ed.id}<WatcherFlow {ed} {inline} />{:else}<WatcherWizard {ed} />{/if}
