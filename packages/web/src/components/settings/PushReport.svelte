<script lang="ts">
  import { api, ApiError, type PushStatus } from '../../lib/api';
  import { houseResultLabel } from '../../lib/house';
  import { numberLocale, t } from '../../lib/i18n/index.svelte';
  import { feat } from '../../lib/store.svelte';
  import Group from '../Group.svelte';
  import Row from '../Row.svelte';

  /** „Warum kommt nichts an?": der Stand der Zustellung (Geräte, ntfy, Haus, die letzten Nachrichten und Stupse) */
  let status = $state<PushStatus | null>(null);
  let statusError = $state('');

  async function showStatus() {
    statusError = '';
    try {
      status = await api.pushStatus();
    } catch (e) {
      statusError = e instanceof ApiError ? e.message : t('Konnte den Stand nicht laden');
    }
  }
  const kindLabel = $derived({ due: t('Fällig'), reminder: t('Vorab'), nag: t('Nachhaken'), summary: t('Zusammenfassung') } as const);
  const statusLabel = $derived({ sent: t('gesendet'), skipped: t('übersprungen'), failed: t('fehlgeschlagen') } as const);
  const stateLabel = $derived<Record<string, string>>({ wartet: t('wartet'), offen: t('offen'), beantwortet: t('beantwortet'), geschlossen: t('geschlossen') });
  const clock = (iso: string) =>
    new Date(iso).toLocaleString(numberLocale(), { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
</script>

<Group title={t('Warum kommt nichts?')}>
  <Row label={t('Warum kommt nichts?')}>
    <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold" onclick={showStatus}>{t('Stand anzeigen')}</button>
  </Row>
  {#if statusError}
    <Row stack><p class="text-danger">{statusError}</p></Row>
  {/if}
  {#if status}
    <Row stack>
      <div class="space-y-3 text-[15px]">
        <div>
          <p class="font-semibold">{t('Nächste Karten mit Termin')}</p>
          {#each status.upcoming as c (c.title + c.dueAt)}
            <p class="mt-1">
              {c.title} · {clock(c.dueAt)} · {c.assignees.length ? c.assignees.join(', ') : t('niemand')}
              {#if c.note}<span class="block text-[13px] text-danger">{c.note}</span>{/if}
            </p>
          {:else}
            <p class="mt-1 text-fg2">{t('Keine offene Karte mit Termin.')}</p>
          {/each}
        </div>
        {#if feat.haPush}
          <div>
            <p class="font-semibold">{t('Notify-Dienste')}</p>
            {#each status.people as p (p.name)}
              <p class="mt-1">
                {p.name}:
                {#each p.services as s (s.service)}
                  <span class="block text-[13px] {s.exists === false ? 'text-danger' : 'text-fg2'}">
                    {s.service}{s.exists === false ? ` (${t('gibt es in Home Assistant nicht')})` : ''}
                  </span>
                {:else}
                  <span class="text-danger">{t('kein Dienst eingetragen')}</span>
                {/each}
              </p>
            {/each}
          </div>
        {/if}
        {#if status.ntfy}
          <div data-testid="ntfy-status">
            <p class="font-semibold">ntfy</p>
            <p class="mt-1 text-[13px] text-fg2">Server: {status.ntfy.url}</p>
            {#each status.people as p (p.name)}
              <p class="mt-1">
                {p.name}: <span class={p.ntfy ? 'text-fg2' : 'text-danger'}>{p.ntfy ? t('Thema eingetragen') : t('kein Thema eingetragen')}</span>
              </p>
            {/each}
            <p class="mt-1 text-[13px] {status.ntfy.buttons ? 'text-fg2' : 'text-danger'}">
              {#if !status.ntfy.buttons}
                {t('STUPS_PUBLIC_URL fehlt: keine Knöpfe und kein Link in den Nachrichten.')}
              {:else if status.ntfy.roundTrip}
                {t('Rückweg der Knöpfe zuletzt geprüft: {time}', { time: clock(status.ntfy.roundTrip) })}
              {:else}
                {t('Rückweg der Knöpfe seit dem Start nicht geprüft (Test-Nachricht senden und auf „Rückweg prüfen“ tippen).')}
              {/if}
            </p>
          </div>
        {/if}
        {#if status.house && status.house.length > 0}
          <div data-testid="house-status">
            <p class="font-semibold">{t('Haus')}</p>
            {#each status.house as h, i (i)}
              <p class="mt-1">
                {h.person}: {h.type === 'speak' ? t('Ansage') : t('Lampe')} {h.name}
                <span class="block text-[13px] {h.status?.result === 'error' ? 'text-danger' : 'text-fg2'}">
                  {#if !h.enabled}{t('ausgeschaltet')}{:else if !h.status}{t('noch nichts gesendet seit dem Start')}{:else}{houseResultLabel(h.status)}{#if h.status.result !== 'error'} · {clock(h.status.at)}{/if}{/if}
                </span>
              </p>
            {/each}
          </div>
        {/if}
        <div>
          <p class="font-semibold">{t('Zuletzt')}</p>
          {#each status.recent as r, i (i)}
            <p class="mt-1">
              {r.title} · {kindLabel[r.kind]} · {r.user} · {statusLabel[r.status]}
              <span class="block text-[13px] text-fg2">{clock(r.at)}</span>
            </p>
          {:else}
            <p class="mt-1 text-fg2">{t('Noch nichts gesendet.')}</p>
          {/each}
        </div>
        <div>
          <p class="font-semibold">{t('Stupse')}</p>
          {#each status.nudges as n, i (i)}
            <p class="mt-1">
              {n.title} · {n.from} → {n.to} · {stateLabel[n.state] ?? n.state}
              <span class="block text-[13px] text-fg2">
                {clock(n.at)}{n.state === 'wartet' ? ` · ${t('wird {time} zugestellt (Ende der Ruhezeit)', { time: clock(n.deliverAt) })}` : ''}
              </span>
            </p>
          {:else}
            <p class="mt-1 text-fg2">{t('Noch kein Stups.')}</p>
          {/each}
        </div>
      </div>
    </Row>
  {/if}
</Group>
