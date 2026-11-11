<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte';
  import { formatBytes, uploadProblem } from '../../lib/image';
  import { hostOf, withScheme } from '../../lib/newCard';
  import { toast } from '../../lib/store.svelte';
  import Icon from '../Icon.svelte';

  /**
   * „Mehr" beim Anlegen: Checkliste, Links und Anhänge. Die Listen gehören der Karte (der Aufrufer legt sie nach dem Anlegen an);
   * `flush()` übernimmt, was getippt, aber noch nicht bestätigt ist.
   */
  let {
    items = $bindable(),
    urls = $bindable(),
    files = $bindable(),
  }: { items: string[]; urls: string[]; files: File[] } = $props();

  let newItem = $state('');
  let newLink = $state('');
  let fileInput: HTMLInputElement | undefined = $state();
  // „Mehr": Checkliste und Foto/Link klappen auf; was schon eingetragen ist, bleibt sichtbar
  let showItems = $state(false);
  let showAttach = $state(false);

  function addItem(e: Event) {
    e.preventDefault();
    const text = newItem.trim();
    if (!text) return;
    items.push(text);
    newItem = '';
  }

  function addLink(e: Event) {
    e.preventDefault();
    const u = newLink.trim();
    if (!u) return;
    urls.push(withScheme(u));
    newLink = '';
  }

  function onFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    for (const f of input.files ?? []) {
      const problem = uploadProblem(f);
      if (problem) toast(`${f.name}: ${problem}`, { tone: 'error' });
      else files.push(f);
    }
    input.value = '';
  }

  /** Das gerade getippte, aber noch nicht bestätigte Eintrag/Link nicht verlieren */
  export function flush(): void {
    if (newItem.trim()) addItem(new Event('submit'));
    if (newLink.trim()) addLink(new Event('submit'));
  }
</script>

<div class="grid grid-cols-2 gap-2">
  <button
    type="button"
    class="more-btn"
    aria-expanded={showItems || items.length > 0}
    onclick={() => (showItems = !showItems)}
  ><span class="text-accent-text"><Icon name="task-check" size={22} stroke={1.8} /></span>{t('Checkliste')}{items.length ? ` · ${items.length}` : ''}</button>
  <button
    type="button"
    class="more-btn"
    aria-expanded={showAttach || urls.length > 0 || files.length > 0}
    onclick={() => (showAttach = !showAttach)}
  ><span class="text-accent-text"><Icon name="paperclip" size={22} stroke={1.8} /></span>{t('Foto / Link')}{urls.length + files.length ? ` · ${urls.length + files.length}` : ''}</button>
</div>

{#if showItems || items.length > 0}
  <div class="flex flex-col rounded-row border border-line bg-surface" role="group" aria-label={t('Checkliste')}>
    {#each items as item, i (i)}
      <div class="flex min-h-[46px] items-center gap-3 px-4">
        <Icon name="check" size={16} />
        <span class="min-w-0 flex-1 py-2">{item}</span>
        <button type="button" class="flex h-10 w-10 items-center justify-center text-fg2" aria-label={t('Eintrag entfernen')} onclick={() => items.splice(i, 1)}>
          <Icon name="x" size={16} />
        </button>
      </div>
    {/each}
    <div class="flex min-h-[46px] items-center gap-3 px-4">
      <Icon name="plus" size={18} />
      <input
        bind:value={newItem}
        placeholder={t('Eintrag hinzufügen')}
        enterkeyhint="done"
        class="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-dim"
        aria-label={t('Neuer Eintrag')}
        onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(e))}
      />
      <button type="button" class="bg-accent-grad min-h-9 shrink-0 rounded-xl px-3.5 text-[15px] font-bold {newItem.trim() ? '' : 'hidden'}" onclick={addItem}>{t('Hinzufügen')}</button>
    </div>
  </div>
{/if}

{#if showAttach || urls.length > 0 || files.length > 0}
  <div class="flex flex-col rounded-row border border-line bg-surface" role="group" aria-label={t('Foto / Link')}>
    {#each urls as url, i (i)}
      <div class="flex min-h-12 items-center gap-3 px-4">
        <Icon name="link" size={16} />
        <span class="min-w-0 flex-1 truncate py-2">{hostOf(url)}</span>
        <button type="button" class="flex h-10 w-10 items-center justify-center text-fg2" aria-label={t('Link entfernen')} onclick={() => urls.splice(i, 1)}>
          <Icon name="x" size={16} />
        </button>
      </div>
    {/each}
    <div class="flex min-h-[46px] items-center gap-3 px-4">
      <Icon name="link" size={18} />
      <input
        bind:value={newLink}
        type="url"
        placeholder={t('Website oder Maps-Link einfügen')}
        enterkeyhint="done"
        class="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-dim"
        aria-label={t('Neuer Link')}
        onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink(e))}
      />
      <button type="button" class="bg-accent-grad min-h-9 shrink-0 rounded-xl px-3.5 text-[15px] font-bold {newLink.trim() ? '' : 'hidden'}" onclick={addLink}>{t('Hinzufügen')}</button>
    </div>
    {#each files as f, i (i)}
      <div class="flex min-h-12 items-center gap-3 border-t border-line px-4">
        <Icon name="paperclip" size={16} />
        <span class="min-w-0 flex-1 truncate py-2">{f.name}</span>
        <span class="shrink-0 text-[13px] text-fg2">{formatBytes(f.size)}</span>
        <button type="button" class="flex h-10 w-10 items-center justify-center text-fg2" aria-label={t('Anhang entfernen')} onclick={() => files.splice(i, 1)}>
          <Icon name="x" size={16} />
        </button>
      </div>
    {/each}
    <div class="border-t border-line px-4 py-1.5">
      <input bind:this={fileInput} type="file" accept="image/*,application/pdf" multiple class="hidden" onchange={onFiles} />
      <button type="button" class="flex min-h-11 w-full items-center gap-3 text-left text-[17px] text-accent-text" onclick={() => fileInput?.click()}>
        <Icon name="camera" size={18} />{t('Foto oder PDF hinzufügen')}
      </button>
    </div>
  </div>
{/if}
