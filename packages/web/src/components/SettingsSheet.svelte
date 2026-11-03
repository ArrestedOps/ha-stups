<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, type PushStatus } from '../lib/api';
  import { applyHeaderHiding, isHeaderHidingWanted, setHeaderHidingWanted, showHaHeader } from '../lib/hideHaHeader';
  import { houseResultLabel } from '../lib/house';
import { type LanguageChoice, numberLocale, t, tn } from '../lib/i18n/index.svelte';
  import { act, changeLanguage, closeSheet, feat, logout, openSheet, selectTab, toast, ui } from '../lib/store.svelte';
  import AccentPicker from './AccentPicker.svelte';
  import BetaSettings from './BetaSettings.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import PasskeySettings from './PasskeySettings.svelte';
  import Row from './Row.svelte';
  import SelectField from './SelectField.svelte';
  import Sheet from './Sheet.svelte';

  // Die Wächter hält der Store (Reiter „Wächter"); hier nur die Zahl
  const watchers = $derived(ui.watchers);

  let headerHidden = $state(isHeaderHidingWanted());
  let dashboards = $state<{ title: string; path: string }[]>([]);
  let loaded = $state(false);
  let custom = $state('');
  let sending = $state(false);

  const CUSTOM = '__custom__';
  const effective = $derived(ui.settings?.effectiveDashboardPath ?? '/');
  const known = $derived(dashboards.some((d) => d.path === effective));
  const selected = $derived(known ? effective : CUSTOM);

  onMount(async () => {
    dashboards = await api.dashboards().catch(() => []);
    custom = known ? '' : effective;
    loaded = true;
  });

  async function save(path: string | null) {
    const settings = await act(() => api.saveSettings({ dashboardPath: path }));
    if (settings) ui.settings = settings;
  }

  async function saveDefaultTime(value: string) {
    // Ein geleertes Feld stellt die Vorgabe (09:00) wieder her
    const settings = await act(() => api.saveSettings({ defaultDueTime: value === '' ? null : value }));
    if (settings) ui.settings = settings;
  }

  function onSelect(value: string) {
    if (value === CUSTOM) {
      custom = effective;
      return;
    }
    void save(value);
  }

  async function saveCustom(e: Event) {
    e.preventDefault();
    const p = custom.trim();
    if (!p.startsWith('/')) {
      toast(t('Der Pfad muss mit / beginnen, zum Beispiel /dashboard-handy/start'), { tone: 'error' });
      return;
    }
    await save(p);
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

  let changingPassword = $state(false);
  let pwCurrent = $state('');
  let pwNext = $state('');
  let pwRepeat = $state('');
  let pwBusy = $state(false);
  async function savePassword(e: Event) {
    e.preventDefault();
    if (pwNext !== pwRepeat) {
      toast(t('Die beiden neuen Passwörter sind nicht gleich'), { tone: 'error' });
      return;
    }
    pwBusy = true;
    try {
      await api.changePassword(pwCurrent, pwNext);
      toast(t('Passwort geändert. Andere Geräte melden sich neu an.'));
      changingPassword = false;
      pwCurrent = pwNext = pwRepeat = '';
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('Passwort konnte nicht geändert werden'), { tone: 'error' });
    }
    pwBusy = false;
  }

  let exporting = $state(false);
  async function exportData() {
    exporting = true;
    try {
      const res = await api.exportData();
      toast(t('Exportiert nach {dir} ({size} MB{files})', { dir: res.dir, size: (res.bytes / 1024 / 1024).toFixed(1), files: res.files ? t(', mit Anhängen') : '' }));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('Export fehlgeschlagen'), { tone: 'error' });
    }
    exporting = false;
  }

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

  const yaml = $derived(`type: custom:bubble-card
card_type: button
button_type: name
name: Stups
icon: mdi:view-column
tap_action:
  action: navigate
  navigation_path: ${ui.settings?.panelPath ?? '/<panel-pfad>'}`);

  async function copyYaml() {
    try {
      await navigator.clipboard.writeText(yaml);
      toast(t('YAML kopiert'));
    } catch {
      toast(t('Kopieren nicht möglich, bitte den Text markieren'), { tone: 'error' });
    }
  }
</script>

<Sheet title={t('Einstellungen')} onclose={closeSheet}>
  {#if feat.beta}<BetaSettings />{/if}
  <Group title={t('Sprache')} hint={t('Gilt auf allen deinen Geräten und für Push-Nachrichten. „Automatisch“ folgt der Sprache des Geräts.')}>
    <Row label={t('Sprache')}>
      <SelectField label={t('Sprache')} value={ui.me?.languageChoice ?? 'auto'} onchange={(e) => void changeLanguage(e.currentTarget.value as LanguageChoice)}>
        <option value="auto">{t('Automatisch')}</option>
        <option value="de">Deutsch</option>
        <option value="en">English</option>
      </SelectField>
    </Row>
  </Group>
  <Group title={t('Farbe')} hint={t('Die Farbe der Knöpfe und Reiter. Gilt auf allen deinen Geräten, jede Person wählt ihre eigene.')}>
    <AccentPicker />
  </Group>
  <Group title={t('Personen')} hint={t('Wer Stups nutzen darf, wer Karten zugewiesen bekommt und auf welchen Geräten die Push-Nachrichten ankommen.')}>
    <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={() => openSheet({ type: 'people' })}>
      <Icon name="user" size={20} /><span class="flex-1">{t('Personen & Zugriff')}</span><Icon name="chevron-right" size={18} />
    </button>
  </Group>

  <Group title={t('Vorgaben')} hint={t('Gilt für alle: Schreibst du beim Anlegen einer Karte nur ein Datum („morgen“) ohne Uhrzeit, bekommt der Termin diese Uhrzeit. Nur Administratoren ändern sie.')}>
    <Row label={t('Standard-Uhrzeit für Termine')}>
      <input
        type="time"
        class="min-h-10 rounded-xl bg-surface2 px-3 disabled:opacity-60"
        value={ui.settings?.defaultDueTime ?? '09:00'}
        disabled={!ui.isAdmin}
        aria-label={t('Standard-Uhrzeit für Termine')}
        onchange={(e) => void saveDefaultTime(e.currentTarget.value)}
      />
    </Row>
  </Group>

  {#if feat.standalone}
    <Group title={t('Konto')} hint={t('Wenn du dein Passwort änderst, melden sich deine anderen Geräte ab.')}>
      <Row label={t('Angemeldet als')}><span class="text-fg2">{ui.me?.displayName ?? '—'}</span></Row>
      {#if changingPassword}
        <form onsubmit={savePassword} class="space-y-2 px-4 py-3" aria-label={t('Passwort ändern')}>
          <input type="password" bind:value={pwCurrent} autocomplete="current-password" placeholder={t('Aktuelles Passwort')} aria-label={t('Aktuelles Passwort')} class="min-h-11 w-full rounded-xl bg-surface2 px-3" required />
          <input type="password" bind:value={pwNext} autocomplete="new-password" placeholder={t('Neues Passwort (mindestens 10 Zeichen)')} aria-label={t('Neues Passwort')} minlength="10" class="min-h-11 w-full rounded-xl bg-surface2 px-3" required />
          <input type="password" bind:value={pwRepeat} autocomplete="new-password" placeholder={t('Neues Passwort wiederholen')} aria-label={t('Neues Passwort wiederholen')} class="min-h-11 w-full rounded-xl bg-surface2 px-3" required />
          <div class="flex gap-2">
            <button class="min-h-11 flex-1 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-60" disabled={pwBusy}>{t('Speichern')}</button>
            <button type="button" class="min-h-11 flex-1 rounded-xl bg-surface2 font-semibold" onclick={() => (changingPassword = false)}>{t('Abbrechen')}</button>
          </div>
        </form>
      {:else}
        <Row label={t('Passwort')}>
          <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold" onclick={() => (changingPassword = true)}>{t('Ändern')}</button>
        </Row>
      {/if}
      <Row label={t('Auf diesem Gerät')}>
        <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold text-danger" onclick={() => void logout()}>{t('Abmelden')}</button>
      </Row>
    </Group>
    {#if feat.passkeys}<PasskeySettings />{/if}
  {/if}

  {#if feat.haUi}
  <Group
    title={t('Zurück zum Dashboard')}
    hint={ui.isAdmin
      ? t('Dieses Dashboard öffnet der Button „‹ Dashboard“ oben links. Die Wahl gilt für alle gemeinsam.')
      : t('Dieses Dashboard öffnet der Button „‹ Dashboard“ oben links. Die Wahl gilt für alle und ist Administratoren von Home Assistant vorbehalten.')}
  >
    <Row label="Dashboard">
      <SelectField value={selected} disabled={!loaded || !ui.isAdmin} label="Dashboard" onchange={(e) => onSelect(e.currentTarget.value)}>
        {#each dashboards as d (d.path)}<option value={d.path}>{d.title}</option>{/each}
        <option value={CUSTOM}>{t('Eigener Pfad …')}</option>
      </SelectField>
    </Row>
    {#if selected === CUSTOM && ui.isAdmin}
      <form onsubmit={saveCustom} class="flex items-center gap-2 px-4 py-2">
        <input bind:value={custom} placeholder="/dashboard-handy/start" class="min-h-11 min-w-0 flex-1 rounded-xl bg-surface2 px-3" aria-label={t('Eigener Pfad')} />
        <button class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent">{t('Speichern')}</button>
      </form>
    {/if}
  </Group>
  {/if}

  {#if feat.haUi}
  <Group title={t('Darstellung')} hint={t('Blendet die Kopfzeile von Home Assistant (Titel und Menü) über der App aus. Falls die App danach falsch aussieht, hier wieder ausschalten.')}>
    <Row label={t('HA-Kopfzeile ausblenden')}>
      <input
        type="checkbox"
        class="h-6 w-6 accent-[var(--accent)]"
        checked={headerHidden}
        aria-label={t('Kopfzeile von Home Assistant ausblenden')}
        onchange={(e) => {
          headerHidden = e.currentTarget.checked;
          setHeaderHidingWanted(headerHidden);
          if (headerHidden) applyHeaderHiding();
          else showHaHeader();
        }}
      />
    </Row>
  </Group>
  {/if}

  {#if feat.watchers}
  <Group title={t('Wächter')} hint={t('Karten, die von selbst aus Home Assistant entstehen, zum Beispiel wenn die Waschmaschine fertig ist.')}>
    <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={() => selectTab('watchers')}>
      <Icon name="eye" size={20} />
      <span class="flex-1">{t('Wächter')}{watchers && watchers.items.length ? ` (${t('{n} aktiv', { n: watchers.items.filter((w) => w.active).length })})` : ''}</span>
      <Icon name="chevron-right" size={18} />
    </button>
  </Group>
  {/if}

  {#if feat.push}
  <Group
    title={t('Benachrichtigungen')}
    hint={feat.haPush
      ? t('Auf dem iPhone erscheint „Erledigt“ erst, wenn man die Nachricht aufklappt (nach links wischen und „Ansicht“, herunterziehen oder lange drücken).')
      : t('Die Nachrichten kommen über ntfy. Dein Thema trägst du unter Personen & Zugriff ein.')}
  >
    <Row label={t('Test-Nachricht')}>
      <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-40" disabled={sending} onclick={testPush}>
        {t('An mich senden')}
      </button>
    </Row>
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
  {/if}

  {#if feat.haUi}
  <Group title={t('Dashboard-Button (Bubble Card)')}>
    <Row stack>
      <pre class="overflow-x-auto rounded-xl bg-surface2 p-3 text-[13px] leading-relaxed">{yaml}</pre>
      <button class="mt-2 min-h-10 rounded-xl bg-surface2 px-4 font-semibold" onclick={copyYaml}>{t('Kopieren')}</button>
    </Row>
  </Group>
  {/if}

  {#if ui.isAdmin && feat.migration}
    <Group
      title={t('Umzug')}
      hint={t('Zieht Stups in Home Assistant auf eine andere Adresse um (zum Beispiel aus einem neuen Repository), kommen die Daten über diesen Export mit: Er legt Datenbank und Anhänge in /share/stups-umzug ab, die neue App übernimmt sie beim ersten Start.')}
    >
      <Row label={t('Daten exportieren')}>
        <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-40" disabled={exporting} onclick={exportData}>
          {exporting ? t('Exportiere …') : t('Nach /share')}
        </button>
      </Row>
    </Group>
  {/if}

  {#if !feat.standalone}
    <p class="mt-5 px-3 text-center text-[13px] text-fg2">
      {t('Angemeldet als {name}', { name: ui.me?.displayName ?? '—' })}
      {#if feat.haUi}· <a class="text-accent-text" href="diagnose.html">{t('Diagnose-Seite')}</a>{/if}
    </p>
  {/if}
</Sheet>
