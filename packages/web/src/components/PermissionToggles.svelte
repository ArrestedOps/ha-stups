<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { permissionRows, type Permission } from '../lib/permissions';
  import Toggle from './ui/Toggle.svelte';

  /**
   * Berechtigungen einer Person (nur für Administratoren, siehe PeopleSheet): ein Schalter mit kurzer Erklärung je Recht.
   * Administratoren dürfen ohnehin alles (nur ein Hinweis), Kinder bekommen keine (gar nichts zu sehen).
   * `onchange` bekommt die neue Liste; Speichern und Neuladen macht der Aufrufer.
   */
  let {
    person,
    busy = false,
    onchange,
  }: {
    person: { id: string; displayName: string; isAdmin: boolean; isChild: boolean; permissions?: Permission[] };
    busy?: boolean;
    onchange: (next: Permission[]) => void;
  } = $props();

  const rows = $derived(permissionRows());
  const have = $derived(person.permissions ?? []);

  function toggle(key: Permission, on: boolean) {
    const next = on ? [...have, key] : have.filter((k) => k !== key);
    onchange(rows.map((r) => r.key).filter((k) => next.includes(k)));
  }
</script>

{#if !person.isChild}
  <div data-testid="permissions-{person.id}">
    <p class="mb-1.5 text-[13px] font-semibold text-fg2">{t('Berechtigungen')}</p>
    {#if person.isAdmin}
      <p class="text-[13px] text-fg2">{t('Administratoren dürfen alles.')}</p>
    {:else}
      <p class="mb-1 text-[13px] text-fg2">{t('Was {name} zusätzlich tun darf. Nur Administratoren vergeben Berechtigungen.', { name: person.displayName })}</p>
      <div class="divide-y divide-line">
        {#each rows as r (r.key)}
          <div class="flex items-center justify-between gap-3 py-1.5" data-testid="permission-{r.key}">
            <div class="min-w-0 flex-1">
              <p class="text-[15px] font-semibold">{r.title}</p>
              <p class="text-[13px] leading-[1.4] text-fg2">{r.hint}</p>
            </div>
            <Toggle checked={have.includes(r.key)} disabled={busy} label={t('{permission} für {name}', { permission: r.title, name: person.displayName })} onchange={(on) => toggle(r.key, on)} />
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
