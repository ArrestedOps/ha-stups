<script lang="ts">
  import { onMount } from 'svelte';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { deviceName } from '../lib/pushStand';
  import { loadPeople, next, ob, savePeople, toggleChild, togglePerson } from '../lib/onboarding.svelte';
  import { ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import OnboardingCompanion from './OnboardingCompanion.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';
  import Chip from './ui/Chip.svelte';
  import CtaButton from './ui/CtaButton.svelte';

  /**
   * Schritt „Wer wohnt hier?": alle erkannten Personen sind vorgewählt, Du steht oben und bleibt gewählt. Handys erkennt Stups selbst.
   * Gespeichert wird erst beim Weiter. Stehen die Personen in der Add-on-Konfiguration, ist der Schritt nur eine Anzeige.
   */
  onMount(() => void loadPeople());

  const managed = $derived(ob.info?.managed === true);
  const count = $derived(ob.selected.length);
  const colorOf = (id: string | null) => ui.people.find((p) => p.id === id)?.color ?? null;

  async function proceed() {
    if (managed || (await savePeople())) next();
  }

  const status = (c: (typeof ob.candidates)[number]): string => {
    if (c.phone === 'found') return c.device ? t('Handy erkannt: {device}', { device: deviceName(c.device) }) : t('Handy eingetragen');
    if (c.choices.length > 1) return t('{n} Handys gefunden, wähle später in den Einstellungen', { n: c.choices.length });
    return t('Kein Handy gefunden');
  };
</script>

<OnboardingFrame
  title={t('Wer wohnt hier?')}
  lead={managed ? t('Die Personen kommen aus der Konfiguration. Hier musst du nichts tun.') : t('Das sind die Personen aus Home Assistant. Tippe nur die ab, die Stups nicht nutzen sollen.')}
>
  {#if ob.loadingPeople && ob.candidates.length === 0}
    <p class="py-8 text-center text-fg2">{t('Stups sieht in Home Assistant nach …')}</p>
  {:else if managed}
    <ul class="flex flex-col gap-2" data-testid="people-managed">
      {#each ob.info?.people ?? [] as p (p.id)}
        <li class="flex items-center gap-3 rounded-row border border-line bg-surface px-3.5 py-2.5">
          <Avatar person={p} size={36} />
          <span class="text-[16px] font-semibold">{p.displayName}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <ul class="flex flex-col gap-2" data-testid="people-list">
      {#each ob.candidates as c (c.key)}
        {@const on = ob.selected.includes(c.key)}
        {@const child = ob.children.includes(c.key)}
        <li class="rounded-row border bg-surface px-3 py-2 {on ? 'border-line' : 'border-line opacity-60'}" data-testid="person-{c.key}">
          <div class="flex items-center gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={c.self ? t('{name} (du)', { name: c.name }) : c.name}
              disabled={c.self || ob.busy}
              class="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-100"
              onclick={() => togglePerson(c.key)}
            >
              <Avatar person={{ displayName: c.name, color: colorOf(c.personId) }} size={40} />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2 text-[16px] font-bold">
                  <span class="truncate">{c.name}</span>
                  {#if c.self}<span class="rounded-md bg-surface2 px-1.5 py-0.5 text-[11px] font-bold text-fg2">{t('Du')}</span>{/if}
                </span>
                <span class="block text-[13px] {on ? 'text-fg2' : 'text-hint'}">
                  {#if !on}{t('Nicht ausgewählt')}{:else if child}{t('Kind · sieht nur eigene Karten')}{:else}{status(c)}{/if}
                </span>
              </span>
              <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full {on ? 'bg-accent-grad text-on-accent' : 'border border-line'}" aria-hidden="true">
                {#if on}<Icon name="check" size={16} stroke={3} />{/if}
              </span>
            </button>
            {#if on && !c.self}
              <Chip small active={child} pressed={child} label={t('{name} ist ein Kind', { name: c.name })} onclick={() => toggleChild(c.key)}>{t('Kind')}</Chip>
            {/if}
          </div>
          {#if on && c.phone === 'missing' && c.choices.length === 0}
            <div class="pl-[52px]"><OnboardingCompanion name={c.name} /></div>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="mt-4 px-1 text-[13px] leading-[1.45] text-hint">{t('Handys erkennt Stups selbst, du musst nichts eintragen. Kinder und Rechte kannst du später jederzeit ändern.')}</p>
  {/if}

  {#snippet footer()}
    <CtaButton disabled={ob.busy || ob.loadingPeople} onclick={proceed}>
      {managed ? t('Weiter') : tn('Weiter mit {n} Person', 'Weiter mit {n} Personen', count)}
    </CtaButton>
  {/snippet}
</OnboardingFrame>
