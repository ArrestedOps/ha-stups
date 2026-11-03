<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, type AccessInfo } from '../../lib/api';
  import { t, tn } from '../../lib/i18n/index.svelte';
  import { feat, openSettings, refresh, toast, ui } from '../../lib/store.svelte';
  import Group from '../Group.svelte';
  import Icon from '../Icon.svelte';
  import PersonDelivery from '../PersonDelivery.svelte';
  import Row from '../Row.svelte';
  import Page from './Page.svelte';

  /** Meine Benachrichtigungen: Test an mich, meine Geräte oder mein ntfy-Thema, Ruhezeit, Rückblick am Sonntag */
  let info = $state<AccessInfo | null>(null);
  let loadError = $state('');
  let busy = $state(false);
  let sending = $state(false);
  const me = $derived(info?.people.find((p) => p.id === ui.me?.id) ?? null);

  async function load() {
    try {
      info = await api.access();
      loadError = '';
    } catch (e) {
      loadError = e instanceof ApiError ? e.message : t('Konnte die Personen nicht laden');
    }
  }
  onMount(load);

  /** Änderungen laufen nacheinander (wie im Personen-Fenster), danach lädt die Seite neu */
  let chain: Promise<void> = Promise.resolve();
  let pending = 0;
  function run(fn: () => Promise<unknown>): Promise<void> {
    pending += 1;
    busy = true;
    chain = chain.then(async () => {
      try {
        await fn();
      } catch (e) {
        toast(e instanceof ApiError ? e.message : t('Etwas ist schiefgelaufen'), { tone: 'error' });
      }
      await Promise.all([load(), refresh()]);
      pending -= 1;
      busy = pending > 0;
    });
    return chain;
  }

  async function testPush() {
    if (!ui.me || sending) return;
    sending = true;
    try {
      if (feat.standalone) {
        await api.testPushOwn();
        toast(feat.ntfy ? t('Test-Nachricht gesendet. Tippe auf „Rückweg prüfen“ und danach unten auf „Stand anzeigen“.') : t('Test-Nachricht gesendet.'));
      } else {
        const res = await api.testPush(ui.me.name);
        toast(t('Test-Nachricht gesendet ({devices}). Zum Erledigen die Nachricht aufklappen.', { devices: tn('{n} Gerät', '{n} Geräte', res.sent.length) }));
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Senden fehlgeschlagen'), { tone: 'error' });
    }
    sending = false;
  }
</script>

<Page title={t('Benachrichtigungen')}>
  <Group
    title={t('Test')}
    hint={feat.haPush
      ? t('Auf dem iPhone erscheint „Erledigt“ erst, wenn man die Nachricht aufklappt (nach links wischen und „Ansicht“, herunterziehen oder lange drücken).')
      : t('Die Nachrichten kommen über ntfy. Dein Thema trägst du unten ein.')}
  >
    <Row label={t('Test-Nachricht')}>
      <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-40" disabled={sending} onclick={testPush}>
        {t('An mich senden')}
      </button>
    </Row>
    <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={() => openSettings('report')}>
      <Icon name="message" size={20} /><span class="flex-1">{t('Etwas kommt nicht an? Prüfen')}</span><Icon name="chevron-right" size={18} />
    </button>
  </Group>

  {#if loadError}
    <p class="py-6 text-center text-danger">{loadError}</p>
  {:else if !info || !me}
    <p class="py-6 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    <section class="mt-5 space-y-4 rounded-[18px] border border-line bg-surface px-4 py-4" data-testid="my-delivery">
      <PersonDelivery p={me} {info} {run} {busy} canEdit={true} show={{ delivery: true, quiet: true, summary: true, busy: true }} />
    </section>
  {/if}
</Page>
