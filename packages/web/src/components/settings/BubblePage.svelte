<script lang="ts">
  import { onMount } from 'svelte';
  import { loadAgenda, agenda } from '../../lib/agenda.svelte';
  import { bubbleCounts, bubbleYaml } from '../../lib/bubble';
  import { t } from '../../lib/i18n/index.svelte';
  import { toast, ui } from '../../lib/store.svelte';
  import Icon from '../Icon.svelte';
  import CtaButton from '../ui/CtaButton.svelte';
  import ListRow from '../ui/ListRow.svelte';
  import SectionHeader from '../ui/SectionHeader.svelte';
  import Tile from '../ui/Tile.svelte';
  import Page from './Page.svelte';

  /** Dashboard-Button: Vorschau des Knopfs und die YAML-Konfiguration für die Bubble Card (Sensorname der normalen App oder der Beta) */
  onMount(() => {
    if (!agenda.loaded) void loadAgenda();
  });
  const counts = $derived(bubbleCounts(agenda.open, Date.now()));
  const yaml = $derived(bubbleYaml({ panelPath: ui.settings?.panelPath, channel: ui.caps?.channel }));
  const lines = $derived(
    yaml.split('\n').map((line) => {
      const m = /^(\s*(?:- )?)([a-z_]+):(\s*)(.*)$/.exec(line);
      return m ? { pre: m[1]!, key: m[2]!, gap: m[3]!, value: m[4]!, plain: false } : { pre: '', key: '', gap: '', value: line, plain: true };
    }),
  );
  /** Werte, die auf eine Entität oder einen Pfad zeigen, in Grün */
  const isRef = (v: string) => /^(sensor\.|\/|mdi:)/.test(v);

  async function copyYaml() {
    try {
      await navigator.clipboard.writeText(yaml);
      toast(t('YAML kopiert'));
    } catch {
      toast(t('Kopieren nicht möglich, bitte den Text markieren'), { tone: 'error' });
    }
  }
</script>

<Page title={t('Dashboard-Button')}>
  {#snippet footer()}
    <CtaButton onclick={copyYaml}><Icon name="copy" size={22} stroke={1.8} />{t('YAML kopieren')}</CtaButton>
  {/snippet}
  <div class="flex flex-col gap-3.5 pt-1">
    <p class="px-1 text-[14px] leading-[1.45] text-hint">{t('Mit diesem Knopf öffnest du Stups direkt aus deinem Dashboard. Er zeigt auch, wie viel heute ansteht.')}</p>
    <div>
      <SectionHeader title={t('Vorschau')} />
      <div class="border-line-chip mt-2 flex h-16 items-center gap-3 rounded-full border bg-surface2 px-2.5" role="img" aria-label={t('Vorschau des Bubble-Card-Knopfs')} data-testid="bubble-preview">
        <span class="bg-accent-grad glow-pill flex h-11 w-11 shrink-0 items-center justify-center rounded-full"><Icon name="kanban" size={22} stroke={1.8} /></span>
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="truncate text-[15px] font-bold tracking-tight">Stups</span>
          <span class="truncate text-[13px] text-fg2">{t('{today} heute fällig', { today: counts.today })} • {t('{overdue} überfällig', { overdue: counts.overdue })}</span>
        </span>
        <span class="flex text-text-soft2"><Icon name="chevron-right" size={18} stroke={2} /></span>
      </div>
    </div>
    <div>
      <SectionHeader title={t('YAML für die Bubble Card')} />
      <pre class="mt-2 overflow-x-auto rounded-[14px] border border-line bg-surface-inset px-3.5 py-3 font-mono text-[12px] leading-[1.55] text-text-soft" data-testid="bubble-yaml">{#each lines as l, i (i)}<span class="block whitespace-pre">{#if l.plain}{l.value}{:else}{l.pre}<span class="text-step-done">{l.key}</span>:{l.gap}<span class={isRef(l.value) ? 'text-ok' : ''}>{l.value}</span>{/if}</span>{/each}</pre>
    </div>
    <ListRow title={t('So geht\'s')}>
      {#snippet tile()}<Tile color="gray"><Icon name="info" size={22} stroke={1.8} /></Tile>{/snippet}
      {#snippet meta()}{t('Dashboard bearbeiten › Karte › Manuell')}{/snippet}
    </ListRow>
  </div>
</Page>
