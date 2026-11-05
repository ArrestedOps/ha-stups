<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, type PushStatus } from '../../lib/api';
  import { houseResultLabel } from '../../lib/house';
  import { numberLocale, t, tn } from '../../lib/i18n/index.svelte';
  import { deviceName, quietNow, reach } from '../../lib/pushStand';
  import { feat, openSettings, ui } from '../../lib/store.svelte';
  import Avatar from '../Avatar.svelte';
  import Icon from '../Icon.svelte';
  import Banner from '../ui/Banner.svelte';
  import ListRow from '../ui/ListRow.svelte';
  import SectionHeader from '../ui/SectionHeader.svelte';

  /**
   * „Warum kommt nichts?": der Stand der Zustellung. Oben die Verbindung, dann pro Person „x / y Geräte erreichbar" und Ruhezeit,
   * bei Fehlern ein Banner mit der Lösung, dann das Protokoll der letzten Nachrichten. Darunter die Einzelheiten (Karten mit Termin,
   * Notify-Dienste, ntfy, Haus, Stupse).
   */
  let status = $state<PushStatus | null>(null);
  let statusError = $state('');

  async function load() {
    statusError = '';
    try {
      status = await api.pushStatus();
    } catch (e) {
      statusError = e instanceof ApiError ? e.message : t('Konnte den Stand nicht laden');
    }
  }
  onMount(() => void load());

  const kindLabel = $derived({ due: t('Fällig'), reminder: t('Vorab'), nag: t('Nachhaken'), summary: t('Zusammenfassung') } as const);
  const resultLabel = $derived({ sent: t('zugestellt'), skipped: t('übersprungen'), failed: t('fehlgeschlagen') } as const);
  const resultTone = { sent: 'bg-ok-bg text-ok', skipped: 'bg-count text-text-soft2', failed: 'bg-danger-bg text-danger' } as const;
  const stateLabel = $derived<Record<string, string>>({ wartet: t('wartet'), offen: t('offen'), beantwortet: t('beantwortet'), geschlossen: t('geschlossen') });
  const clock = (iso: string) =>
    new Date(iso).toLocaleString(numberLocale(), { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const hm = (iso: string) => new Date(iso).toLocaleTimeString(numberLocale(), { hour: '2-digit', minute: '2-digit' });
  const nowMinutes = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };

  /** Eine Zeile je Person aus der Antwort des Servers, mit dem Profil aus der Liste der Personen (Bild, Ruhezeit) */
  const rows = $derived(
    (status?.people ?? []).map((p) => {
      const user = ui.people.find((u) => u.name === p.name);
      const r = reach(p);
      const quiet = !!user && r.ok > 0 && quietNow(user.nudgeQuiet, nowMinutes());
      const waiting = (status?.nudges ?? []).filter((n) => n.state === 'wartet' && n.to === p.name).length;
      const devices = [...p.services.map((s) => (s.exists === false ? `${deviceName(s.service)} (${t('fehlt in HA')})` : deviceName(s.service))), ...(p.ntfy ? ['ntfy'] : [])];
      const tone: 'ok' | 'warn' | 'bad' | 'quiet' = r.total === 0 || r.ok === 0 ? 'bad' : quiet ? 'quiet' : r.ok < r.total ? 'warn' : 'ok';
      return { name: user?.displayName ?? p.name, user, r, quiet, waiting, devices, tone, missing: r.missing, own: user?.id === ui.me?.id };
    }),
  );
  const problems = $derived(rows.filter((r) => r.tone === 'bad'));
  const haOk = $derived(!!status && (status.people.some((p) => p.services.some((s) => s.exists !== null)) || status.people.every((p) => p.services.length === 0)));
  const lastSent = $derived(status?.recent[0]?.at);
  const badge = { ok: 'bg-ok-bg text-ok', warn: 'bg-[var(--c-orange-bg)] text-(--c-orange-fg)', bad: 'bg-danger-bg text-danger', quiet: 'bg-[var(--c-orange-bg)] text-(--c-orange-fg)' } as const;
</script>

<div class="flex flex-col gap-3.5 pt-1">
  {#if statusError}
    <p class="text-danger">{statusError}</p>
  {:else if !status}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    <div
      class="flex items-center gap-3 rounded-row border px-4 py-3.5 {haOk ? 'border-ok/35 bg-ok/10' : 'border-danger/35 bg-danger/10'}"
      data-testid="push-ok"
    >
      <span class="flex shrink-0 {haOk ? 'text-ok' : 'text-danger'}"><Icon name={haOk ? 'done' : 'wifi-off'} size={28} stroke={1.8} /></span>
      <div class="min-w-0">
        <p class="text-[15px] font-bold">{haOk ? (feat.haPush ? t('Verbindung zu Home Assistant steht') : t('Die Zustellung ist eingerichtet')) : t('Home Assistant antwortet gerade nicht')}</p>
        <p class="mt-0.5 text-[13px] text-fg2">
          {#if feat.haPush && haOk}{t('Knöpfe in Nachrichten kommen an')} •&nbsp;{/if}{lastSent ? t('zuletzt {time}', { time: hm(lastSent) }) : t('noch nichts gesendet')}
        </p>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <SectionHeader title={t('Pro Person')} />
      {#each rows as r (r.name)}
        <div data-testid="push-person">
          <ListRow title={r.name}>
            {#snippet tile()}
              {#if r.user}<Avatar person={r.user} size={42} />{:else}<span class="h-[42px] w-[42px] rounded-full bg-track"></span>{/if}
            {/snippet}
            {#snippet meta()}
              {#if r.tone === 'quiet'}
                {t('Ruhezeit bis {time}', { time: r.user?.nudgeQuiet.end ?? '' })}{r.waiting ? ` • ${tn('{n} Stups wartet', '{n} Stupse warten', r.waiting)}` : ''}
              {:else if r.r.total === 0 || r.devices.length === 0}
                <span class="text-danger">{t('Kein Push-Gerät')}</span>
              {:else}
                {r.devices.join(' • ')}
              {/if}
            {/snippet}
            {#snippet right()}
              <span class="inline-flex h-6 shrink-0 items-center rounded-full px-[9px] text-[12px] font-bold {badge[r.tone]}" aria-label={r.tone === 'quiet' ? t('Ruhezeit') : t('{ok} von {total} Geräten erreichbar', { ok: r.r.ok, total: r.r.total })}>
                {r.tone === 'quiet' ? t('Ruhe') : `${r.r.ok} / ${r.r.total}`}
              </span>
            {/snippet}
          </ListRow>
        </div>
      {/each}
    </div>

    {#each problems as r (r.name)}
      <Banner variant="warm" title={t('{name} bekommt nichts', { name: r.name })} sub={r.missing.length ? t('Gerät neu wählen: „{device}“', { device: deviceName(r.missing[0]!) }) : t('Kein Push-Gerät eingetragen')}>
        {#snippet leading()}<Icon name="alert" size={26} stroke={1.7} />{/snippet}
        {#snippet trailing()}
          <button class="bg-accent-grad glow-pill inline-flex h-[34px] items-center rounded-[12px] px-3 text-[13px] font-bold" onclick={() => openSettings(ui.isAdmin ? 'people' : 'notifications')}>{t('Ändern')}</button>
        {/snippet}
      </Banner>
    {/each}

    <div>
      <SectionHeader title={t('Zuletzt gesendet')} />
      <div class="mt-2 divide-y divide-line overflow-hidden rounded-row border border-line bg-surface">
        {#each status.recent as r, i (i)}
          <div class="flex min-h-[52px] items-center gap-2.5 px-3.5 text-[13px]">
            <span class="w-11 shrink-0 text-dim [font-variant-numeric:tabular-nums]">{hm(r.at)}</span>
            <span class="min-w-0 flex-1 truncate">{kindLabel[r.kind]} {t('an')} <b>{r.user}</b> · {r.title}</span>
            <span class="inline-flex h-6 shrink-0 items-center rounded-full px-[9px] text-[12px] font-bold {resultTone[r.status]}">{resultLabel[r.status]}</span>
          </div>
        {:else}
          <p class="px-3.5 py-4 text-[15px] text-fg2">{t('Noch nichts gesendet.')}</p>
        {/each}
      </div>
    </div>

    <div class="space-y-4 rounded-row border border-line bg-surface px-4 py-3.5 text-[15px]">
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
  {/if}
</div>
