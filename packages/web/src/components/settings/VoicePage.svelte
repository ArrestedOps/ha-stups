<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, type HouseEntities, type HouseInfo } from '../../lib/api';
  import { t } from '../../lib/i18n/index.svelte';
  import { toast } from '../../lib/store.svelte';
  import Group from '../Group.svelte';
  import Row from '../Row.svelte';
  import Page from './Page.svelte';

  /** Der Sprachdienst für alle Ansagen im Haus; die Kanäle (Lautsprecher, Lampe) richtet der Administrator bei jeder Person ein */
  let house = $state<HouseInfo | null>(null);
  let entities = $state<HouseEntities | null>(null);
  let busy = $state(false);
  let failed = $state(false);

  onMount(async () => {
    try {
      [house, entities] = await Promise.all([api.houseChannels(), api.houseEntities().catch(() => null)]);
    } catch {
      failed = true;
    }
  });

  async function save(tts: string | null) {
    busy = true;
    try {
      await api.setHouseTts(tts);
      house = await api.houseChannels();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Etwas ist schiefgelaufen'), { tone: 'error' });
    }
    busy = false;
  }
</script>

<Page title={t('Ansage und Lampe')}>
  {#if failed}
    <p class="py-10 text-center text-fg2">{t('Keine Verbindung zu Home Assistant')}</p>
  {:else if !house}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    <Group title={t('Haus')} hint={t('Der Sprachdienst, mit dem alle Ansagen gesprochen werden. Die Kanäle (Lautsprecher, Lampe) richtest du bei jeder Person ein.')}>
      <Row label={t('Sprachdienst')}>
        <select
          class="min-h-11 max-w-full rounded-xl bg-surface2 px-3"
          value={house.tts ?? ''}
          disabled={busy || !entities}
          aria-label={t('Sprachdienst für Ansagen')}
          onchange={(e) => void save(e.currentTarget.value || null)}
        >
          <option value="">{t('Nicht gewählt')}</option>
          {#each entities?.tts ?? [] as o (o.entityId)}<option value={o.entityId}>{o.name}</option>{/each}
        </select>
      </Row>
    </Group>
  {/if}
</Page>
