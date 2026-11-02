<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, type PushStatus } from '../lib/api';
  import { applyHeaderHiding, isHeaderHidingWanted, setHeaderHidingWanted, showHaHeader } from '../lib/hideHaHeader';
  import { act, closeSheet, feat, logout, openSheet, selectTab, toast, ui } from '../lib/store.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import Row from './Row.svelte';
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
      toast('Der Pfad muss mit / beginnen, zum Beispiel /dashboard-handy/start', { tone: 'error' });
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
        toast(feat.ntfy ? 'Test-Nachricht gesendet. Tippe auf „Rückweg prüfen“ und danach unten auf „Stand anzeigen“.' : 'Test-Nachricht gesendet.');
      } else {
        const res = await api.testPush(ui.me.name);
        toast(`Test-Nachricht gesendet (${res.sent.length} ${res.sent.length === 1 ? 'Gerät' : 'Geräte'}). Zum Erledigen die Nachricht aufklappen.`);
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Senden fehlgeschlagen', { tone: 'error' });
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
      toast('Die beiden neuen Passwörter sind nicht gleich', { tone: 'error' });
      return;
    }
    pwBusy = true;
    try {
      await api.changePassword(pwCurrent, pwNext);
      toast('Passwort geändert. Andere Geräte melden sich neu an.');
      changingPassword = false;
      pwCurrent = pwNext = pwRepeat = '';
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Passwort konnte nicht geändert werden', { tone: 'error' });
    }
    pwBusy = false;
  }

  let exporting = $state(false);
  async function exportData() {
    exporting = true;
    try {
      const res = await api.exportData();
      toast(`Exportiert nach ${res.dir} (${(res.bytes / 1024 / 1024).toFixed(1)} MB${res.files ? ', mit Anhängen' : ''})`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Export fehlgeschlagen', { tone: 'error' });
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
      statusError = e instanceof ApiError ? e.message : 'Konnte den Stand nicht laden';
    }
  }
  const kindLabel = { due: 'Fällig', reminder: 'Vorab', nag: 'Nachhaken', summary: 'Zusammenfassung' } as const;
  const statusLabel = { sent: 'gesendet', skipped: 'übersprungen', failed: 'fehlgeschlagen' } as const;
  const clock = (iso: string) =>
    new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

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
      toast('YAML kopiert');
    } catch {
      toast('Kopieren nicht möglich, bitte den Text markieren', { tone: 'error' });
    }
  }
</script>

<Sheet title="Einstellungen" onclose={closeSheet}>
  <Group title="Personen" hint="Wer Stups nutzen darf, wer Karten zugewiesen bekommt und auf welchen Geräten die Push-Nachrichten ankommen.">
    <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={() => openSheet({ type: 'people' })}>
      <Icon name="user" size={20} /><span class="flex-1">Personen &amp; Zugriff</span><Icon name="chevron-right" size={18} />
    </button>
  </Group>

  {#if feat.standalone}
    <Group title="Konto" hint="Wenn du dein Passwort änderst, melden sich deine anderen Geräte ab.">
      <Row label="Angemeldet als"><span class="text-fg2">{ui.me?.displayName ?? '—'}</span></Row>
      {#if changingPassword}
        <form onsubmit={savePassword} class="space-y-2 px-4 py-3" aria-label="Passwort ändern">
          <input type="password" bind:value={pwCurrent} autocomplete="current-password" placeholder="Aktuelles Passwort" aria-label="Aktuelles Passwort" class="min-h-11 w-full rounded-xl bg-surface2 px-3" required />
          <input type="password" bind:value={pwNext} autocomplete="new-password" placeholder="Neues Passwort (mindestens 10 Zeichen)" aria-label="Neues Passwort" minlength="10" class="min-h-11 w-full rounded-xl bg-surface2 px-3" required />
          <input type="password" bind:value={pwRepeat} autocomplete="new-password" placeholder="Neues Passwort wiederholen" aria-label="Neues Passwort wiederholen" class="min-h-11 w-full rounded-xl bg-surface2 px-3" required />
          <div class="flex gap-2">
            <button class="min-h-11 flex-1 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-60" disabled={pwBusy}>Speichern</button>
            <button type="button" class="min-h-11 flex-1 rounded-xl bg-surface2 font-semibold" onclick={() => (changingPassword = false)}>Abbrechen</button>
          </div>
        </form>
      {:else}
        <Row label="Passwort">
          <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold" onclick={() => (changingPassword = true)}>Ändern</button>
        </Row>
      {/if}
      <Row label="Auf diesem Gerät">
        <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold text-danger" onclick={() => void logout()}>Abmelden</button>
      </Row>
    </Group>
  {/if}

  {#if feat.haUi}
  <Group
    title="Zurück zum Dashboard"
    hint={ui.isAdmin
      ? 'Dieses Dashboard öffnet der Button „‹ Dashboard“ oben links. Die Wahl gilt für alle gemeinsam.'
      : 'Dieses Dashboard öffnet der Button „‹ Dashboard“ oben links. Die Wahl gilt für alle und ist Administratoren von Home Assistant vorbehalten.'}
  >
    <Row label="Dashboard">
      <select
        class="min-h-10 max-w-[220px] rounded-xl bg-transparent text-right text-fg2"
        value={selected}
        disabled={!loaded || !ui.isAdmin}
        aria-label="Dashboard"
        onchange={(e) => onSelect(e.currentTarget.value)}
      >
        {#each dashboards as d (d.path)}<option value={d.path}>{d.title}</option>{/each}
        <option value={CUSTOM}>Eigener Pfad …</option>
      </select>
    </Row>
    {#if selected === CUSTOM && ui.isAdmin}
      <form onsubmit={saveCustom} class="flex items-center gap-2 px-4 py-2">
        <input bind:value={custom} placeholder="/dashboard-handy/start" class="min-h-11 min-w-0 flex-1 rounded-xl bg-surface2 px-3" aria-label="Eigener Pfad" />
        <button class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent">Speichern</button>
      </form>
    {/if}
  </Group>
  {/if}

  {#if feat.haUi}
  <Group title="Darstellung" hint="Blendet die Kopfzeile von Home Assistant (Titel und Menü) über der App aus. Falls die App danach falsch aussieht, hier wieder ausschalten.">
    <Row label="HA-Kopfzeile ausblenden">
      <input
        type="checkbox"
        class="h-6 w-6 accent-[var(--accent)]"
        checked={headerHidden}
        aria-label="Kopfzeile von Home Assistant ausblenden"
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
  <Group title="Wächter" hint="Karten, die von selbst aus Home Assistant entstehen, zum Beispiel wenn die Waschmaschine fertig ist.">
    <button class="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[17px]" onclick={() => selectTab('watchers')}>
      <Icon name="eye" size={20} />
      <span class="flex-1">Wächter{watchers && watchers.items.length ? ` (${watchers.items.filter((w) => w.active).length} aktiv)` : ''}</span>
      <Icon name="chevron-right" size={18} />
    </button>
  </Group>
  {/if}

  {#if feat.push}
  <Group
    title="Benachrichtigungen"
    hint={feat.haPush
      ? 'Auf dem iPhone erscheint „Erledigt“ erst, wenn man die Nachricht aufklappt (nach links wischen und „Ansicht“, herunterziehen oder lange drücken).'
      : 'Die Nachrichten kommen über ntfy. Dein Thema trägst du unter Personen & Zugriff ein.'}
  >
    <Row label="Test-Nachricht">
      <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-40" disabled={sending} onclick={testPush}>
        An mich senden
      </button>
    </Row>
    <Row label="Warum kommt nichts?">
      <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold" onclick={showStatus}>Stand anzeigen</button>
    </Row>
    {#if statusError}
      <Row stack><p class="text-danger">{statusError}</p></Row>
    {/if}
    {#if status}
      <Row stack>
        <div class="space-y-3 text-[15px]">
          <div>
            <p class="font-semibold">Nächste Karten mit Termin</p>
            {#each status.upcoming as c (c.title + c.dueAt)}
              <p class="mt-1">
                {c.title} · {clock(c.dueAt)} · {c.assignees.length ? c.assignees.join(', ') : 'niemand'}
                {#if c.note}<span class="block text-[13px] text-danger">{c.note}</span>{/if}
              </p>
            {:else}
              <p class="mt-1 text-fg2">Keine offene Karte mit Termin.</p>
            {/each}
          </div>
          {#if feat.haPush}
          <div>
            <p class="font-semibold">Notify-Dienste</p>
            {#each status.people as p (p.name)}
              <p class="mt-1">
                {p.name}:
                {#each p.services as s (s.service)}
                  <span class="block text-[13px] {s.exists === false ? 'text-danger' : 'text-fg2'}">
                    {s.service}{s.exists === false ? ' (gibt es in Home Assistant nicht)' : ''}
                  </span>
                {:else}
                  <span class="text-danger">kein Dienst eingetragen</span>
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
                  {p.name}: <span class={p.ntfy ? 'text-fg2' : 'text-danger'}>{p.ntfy ? 'Thema eingetragen' : 'kein Thema eingetragen'}</span>
                </p>
              {/each}
              <p class="mt-1 text-[13px] {status.ntfy.buttons ? 'text-fg2' : 'text-danger'}">
                {#if !status.ntfy.buttons}
                  STUPS_PUBLIC_URL fehlt: keine Knöpfe und kein Link in den Nachrichten.
                {:else if status.ntfy.roundTrip}
                  Rückweg der Knöpfe zuletzt geprüft: {clock(status.ntfy.roundTrip)}
                {:else}
                  Rückweg der Knöpfe seit dem Start nicht geprüft (Test-Nachricht senden und auf „Rückweg prüfen“ tippen).
                {/if}
              </p>
            </div>
          {/if}
          <div>
            <p class="font-semibold">Zuletzt</p>
            {#each status.recent as r, i (i)}
              <p class="mt-1">
                {r.title} · {kindLabel[r.kind]} · {r.user} · {statusLabel[r.status]}
                <span class="block text-[13px] text-fg2">{clock(r.at)}</span>
              </p>
            {:else}
              <p class="mt-1 text-fg2">Noch nichts gesendet.</p>
            {/each}
          </div>
          <div>
            <p class="font-semibold">Stupse</p>
            {#each status.nudges as n, i (i)}
              <p class="mt-1">
                {n.title} · {n.from} → {n.to} · {n.state}
                <span class="block text-[13px] text-fg2">
                  {clock(n.at)}{n.state === 'wartet' ? ` · wird ${clock(n.deliverAt)} zugestellt (Ende der Ruhezeit)` : ''}
                </span>
              </p>
            {:else}
              <p class="mt-1 text-fg2">Noch kein Stups.</p>
            {/each}
          </div>
        </div>
      </Row>
    {/if}
  </Group>
  {/if}

  {#if feat.haUi}
  <Group title="Dashboard-Button (Bubble Card)">
    <Row stack>
      <pre class="overflow-x-auto rounded-xl bg-surface2 p-3 text-[13px] leading-relaxed">{yaml}</pre>
      <button class="mt-2 min-h-10 rounded-xl bg-surface2 px-4 font-semibold" onclick={copyYaml}>Kopieren</button>
    </Row>
  </Group>
  {/if}

  {#if ui.isAdmin && feat.migration}
    <Group
      title="Umzug"
      hint="Zieht Stups in Home Assistant auf eine andere Adresse um (zum Beispiel aus einem neuen Repository), kommen die Daten über diesen Export mit: Er legt Datenbank und Anhänge in /share/stups-umzug ab, die neue App übernimmt sie beim ersten Start."
    >
      <Row label="Daten exportieren">
        <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-40" disabled={exporting} onclick={exportData}>
          {exporting ? 'Exportiere …' : 'Nach /share'}
        </button>
      </Row>
    </Group>
  {/if}

  {#if !feat.standalone}
    <p class="mt-5 px-3 text-center text-[13px] text-fg2">
      Angemeldet als {ui.me?.displayName ?? '—'}
      {#if feat.haUi}· <a class="text-accent-text" href="diagnose.html">Diagnose-Seite</a>{/if}
    </p>
  {/if}
</Sheet>
