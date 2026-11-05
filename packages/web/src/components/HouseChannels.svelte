<script lang="ts">
  import Toggle from './ui/Toggle.svelte';
  import { api, type HouseChannel, type HouseEntities, type HouseInfo, type HouseKind, type HouseResult, type HouseType } from '../lib/api';
  import { houseResultLabel } from '../lib/house';
  import { numberLocale, t } from '../lib/i18n/index.svelte';
  import { toast } from '../lib/store.svelte';

  /**
   * Haus-Kanäle einer Person (Ansage über einen Lautsprecher, Lampe): Stups, Erinnerung und Wächter-Karte kommen im Haus an,
   * nicht nur aufs Handy. Nur für Administratoren, nur mit Home Assistant. Gespeichert wird sofort beim Ändern.
   */
  let {
    person,
    house,
    entities,
    run,
    busy,
  }: {
    person: { id: string; displayName: string };
    house: HouseInfo;
    entities: HouseEntities | null;
    /** Führt eine Änderung aus, lädt danach neu und meldet Fehler (kommt vom Personen-Fenster) */
    run: (fn: () => Promise<unknown>) => Promise<void>;
    busy: boolean;
  } = $props();

  const channels = $derived(house.channels.filter((c) => c.userId === person.id));
  const unmatched = $derived(house.unmatched.includes(person.id));

  const KINDS: HouseKind[] = ['nudge', 'due', 'watcher'];
  const kindLabel = (k: HouseKind) => ({ nudge: t('Stupse'), due: t('Fälligkeiten'), watcher: t('Wächter-Karten') })[k];
  const typeLabel = (type: HouseType) => (type === 'speak' ? t('Ansage') : t('Lampe'));
  const VOLUMES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  const update = (c: HouseChannel, patch: Parameters<typeof api.updateHouseChannel>[1]) => void run(() => api.updateHouseChannel(c.id, patch));

  function toggleKind(c: HouseChannel, kind: HouseKind, on: boolean) {
    const next = KINDS.filter((k) => (k === kind ? on : c.kinds.includes(k)));
    update(c, { kinds: next });
  }

  function setWait(c: HouseChannel, raw: string) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= 1440 && n !== c.waitMinutes) update(c, { waitMinutes: n });
  }

  const when = (iso: string) => new Date(iso).toLocaleString(numberLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const statusText = (r: HouseResult): string => `${houseResultLabel(r)} · ${when(r.at)}`;

  function test(c: HouseChannel) {
    void run(async () => {
      const r = await api.testHouseChannel(c.id);
      if (r.result === 'delivered') toast(t('Test gesendet'));
      else toast(r.error?.message ?? t('Der Test ist fehlgeschlagen'), { tone: 'error' });
    });
  }

  let confirmRemove = $state<string | null>(null);
  function remove(c: HouseChannel) {
    confirmRemove = null;
    void run(() => api.removeHouseChannel(c.id));
  }

  // Neuen Kanal anlegen
  let adding = $state(false);
  let newType = $state<HouseType>('speak');
  let newEntity = $state('');
  const options = $derived(newType === 'speak' ? (entities?.speakers ?? []) : (entities?.lights ?? []));

  function add(e: Event) {
    e.preventDefault();
    const entity = options.find((o) => o.entityId === newEntity);
    if (!entity) return;
    const body = { userId: person.id, type: newType, entityId: entity.entityId, name: entity.name };
    adding = false;
    newEntity = '';
    void run(() => api.addHouseChannel(body));
  }
</script>

<div data-testid="house-{person.id}">
  <p class="mb-1.5 text-[13px] font-semibold text-fg2">{t('Haus')}</p>
  <p class="mb-2 text-[13px] text-fg2">{t('Stupse, Erinnerungen und Wächter-Karten im Haus: als Ansage über einen Lautsprecher oder als Lampe, die kurz aufleuchtet.')}</p>

  {#each channels as c (c.id)}
    <div class="mb-3 rounded-xl border border-line px-3 py-2" data-testid="house-channel-{c.id}">
      <div class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
        <span class="min-w-0 flex-1 truncate font-semibold">{typeLabel(c.type)}: {c.name}</span>
        <Toggle checked={c.enabled} disabled={busy} label={t('Kanal {name} einschalten', { name: c.name })} onchange={(on) => update(c, { enabled: on })} />
      </div>

      <div class="mt-1 {c.enabled ? '' : 'opacity-60'}">
        {#each KINDS as kind (kind)}
          <div class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
            <span>{kindLabel(kind)}</span>
            <Toggle checked={c.kinds.includes(kind)} disabled={busy} label={t('{kind} im Kanal {name}', { kind: kindLabel(kind), name: c.name })} onchange={(on) => toggleKind(c, kind, on)} />
          </div>
        {/each}

        <label class="mt-1 flex min-h-11 items-center justify-between gap-3 text-[15px]">
          <span>{t('Wenn nicht zu Hause')}</span>
          <select
            class="min-h-11 max-w-[60%] rounded-xl bg-surface2 px-3"
            value={c.whenAway}
            disabled={busy}
            aria-label={t('Wenn nicht zu Hause, Kanal {name}', { name: c.name })}
            onchange={(e) => update(c, { whenAway: e.currentTarget.value as 'skip' | 'wait' })}
          >
            <option value="skip">{t('Verwerfen')}</option>
            <option value="wait">{t('Warten, bis die Person heimkommt')}</option>
          </select>
        </label>
        {#if c.whenAway === 'wait'}
          <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
            <span>{t('Frist in Minuten')}</span>
            <input
              type="number"
              min="1"
              max="1440"
              class="min-h-11 w-24 rounded-xl bg-surface2 px-3 text-right"
              value={c.waitMinutes}
              disabled={busy}
              aria-label={t('Frist in Minuten, Kanal {name}', { name: c.name })}
              onchange={(e) => setWait(c, e.currentTarget.value)}
            />
          </label>
        {/if}
        {#if c.type === 'speak'}
          <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
            <span>{t('Lautstärke')}</span>
            <select
              class="min-h-11 rounded-xl bg-surface2 px-3"
              value={c.volume === null ? '' : String(c.volume)}
              disabled={busy}
              aria-label={t('Lautstärke, Kanal {name}', { name: c.name })}
              onchange={(e) => update(c, { volume: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })}
            >
              <option value="">{t('Nicht ändern')}</option>
              {#each VOLUMES as v (v)}<option value={String(v)}>{v} %</option>{/each}
            </select>
          </label>
        {/if}
      </div>

      {#if c.status}
        <p class="mt-1 text-[13px] {c.status.result === 'error' ? 'text-danger' : 'text-fg2'}" data-testid="house-status-{c.id}">{statusText(c.status)}</p>
      {/if}

      <div class="mt-2 flex gap-2">
        {#if confirmRemove === c.id}
          <button type="button" class="min-h-11 flex-1 rounded-xl bg-danger-bg font-semibold text-danger" disabled={busy} onclick={() => remove(c)}>{t('Ja, entfernen')}</button>
          <button type="button" class="min-h-11 flex-1 rounded-xl bg-surface2 font-semibold" onclick={() => (confirmRemove = null)}>{t('Abbrechen')}</button>
        {:else}
          <button type="button" class="min-h-11 flex-1 rounded-xl bg-surface2 font-semibold" disabled={busy} aria-label={t('Kanal {name} testen', { name: c.name })} onclick={() => test(c)}>{t('Testen')}</button>
          <button type="button" class="min-h-11 flex-1 rounded-xl text-[15px] font-semibold text-danger" disabled={busy} aria-label={t('Kanal {name} entfernen', { name: c.name })} onclick={() => (confirmRemove = c.id)}>{t('Entfernen')}</button>
        {/if}
      </div>
    </div>
  {/each}

  {#if unmatched}
    <p class="mb-2 text-[13px] text-fg2" data-testid="house-unmatched-{person.id}">
      {t('In Home Assistant gibt es keine passende Person: „zu Hause" gilt hier immer. Der Name muss mit dem der Person in Home Assistant übereinstimmen.')}
    </p>
  {/if}

  {#if !adding}
    <button type="button" class="min-h-11 text-[15px] font-semibold text-accent-text" disabled={busy} onclick={() => (adding = true)}>{t('Kanal hinzufügen')}</button>
  {:else}
    <form class="rounded-xl border border-line px-3 py-2" onsubmit={add}>
      {#if !entities}
        <p class="text-[15px] text-danger">{t('Keine Verbindung zu Home Assistant')}</p>
      {:else}
        <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
          <span>{t('Typ')}</span>
          <select
            class="min-h-11 rounded-xl bg-surface2 px-3"
            bind:value={newType}
            aria-label={t('Typ des Kanals')}
            onchange={() => (newEntity = '')}
          >
            <option value="speak">{t('Ansage')}</option>
            <option value="light">{t('Lampe')}</option>
          </select>
        </label>
        <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
          <span>{newType === 'speak' ? t('Lautsprecher') : t('Lampe')}</span>
          <select class="min-h-11 max-w-[65%] rounded-xl bg-surface2 px-3" bind:value={newEntity} aria-label={t('Entität des Kanals')}>
            <option value="">{t('Bitte wählen')}</option>
            {#each options as o (o.entityId)}<option value={o.entityId}>{o.name}</option>{/each}
          </select>
        </label>
        {#if options.length === 0}
          <p class="text-[13px] text-fg2">{newType === 'speak' ? t('Home Assistant meldet keine Lautsprecher (media_player).') : t('Home Assistant meldet keine Lampen (light).')}</p>
        {/if}
      {/if}
      <div class="mt-2 flex gap-2">
        <button type="submit" class="min-h-11 flex-1 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-40" disabled={busy || !newEntity}>{t('Hinzufügen')}</button>
        <button type="button" class="min-h-11 flex-1 rounded-xl bg-surface2 font-semibold" onclick={() => (adding = false)}>{t('Abbrechen')}</button>
      </div>
    </form>
  {/if}
</div>
