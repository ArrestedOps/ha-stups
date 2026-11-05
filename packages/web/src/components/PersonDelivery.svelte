<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { api, type AccessInfo } from '../lib/api';
  import { busyRange } from '../lib/busy';
  import { feat, toast } from '../lib/store.svelte';

  /**
   * Wie die Nachrichten bei einer Person ankommen: ntfy-Thema, Push-Geräte der Companion App, Ruhezeit für Stupse und die Zusammenfassung
   * am Sonntag. Dieselben Felder erscheinen bei einem selbst (Einstellungen › Benachrichtigungen) und für Administratoren bei jeder
   * Person (Personen und Zugriff). `run` führt die Änderung aus und lädt danach neu (siehe PeopleSheet und NotificationsPage).
   */
  let {
    p,
    info,
    run,
    busy,
    canEdit,
    show,
  }: {
    p: AccessInfo['people'][number];
    info: AccessInfo;
    run: (fn: () => Promise<unknown>) => Promise<void>;
    busy: boolean;
    canEdit: boolean;
    show: { delivery?: boolean; quiet?: boolean; summary?: boolean; busy?: boolean };
  } = $props();

  // ntfy: Entwurf des Themas je Person, bis gespeichert wird
  let topicDraft = $state<Record<string, string>>({});
  const topicOf = (q: { id: string; ntfyTopic?: string | null }) => topicDraft[q.id] ?? q.ntfyTopic ?? '';
  const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;

  function randomTopic(): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    return `stups-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
  }

  function saveTopic(id: string, topic: string) {
    const value = topic.trim();
    void run(async () => {
      await api.updatePerson(id, { ntfyTopic: value });
      delete topicDraft[id];
      toast(value ? t('ntfy-Thema gespeichert') : t('ntfy-Thema entfernt'));
    });
  }

  function toggleService(id: string, current: string[], service: string, on: boolean) {
    const next = on ? [...current, service] : current.filter((s) => s !== service);
    void run(() => api.updatePerson(id, { notifyServices: next }));
  }
</script>

{#if show.delivery}
              {#if feat.ntfy && info.ntfy}
                <div data-testid="ntfy-{p.id}">
                  <p class="mb-1.5 text-[13px] font-semibold text-fg2">{t('Push über ntfy')}</p>
                  {#if !canEdit}
                    <p class="text-[15px] text-fg2">{t('Das Thema richtet {name} selbst ein oder ein Administrator.', { name: p.displayName })}</p>
                  {:else}
                    <div class="flex items-center gap-2">
                      <input
                        value={topicOf(p)}
                        oninput={(e) => (topicDraft[p.id] = e.currentTarget.value)}
                        maxlength="64"
                        autocomplete="off"
                        autocapitalize="none"
                        spellcheck="false"
                        placeholder={t('Thema, zum Beispiel stups-anna-7x2k')}
                        aria-label={t('ntfy-Thema von {name}', { name: p.displayName })}
                        class="min-h-11 min-w-0 flex-1 rounded-xl bg-surface2 px-3"
                      />
                      <button
                        type="button"
                        class="min-h-11 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-40"
                        disabled={busy || (topicOf(p) !== '' && !TOPIC_RE.test(topicOf(p).trim())) || topicOf(p).trim() === (p.ntfyTopic ?? '')}
                        onclick={() => saveTopic(p.id, topicOf(p))}
                      >
                        {t('Speichern')}
                      </button>
                    </div>
                    <div class="mt-1 flex gap-2">
                      <button type="button" class="min-h-11 text-[15px] font-semibold text-accent-text" onclick={() => (topicDraft[p.id] = randomTopic())}>
                        {t('Zufälliges Thema')}
                      </button>
                      {#if p.ntfy}
                        <button type="button" class="min-h-11 text-[15px] font-semibold text-danger" disabled={busy} onclick={() => saveTopic(p.id, '')}>
                          {t('Entfernen')}
                        </button>
                      {/if}
                    </div>
                    {#if topicOf(p) !== '' && !TOPIC_RE.test(topicOf(p).trim())}
                      <p class="text-[13px] text-danger">{t('Erlaubt sind Buchstaben, Ziffern, Minus und Unterstrich (höchstens 64 Zeichen).')}</p>
                    {/if}
                    <p class="mt-1 text-[13px] text-fg2">
                      {t('In der ntfy-App den Server {url} verwenden und dieses Thema abonnieren. Wer das Thema kennt, kann die Nachrichten lesen: ein zufälliges ist sicherer als ein Name.', { url: info.ntfy.url })}
                    </p>
                    {#if !info.ntfy.buttons}
                      <p class="mt-1 text-[13px] text-danger">
                        {t('Ohne STUPS_PUBLIC_URL im Container kommen die Nachrichten ohne Link zur Karte und ohne Knöpfe.')}
                      </p>
                    {/if}
                  {/if}
                </div>
              {/if}

              {#if feat.haPush}
              <div>
                <p class="mb-1.5 text-[13px] font-semibold text-fg2">{t('Push-Geräte (Companion App)')}</p>
                {#if info.managed}
                  {#each p.notifyServices as s (s)}
                    {@const missing = info.services !== null && !info.services.includes(s)}
                    <p class="flex min-h-9 items-center gap-3 text-[15px]">
                      <span class="min-w-0 flex-1 truncate">{s.replace(/^mobile_app_/, '')}</span>
                      {#if missing}<span class="text-[13px] text-danger">{t('gibt es nicht')}</span>{/if}
                    </p>
                  {:else}
                    <p class="text-[15px] text-danger">{t('Kein Gerät in der Konfiguration eingetragen.')}</p>
                  {/each}
                {:else if !canEdit}
                  <p class="text-[15px] text-fg2">{t('Die Geräte wählt {name} selbst oder ein Administrator.', { name: p.displayName })}</p>
                {:else}
                  {#each [...new Set([...(info.services ?? []), ...p.notifyServices])].sort() as s (s)}
                    {@const on = p.notifyServices.includes(s)}
                    {@const missing = info.services !== null && !info.services.includes(s)}
                    <label class="flex min-h-11 items-center gap-3 text-[15px]">
                      <input
                        type="checkbox"
                        class="h-5 w-5 accent-[var(--accent)]"
                        checked={on}
                        disabled={busy}
                        onchange={(e) => toggleService(p.id, p.notifyServices, s, e.currentTarget.checked)}
                      />
                      <span class="min-w-0 flex-1 truncate">{s.replace(/^mobile_app_/, '')}</span>
                      {#if missing}<span class="text-[13px] text-danger">{t('gibt es nicht mehr')}</span>{/if}
                    </label>
                  {:else}
                    <p class="text-[15px] text-fg2">
                      {t('Home Assistant meldet keine Geräte. Die Companion App muss auf dem Handy angemeldet sein.')}
                    </p>
                  {/each}
                {/if}
              </div>
              {/if}
{/if}

{#if show.busy && canEdit}
  {@const range = busyRange()}
  <div data-testid="busy-setup">
    <p class="mb-1.5 text-[13px] font-semibold text-fg2">{t('Wenig Zeit')}</p>
    <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
      <span>{t('Rotationen der Wächter überspringen {name} bis zu diesem Tag', { name: p.displayName })}</span>
      <input
        type="date"
        class="min-h-11 rounded-xl bg-surface2 px-3"
        value={p.busyUntil ?? ''}
        min={range.min}
        max={range.max}
        disabled={busy}
        aria-label={t('Wenig Zeit bis (Datum) für {name}', { name: p.displayName })}
        onchange={(e) => {
          // sofort lesen: `run` führt die Änderung erst später aus
          const value = e.currentTarget.value || null;
          void run(() => api.updatePerson(p.id, { busyUntil: value }));
        }}
      />
    </label>
    {#if p.busyUntil}
      <button type="button" class="min-h-11 text-[15px] font-semibold text-accent-text" disabled={busy} onclick={() => run(() => api.updatePerson(p.id, { busyUntil: null }))}>{t('Wieder normal')}</button>
    {/if}
    <p class="text-[13px] text-fg2">{t('Von Hand kann man ihr oder ihm weiter Karten zuweisen; nur das Verteilen durch Wächter pausiert.')}</p>
  </div>
{/if}

{#if show.quiet}
              {#if canEdit}
                <div>
                  <p class="mb-1.5 text-[13px] font-semibold text-fg2">{t('Ruhezeit für Stupse')}</p>
                  <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
                    <span>{t('Stupse in der Ruhezeit erst danach zustellen')}</span>
                    <input
                      type="checkbox"
                      class="h-5 w-5 accent-[var(--accent)]"
                      checked={!p.nudgeQuiet.off}
                      disabled={busy}
                      aria-label={t('Ruhezeit für Stupse von {name}', { name: p.displayName })}
                      onchange={(e) => run(() => api.updatePerson(p.id, { quietOff: !e.currentTarget.checked }))}
                    />
                  </label>
                  {#if !p.nudgeQuiet.off}
                    <div class="mt-1 flex items-center gap-2 text-[15px]">
                      <input
                        type="time"
                        class="min-h-11 rounded-xl bg-surface2 px-3"
                        value={p.nudgeQuiet.start}
                        aria-label={t('Beginn der Ruhezeit von {name}', { name: p.displayName })}
                        onchange={(e) => e.currentTarget.value && run(() => api.updatePerson(p.id, { quietStart: e.currentTarget.value }))}
                      />
                      <span>{t('bis')}</span>
                      <input
                        type="time"
                        class="min-h-11 rounded-xl bg-surface2 px-3"
                        value={p.nudgeQuiet.end}
                        aria-label={t('Ende der Ruhezeit von {name}', { name: p.displayName })}
                        onchange={(e) => e.currentTarget.value && run(() => api.updatePerson(p.id, { quietEnd: e.currentTarget.value }))}
                      />
                    </div>
                  {/if}
                </div>
              {/if}
{/if}

{#if show.summary}
              {#if canEdit}
                <div>
                  <p class="mb-1.5 text-[13px] font-semibold text-fg2">{t('Zusammenfassung')}</p>
                  <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
                    <span>{t('Wöchentliche Zusammenfassung am Sonntag')}</span>
                    <input
                      type="checkbox"
                      class="h-5 w-5 accent-[var(--accent)]"
                      checked={p.weeklySummary}
                      disabled={busy}
                      aria-label={t('Wöchentliche Zusammenfassung von {name}', { name: p.displayName })}
                      onchange={(e) => {
                        // sofort lesen: `run` führt die Änderung erst später aus
                        const on = e.currentTarget.checked;
                        void run(() => api.updatePerson(p.id, { weeklySummary: on }));
                      }}
                    />
                  </label>
                  <p class="text-[13px] text-fg2">{t('Am Sonntagabend eine Nachricht, wie viel ihr diese Woche zusammen erledigt habt. Aus, bis du es einschaltest.')}</p>
                </div>
              {/if}
{/if}
