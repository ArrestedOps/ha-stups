<script lang="ts">
  import { onMount } from 'svelte';
  import { t, tn } from '../lib/i18n/index.svelte';
  import { childChoices, visibleCandidates } from '../lib/onboarding';
  import { deviceName } from '../lib/pushStand';
  import { loadPeople, next, ob, savePeople, toggleChild, togglePerson, toggleSelf } from '../lib/onboarding.svelte';
  import { ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import OnboardingCompanion from './OnboardingCompanion.svelte';
  import OnboardingFrame from './OnboardingFrame.svelte';
  import Chip from './ui/Chip.svelte';
  import CtaButton from './ui/CtaButton.svelte';
  import Toggle from './ui/Toggle.svelte';

  /**
   * Schritt „Wer wohnt hier?": die Personen aus Home Assistant, alle vorgewählt, jede mit einem Schalter und dem Stand ihres Handys. „Wer ist ein
   * Kind?" ist ein eigener Abschnitt (wächst mit der Zahl der Personen mit). Der Administrator ist keine Person und kommt nicht vor, außer er
   * schaltet „Mich auch hinzufügen" ein. Gespeichert wird erst beim Weiter. Stehen die Personen in der Add-on-Konfiguration, ist der Schritt nur
   * eine Anzeige.
   */
  onMount(() => void loadPeople());

  const managed = $derived(ob.info?.managed === true);
  const rows = $derived(visibleCandidates(ob.candidates, ob.includeSelf));
  const kids = $derived(childChoices(ob.candidates, ob.selected));
  const count = $derived(ob.selected.length);
  const colorOf = (id: string | null) => ui.people.find((p) => p.id === id)?.color ?? null;
  /** Ab sieben Personen drei Spalten am Desktop, damit alles ohne Scrollen in den Dialog passt */
  const cols = $derived(rows.length > 6 ? 'lg:grid-cols-3' : 'lg:grid-cols-2');

  async function proceed() {
    if (managed || (await savePeople())) next();
  }

  const status = (c: (typeof ob.candidates)[number]): string => {
    if (c.phone === 'found') return c.devices.length > 0 ? t('Handy erkannt · {device}', { device: c.devices.map(deviceName).join(', ') }) : t('Handy eingetragen');
    if (c.choices.length > 1) return t('{n} Handys gefunden, wähle später in den Einstellungen', { n: c.choices.length });
    return t('Kein Handy gefunden');
  };
</script>

<OnboardingFrame
  title={t('Wer wohnt hier?')}
  lead={managed ? t('Die Personen kommen aus der Konfiguration. Hier musst du nichts tun.') : t('Das sind die Personen aus Home Assistant. Schalte aus, wer Stups nicht nutzen soll.')}
>
  {#if ob.loadingPeople && ob.candidates.length === 0}
    <p class="py-8 text-center text-fg2">{t('Stups sieht in Home Assistant nach …')}</p>
  {:else if managed}
    <ul class="flex flex-col gap-2" data-testid="people-managed">
      {#each ob.info?.people ?? [] as p (p.id)}
        <li class="flex items-center gap-3 rounded-[16px] border border-line bg-surface px-3.5 py-2.5">
          <Avatar person={p} size={40} />
          <span class="text-[16px] font-bold">{p.displayName}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <ul class="grid grid-cols-1 gap-2 {cols}" data-testid="people-list">
      {#each rows as c (c.key)}
        {@const on = ob.selected.includes(c.key)}
        <li class="flex min-h-16 items-center gap-3 rounded-[16px] border border-line bg-surface px-3.5 py-2.5 {on ? '' : 'opacity-60'}" data-testid="person-{c.key}">
          <Avatar person={{ displayName: c.name, color: colorOf(c.personId) }} size={40} />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 text-[16px] leading-tight font-bold">
              <span class="truncate">{c.name}</span>
              {#if c.self}<span class="rounded-md bg-surface2 px-1.5 py-0.5 text-[11px] font-bold text-fg2">{t('Du')}</span>{/if}
            </div>
            <div class="mt-0.5 text-[13px] leading-snug {!on ? 'text-hint' : c.phone === 'found' ? 'text-ok' : 'text-fg2'}">{on ? status(c) : t('Nicht dabei')}</div>
            {#if on && c.phone === 'missing' && c.choices.length === 0}<div class="mt-0.5"><OnboardingCompanion name={c.name} /></div>{/if}
          </div>
          <Toggle checked={on} label={t('{name} ist dabei', { name: c.name })} disabled={ob.busy} onchange={() => togglePerson(c.key)} />
        </li>
      {/each}
    </ul>

    {#if kids.length > 0}
      <section class="mt-5" aria-labelledby="ob-kids">
        <h2 id="ob-kids" class="text-[15.5px] font-extrabold">{t('Wer ist ein Kind?')}</h2>
        <p class="mt-1 mb-2.5 text-[13px] leading-[1.4] text-fg2">{t('Kinder sehen nur die Aufgaben, die ihnen zugewiesen sind. Tippe auf die Kinder.')}</p>
        <div class="flex flex-wrap gap-2" data-testid="kids">
          {#each kids as c (c.key)}
            {@const child = ob.children.includes(c.key)}
            <Chip photo active={child} pressed={child} label={t('{name} ist ein Kind', { name: c.name })} onclick={() => toggleChild(c.key)}>
              <Avatar person={{ displayName: c.name, color: colorOf(c.personId) }} size={28} />{c.name}{#if child}<Icon name="check" size={16} stroke={3} />{/if}
            </Chip>
          {/each}
        </div>
      </section>
    {/if}

    {#if !ui.me?.isPerson}
      <div class="mt-4 flex items-center gap-3 rounded-2xl bg-surface2 px-3.5 py-3 text-[13.5px] leading-[1.35] text-fg2" data-testid="admin-note">
        <Icon name="info" size={20} />
        <span class="min-w-0 flex-1"><b class="text-fg">{t('Du bist Administrator')}</b> {t('und kommst in Stups nicht als Person vor.')}<br />{t('Mich auch hinzufügen')}</span>
        <Toggle checked={ob.includeSelf} label={t('Mich auch als Person hinzufügen')} disabled={ob.busy} onchange={toggleSelf} />
      </div>
    {/if}
    <p class="mt-3 px-1 text-[12.5px] leading-[1.4] text-hint">{t('Handys erkennt Stups selbst, du musst nichts eintragen.')}</p>
  {/if}

  {#snippet footer()}
    <CtaButton disabled={ob.busy || ob.loadingPeople} onclick={proceed}>
      {managed || count === 0 ? t('Weiter') : tn('Weiter mit {n} Person', 'Weiter mit {n} Personen', count)}
    </CtaButton>
  {/snippet}
</OnboardingFrame>
