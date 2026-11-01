<script lang="ts">
  import { onMount } from 'svelte';
  import { api, ApiError, type AccessInfo, type AccessMode, type Account } from '../lib/api';
  import { closeSheet, feat, refresh, toast, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Group from './Group.svelte';
  import Icon from './Icon.svelte';
  import Row from './Row.svelte';
  import Sheet from './Sheet.svelte';

  let info = $state<AccessInfo | null>(null);
  let loadError = $state('');
  let openId = $state<string | null>(null);
  let manualName = $state('');
  let busy = $state(false);

  const admin = $derived(info?.isAdmin ?? false);

  // Eigene Anmeldung (ohne Home Assistant): Konten der Personen
  let accounts = $state<Account[]>([]);
  const accountOf = (userId: string) => accounts.find((a) => a.userId === userId);
  let acctUser = $state('');
  let acctPw = $state('');
  let nuName = $state('');
  let nuUser = $state('');
  let nuPw = $state('');
  let nuAdmin = $state(false);

  async function load() {
    try {
      info = await api.access();
      if (feat.standalone && info.isAdmin) accounts = await api.accounts().catch(() => accounts);
      loadError = '';
    } catch (e) {
      loadError = e instanceof ApiError ? e.message : 'Konnte die Personen nicht laden';
    }
  }
  onMount(load);

  /**
   * Führt eine Änderung aus, lädt danach Liste und Ansicht neu und meldet Fehler als Hinweis.
   * Änderungen laufen nacheinander, damit schnelle Eingaben (z. B. Umbenennen, dann Entfernen) keine verlieren.
   */
  let chain: Promise<void> = Promise.resolve();
  let pendingRuns = 0;
  function run(fn: () => Promise<unknown>): Promise<void> {
    pendingRuns += 1;
    busy = true;
    chain = chain.then(async () => {
      try {
        await fn();
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Etwas ist schiefgelaufen', { tone: 'error' });
      }
      await Promise.all([load(), refresh()]);
      pendingRuns -= 1;
      busy = pendingRuns > 0;
    });
    return chain;
  }

  const setMode = (mode: AccessMode) => run(() => api.setAccessMode(mode));
  const add = (name: string, haUserId: string | null) => run(() => api.addPerson({ name, haUserId }));

  async function addManual(e: Event) {
    e.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    manualName = '';
    await add(name, null);
  }

  function toggleService(id: string, current: string[], service: string, on: boolean) {
    const next = on ? [...current, service] : current.filter((s) => s !== service);
    void run(() => api.updatePerson(id, { notifyServices: next }));
  }

  function rename(id: string, current: string, value: string) {
    const name = value.trim();
    if (name && name !== current) void run(() => api.updatePerson(id, { displayName: name }));
  }

  // Entfernen verlangt eine zweite Bestätigung im Fenster (ein Systemdialog wäre in der App unsicher)
  let confirmRemove = $state<string | null>(null);

  function remove(id: string) {
    confirmRemove = null;
    openId = null;
    void run(() => api.removePerson(id));
  }

  function createAccountFor(userId: string) {
    const username = acctUser.trim();
    const password = acctPw;
    if (!username || !password) return;
    void run(async () => {
      await api.createAccount({ userId, username, password });
      acctUser = acctPw = '';
      toast('Konto angelegt');
    });
  }

  function resetPassword(a: Account) {
    const password = acctPw;
    if (!password) return;
    void run(async () => {
      await api.updateAccount(a.userId, { password });
      acctPw = '';
      toast(`Neues Passwort für ${a.username} gesetzt. Seine Geräte melden sich neu an.`);
    });
  }

  async function addUser(e: Event) {
    e.preventDefault();
    const b = { displayName: nuName.trim(), username: nuUser.trim(), password: nuPw, isAdmin: nuAdmin };
    if (!b.username || !b.password) return;
    await run(async () => {
      await api.createAccount({ ...b, displayName: b.displayName || undefined });
      nuName = nuUser = nuPw = '';
      nuAdmin = false;
    });
  }

  const deviceLabel = (n: number) => (n === 0 ? 'Kein Push-Gerät' : n === 1 ? '1 Push-Gerät' : `${n} Push-Geräte`);
  const canEdit = (id: string) => admin || ui.me?.id === id;
</script>

<Sheet title="Personen &amp; Zugriff" onclose={closeSheet}>
  {#if loadError}
    <p class="py-10 text-center text-danger">{loadError}</p>
  {:else if !info}
    <p class="py-10 text-center text-fg2">Lädt …</p>
  {:else}
    {#if info.managed}
      <p class="mb-3 rounded-2xl bg-surface2 px-4 py-3 text-[15px]" data-testid="managed-note">
        Personen, Push-Geräte und Zugriff werden in der Konfiguration der App in Home Assistant verwaltet
        (Einstellungen › Apps › Stups › Konfiguration). Hier sind sie nur zu sehen. Anzeigename und Ruhezeit lassen sich weiter ändern.
      </p>
    {/if}
    {#if !feat.standalone}
    <Group
      title="Wer darf Stups öffnen?"
      hint={info.mode === 'everyone'
        ? 'Jeder Home-Assistant-Benutzer kann die App öffnen. Zugewiesen und benachrichtigt werden nur die Personen unten.'
        : 'Nur die Personen unten und Administratoren von Home Assistant kommen hinein. Wer sonst öffnet, erscheint unter „Wartet auf Freigabe“.'}
    >
      <Row stack>
        <div class="flex gap-2" role="radiogroup" aria-label="Zugriff">
          {#each [['everyone', 'Alle in Home Assistant'], ['selected', 'Nur diese Personen']] as [mode, label] (mode)}
            <button
              type="button"
              role="radio"
              aria-checked={info.mode === mode}
              disabled={!admin || busy || info.managed}
              class="min-h-11 flex-1 rounded-xl border px-3 text-[15px] disabled:opacity-60 {info.mode === mode
                ? 'border-accent bg-surface2 font-semibold'
                : 'border-line text-fg2'}"
              onclick={() => info && info.mode !== mode && setMode(mode as AccessMode)}
            >
              {label}
            </button>
          {/each}
        </div>
        {#if !admin && !info.managed}<p class="mt-2 text-[13px] text-fg2">Das ändern nur Administratoren von Home Assistant.</p>{/if}
      </Row>
    </Group>
    {/if}

    <Group title="Personen" hint="Diese Personen kann man Karten zuweisen, und sie bekommen die Push-Nachrichten.">
      {#each info.people as p (p.id)}
        <div>
          <button
            type="button"
            class="flex min-h-[56px] w-full items-center gap-3 px-4 text-left"
            aria-expanded={openId === p.id}
            onclick={() => (openId = openId === p.id ? null : p.id)}
          >
            <Avatar person={p} size={32} />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[17px] font-medium">
                {p.displayName}{#if p.id === ui.me?.id}<span class="text-fg2"> (du)</span>{/if}
              </span>
              {#if feat.push}
                <span class="block text-[13px] {p.notifyServices.length ? 'text-fg2' : 'text-danger'}">
                  {deviceLabel(p.notifyServices.length)}{p.isAdmin ? ' · Administrator' : ''}
                </span>
              {:else}
                <span class="block text-[13px] text-fg2">
                  {accountOf(p.id) ? `Benutzername ${accountOf(p.id)?.username}` : 'Ohne Anmeldung'}{p.isAdmin ? ' · Administrator' : ''}
                </span>
              {/if}
            </span>
            <Icon name={openId === p.id ? 'chevron-up' : 'chevron-down'} size={18} />
          </button>

          {#if openId === p.id}
            <div class="space-y-4 px-4 pb-4">
              {#if admin}
                <label class="flex flex-col gap-1.5">
                  <span class="text-[13px] font-semibold text-fg2">Anzeigename</span>
                  <input
                    class="min-h-11 rounded-xl bg-surface2 px-3"
                    value={p.displayName}
                    maxlength="60"
                    aria-label="Anzeigename von {p.displayName}"
                    onblur={(e) => rename(p.id, p.displayName, e.currentTarget.value)}
                  />
                </label>
              {/if}

              {#if feat.standalone && admin}
                {@const acct = accountOf(p.id)}
                <div data-testid="account-{p.id}">
                  <p class="mb-1.5 text-[13px] font-semibold text-fg2">Anmeldung</p>
                  {#if acct}
                    <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
                      <span>Administrator</span>
                      <input
                        type="checkbox"
                        class="h-5 w-5 accent-[var(--accent)]"
                        checked={acct.isAdmin}
                        disabled={busy || acct.userId === ui.me?.id}
                        aria-label="{p.displayName} ist Administrator"
                        onchange={(e) => run(() => api.updateAccount(acct.userId, { isAdmin: e.currentTarget.checked }))}
                      />
                    </label>
                    <div class="mt-1 flex items-center gap-2">
                      <input
                        type="password"
                        bind:value={acctPw}
                        autocomplete="new-password"
                        placeholder="Neues Passwort"
                        aria-label="Neues Passwort für {p.displayName}"
                        class="min-h-11 min-w-0 flex-1 rounded-xl bg-surface2 px-3"
                      />
                      <button type="button" class="min-h-11 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-40" disabled={busy || acctPw.length < 10} onclick={() => resetPassword(acct)}>
                        Setzen
                      </button>
                    </div>
                  {:else}
                    <p class="mb-2 text-[13px] text-fg2">{p.displayName} hat noch keine Anmeldung (wird nur zugewiesen).</p>
                    <div class="flex flex-col gap-2">
                      <input bind:value={acctUser} autocomplete="off" autocapitalize="none" placeholder="Benutzername" aria-label="Benutzername für {p.displayName}" class="min-h-11 rounded-xl bg-surface2 px-3" />
                      <input type="password" bind:value={acctPw} autocomplete="new-password" placeholder="Passwort (mindestens 10 Zeichen)" aria-label="Passwort für {p.displayName}" class="min-h-11 rounded-xl bg-surface2 px-3" />
                      <button type="button" class="min-h-11 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-40" disabled={busy || !acctUser.trim() || acctPw.length < 10} onclick={() => createAccountFor(p.id)}>
                        Anmeldung anlegen
                      </button>
                    </div>
                  {/if}
                </div>
              {/if}

              {#if feat.push}
              <div>
                <p class="mb-1.5 text-[13px] font-semibold text-fg2">Push-Geräte (Companion App)</p>
                {#if info.managed}
                  {#each p.notifyServices as s (s)}
                    {@const missing = info.services !== null && !info.services.includes(s)}
                    <p class="flex min-h-9 items-center gap-3 text-[15px]">
                      <span class="min-w-0 flex-1 truncate">{s.replace(/^mobile_app_/, '')}</span>
                      {#if missing}<span class="text-[13px] text-danger">gibt es nicht</span>{/if}
                    </p>
                  {:else}
                    <p class="text-[15px] text-danger">Kein Gerät in der Konfiguration eingetragen.</p>
                  {/each}
                {:else if !canEdit(p.id)}
                  <p class="text-[15px] text-fg2">Die Geräte wählt {p.displayName} selbst oder ein Administrator.</p>
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
                      {#if missing}<span class="text-[13px] text-danger">gibt es nicht mehr</span>{/if}
                    </label>
                  {:else}
                    <p class="text-[15px] text-fg2">
                      Home Assistant meldet keine Geräte. Die Companion App muss auf dem Handy angemeldet sein.
                    </p>
                  {/each}
                {/if}
              </div>
              {/if}

              {#if canEdit(p.id)}
                <div>
                  <p class="mb-1.5 text-[13px] font-semibold text-fg2">Ruhezeit für Stupse</p>
                  <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
                    <span>Stupse in der Ruhezeit erst danach zustellen</span>
                    <input
                      type="checkbox"
                      class="h-5 w-5 accent-[var(--accent)]"
                      checked={!p.nudgeQuiet.off}
                      disabled={busy}
                      aria-label="Ruhezeit für Stupse von {p.displayName}"
                      onchange={(e) => run(() => api.updatePerson(p.id, { quietOff: !e.currentTarget.checked }))}
                    />
                  </label>
                  {#if !p.nudgeQuiet.off}
                    <div class="mt-1 flex items-center gap-2 text-[15px]">
                      <input
                        type="time"
                        class="min-h-11 rounded-xl bg-surface2 px-3"
                        value={p.nudgeQuiet.start}
                        aria-label="Beginn der Ruhezeit von {p.displayName}"
                        onchange={(e) => e.currentTarget.value && run(() => api.updatePerson(p.id, { quietStart: e.currentTarget.value }))}
                      />
                      <span>bis</span>
                      <input
                        type="time"
                        class="min-h-11 rounded-xl bg-surface2 px-3"
                        value={p.nudgeQuiet.end}
                        aria-label="Ende der Ruhezeit von {p.displayName}"
                        onchange={(e) => e.currentTarget.value && run(() => api.updatePerson(p.id, { quietEnd: e.currentTarget.value }))}
                      />
                    </div>
                  {/if}
                </div>
              {/if}

              {#if admin && !info.managed}
                {#if confirmRemove === p.id}
                  <p class="text-[13px] text-fg2">Zugewiesene Karten behalten die Zuweisung, falls {p.displayName} zurückkommt.</p>
                  <div class="flex gap-2">
                    <button type="button" class="min-h-11 flex-1 rounded-xl bg-danger-bg font-semibold text-danger" disabled={busy} onclick={() => remove(p.id)}>
                      Ja, entfernen
                    </button>
                    <button type="button" class="min-h-11 flex-1 rounded-xl bg-surface2 font-semibold" onclick={() => (confirmRemove = null)}>Abbrechen</button>
                  </div>
                {:else}
                  <button type="button" class="min-h-11 text-[15px] font-semibold text-danger" disabled={busy} onclick={() => (confirmRemove = p.id)}>
                    Aus Stups entfernen
                  </button>
                {/if}
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <p class="px-4 py-4 text-[15px] text-fg2">Noch niemand. {admin && !info.managed ? 'Füge unten Personen hinzu.' : ''}</p>
      {/each}
    </Group>

    {#if admin && feat.standalone}
      <Group title="Benutzer anlegen" hint="Wer sich anmelden soll. Das Passwort sagst du der Person selbst, sie kann es danach unter Einstellungen ändern.">
        <form onsubmit={addUser} class="flex flex-col gap-2 px-4 py-3" aria-label="Benutzer anlegen">
          <input bind:value={nuName} maxlength="60" placeholder="Name in Stups (zum Beispiel Anna)" aria-label="Name der neuen Person" class="min-h-11 rounded-xl bg-surface2 px-3" />
          <input bind:value={nuUser} autocomplete="off" autocapitalize="none" placeholder="Benutzername" aria-label="Benutzername" class="min-h-11 rounded-xl bg-surface2 px-3" />
          <input type="password" bind:value={nuPw} autocomplete="new-password" placeholder="Passwort (mindestens 10 Zeichen)" aria-label="Passwort" class="min-h-11 rounded-xl bg-surface2 px-3" />
          <label class="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" class="h-5 w-5 accent-[var(--accent)]" bind:checked={nuAdmin} />Administrator
          </label>
          <button class="min-h-11 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-40" disabled={busy || !nuUser.trim() || nuPw.length < 10}>Benutzer anlegen</button>
        </form>
      </Group>
      <Group title="Person ohne Anmeldung" hint="Zum Zuweisen von Karten, zum Beispiel für Kinder, die Stups nicht selbst öffnen.">
        <form onsubmit={addManual} class="flex items-center gap-2 px-4 py-2">
          <input bind:value={manualName} maxlength="60" placeholder="Name" enterkeyhint="done" class="min-h-11 min-w-0 flex-1 rounded-xl bg-surface2 px-3" aria-label="Name der Person ohne Anmeldung" />
          <button class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-40" disabled={busy || !manualName.trim()}>Hinzufügen</button>
        </form>
      </Group>
    {:else if admin && !info.managed}
      {#if info.pending.length}
        <Group title="Wartet auf Freigabe" hint="Diese Benutzer haben Stups geöffnet, sind aber keine Person.">
          {#each info.pending as u (u.id)}
            <Row label={u.displayName}>
              <button
                class="min-h-10 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-60"
                disabled={busy}
                onclick={() => add(u.displayName, u.haUserId)}
              >
                Freigeben
              </button>
            </Row>
          {/each}
        </Group>
      {/if}

      <Group
        title="Person hinzufügen"
        hint={info.directoryAvailable === false
          ? 'Home Assistant liefert die Personenliste gerade nicht. Der Name muss zum Benutzernamen oder Anzeigenamen in Home Assistant passen.'
          : 'Personen aus Home Assistant (Einstellungen › Personen). Wer noch nie angemeldet war, wird beim ersten Öffnen verknüpft.'}
      >
        {#each info.haPersons as hp (hp.userId ?? hp.name)}
          <Row label={hp.name}>
            <button
              class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-60"
              disabled={busy}
              onclick={() => add(hp.name, hp.userId)}
            >
              Hinzufügen
            </button>
          </Row>
        {/each}
        <form onsubmit={addManual} class="flex items-center gap-2 px-4 py-2">
          <input
            bind:value={manualName}
            maxlength="60"
            placeholder="Anderen Namen eintragen"
            enterkeyhint="done"
            class="min-h-11 min-w-0 flex-1 rounded-xl bg-surface2 px-3"
            aria-label="Name der neuen Person"
          />
          <button class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-40" disabled={busy || !manualName.trim()}>
            Hinzufügen
          </button>
        </form>
      </Group>
    {/if}
  {/if}
</Sheet>
