<script lang="ts">
  import { t, tn } from '../lib/i18n/index.svelte';
  import { onMount } from 'svelte';
  import { api, ApiError, type AccessInfo, type AccessMode, type Account, type HouseEntities, type HouseInfo } from '../lib/api';
  import { closeSheet, feat, openSettings, refresh, toast, ui } from '../lib/store.svelte';
  import Avatar from './Avatar.svelte';
  import Group from './Group.svelte';
  import HouseChannels from './HouseChannels.svelte';
  import PersonDelivery from './PersonDelivery.svelte';
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

  // Haus-Kanäle (nur Administratoren, nur mit Home Assistant): Kanäle und die Auswahl an Lautsprechern, Lampen und Sprachdiensten
  let house = $state<HouseInfo | null>(null);
  let entities = $state<HouseEntities | null>(null);

  async function load() {
    try {
      info = await api.access();
      if (feat.standalone && info.isAdmin) accounts = await api.accounts().catch(() => accounts);
      if (feat.house && info.isAdmin) {
        house = await api.houseChannels().catch(() => house);
        if (!entities) entities = await api.houseEntities().catch(() => null);
      }
      loadError = '';
    } catch (e) {
      loadError = e instanceof ApiError ? e.message : t('Konnte die Personen nicht laden');
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
        toast(e instanceof ApiError ? e.message : t('Etwas ist schiefgelaufen'), { tone: 'error' });
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
      toast(t('Konto angelegt'));
    });
  }

  function resetPassword(a: Account) {
    const password = acctPw;
    if (!password) return;
    void run(async () => {
      await api.updateAccount(a.userId, { password });
      acctPw = '';
      toast(t('Neues Passwort für {name} gesetzt. Seine Geräte melden sich neu an.', { name: a.username }));
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

  const deviceLabel = (n: number) => (n === 0 ? t('Kein Push-Gerät') : tn('{n} Push-Gerät', '{n} Push-Geräte', n));
  const pushLabel = (p: { notifyServices: string[]; ntfy: boolean }) => {
    const ha = feat.haPush ? p.notifyServices.length : 0;
    if (feat.ntfy && p.ntfy) return ha > 0 ? t('{devices} und ntfy', { devices: deviceLabel(ha) }) : t('Push über ntfy');
    return deviceLabel(ha);
  };
  const hasPush = (p: { notifyServices: string[]; ntfy: boolean }) => (feat.haPush && p.notifyServices.length > 0) || (feat.ntfy && p.ntfy);
  const canEdit = (id: string) => admin || ui.me?.id === id;

</script>

<Sheet title={t('Personen & Zugriff')} onclose={closeSheet}>
  {#snippet left()}
    <button class="flex min-h-11 items-center pr-3 pl-1 text-[17px] text-accent-text" onclick={() => openSettings()} aria-label={t('Zurück zu den Einstellungen')}>
      <Icon name="chevron-left" size={24} stroke={2.6} />{t('Einstellungen')}
    </button>
  {/snippet}
  {#if loadError}
    <p class="py-10 text-center text-danger">{loadError}</p>
  {:else if !info}
    <p class="py-10 text-center text-fg2">{t('Lädt …')}</p>
  {:else}
    {#if info.managed}
      <p class="mb-3 rounded-2xl bg-surface2 px-4 py-3 text-[15px]" data-testid="managed-note">
        {t('Personen, Push-Geräte und Zugriff werden in der Konfiguration der App in Home Assistant verwaltet (Einstellungen › Apps › Stups › Konfiguration). Hier sind sie nur zu sehen. Anzeigename und Ruhezeit lassen sich weiter ändern.')}
      </p>
    {/if}
    {#if !feat.standalone}
    <Group
      title={t('Wer darf Stups öffnen?')}
      hint={info.mode === 'everyone'
        ? t('Jeder Home-Assistant-Benutzer kann die App öffnen. Zugewiesen und benachrichtigt werden nur die Personen unten.')
        : t('Nur die Personen unten und Administratoren von Home Assistant kommen hinein. Wer sonst öffnet, erscheint unter „Wartet auf Freigabe“.')}
    >
      <Row stack>
        <div class="flex gap-2" role="radiogroup" aria-label={t('Zugriff')}>
          {#each [['everyone', t('Alle in Home Assistant')], ['selected', t('Nur diese Personen')]] as [mode, label] (mode)}
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
        {#if !admin && !info.managed}<p class="mt-2 text-[13px] text-fg2">{t('Das ändern nur Administratoren von Home Assistant.')}</p>{/if}
      </Row>
    </Group>
    {/if}

    <Group title={t('Personen')} hint={t('Diese Personen kann man Karten zuweisen, und sie bekommen die Push-Nachrichten.')}>
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
                {p.displayName}{#if p.id === ui.me?.id}<span class="text-fg2"> ({t('du')})</span>{/if}
              </span>
              {#if feat.standalone}
                <span class="block text-[13px] text-fg2">
                  {accountOf(p.id) ? t('Benutzername {name}', { name: accountOf(p.id)?.username ?? '' }) : t('Ohne Anmeldung')}{p.isAdmin ? ` · ${t('Administrator')}` : ''}
                </span>
              {/if}
              {#if feat.push}
                <span class="block text-[13px] {hasPush(p) ? 'text-fg2' : 'text-danger'}">
                  {pushLabel(p)}{p.isAdmin && !feat.standalone ? ` · ${t('Administrator')}` : ''}
                </span>
              {/if}
            </span>
            <Icon name={openId === p.id ? 'chevron-up' : 'chevron-down'} size={18} />
          </button>

          {#if openId === p.id}
            {@const own = p.id === ui.me?.id}
            <div class="space-y-4 px-4 pb-4">
              {#if admin}
                <label class="flex flex-col gap-1.5">
                  <span class="text-[13px] font-semibold text-fg2">{t('Anzeigename')}</span>
                  <input
                    class="min-h-11 rounded-xl bg-surface2 px-3"
                    value={p.displayName}
                    maxlength="60"
                    aria-label={t('Anzeigename von {name}', { name: p.displayName })}
                    onblur={(e) => rename(p.id, p.displayName, e.currentTarget.value)}
                  />
                </label>
              {/if}

              {#if feat.standalone && admin}
                {@const acct = accountOf(p.id)}
                <div data-testid="account-{p.id}">
                  <p class="mb-1.5 text-[13px] font-semibold text-fg2">{t('Anmeldung')}</p>
                  {#if acct}
                    <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
                      <span>{t('Administrator')}</span>
                      <input
                        type="checkbox"
                        class="h-5 w-5 accent-[var(--accent)]"
                        checked={acct.isAdmin}
                        disabled={busy || acct.userId === ui.me?.id}
                        aria-label={t('{name} ist Administrator', { name: p.displayName })}
                        onchange={(e) => run(() => api.updateAccount(acct.userId, { isAdmin: e.currentTarget.checked }))}
                      />
                    </label>
                    <div class="mt-1 flex items-center gap-2">
                      <input
                        type="password"
                        bind:value={acctPw}
                        autocomplete="new-password"
                        placeholder={t('Neues Passwort')}
                        aria-label={t('Neues Passwort für {name}', { name: p.displayName })}
                        class="min-h-11 min-w-0 flex-1 rounded-xl bg-surface2 px-3"
                      />
                      <button type="button" class="min-h-11 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-40" disabled={busy || acctPw.length < 10} onclick={() => resetPassword(acct)}>
                        {t('Setzen')}
                      </button>
                    </div>
                  {:else}
                    <p class="mb-2 text-[13px] text-fg2">{t('{name} hat noch keine Anmeldung (wird nur zugewiesen).', { name: p.displayName })}</p>
                    <div class="flex flex-col gap-2">
                      <input bind:value={acctUser} autocomplete="off" autocapitalize="none" placeholder={t('Benutzername')} aria-label={t('Benutzername für {name}', { name: p.displayName })} class="min-h-11 rounded-xl bg-surface2 px-3" />
                      <input type="password" bind:value={acctPw} autocomplete="new-password" placeholder={t('Passwort (mindestens 10 Zeichen)')} aria-label={t('Passwort für {name}', { name: p.displayName })} class="min-h-11 rounded-xl bg-surface2 px-3" />
                      <button type="button" class="min-h-11 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-40" disabled={busy || !acctUser.trim() || acctPw.length < 10} onclick={() => createAccountFor(p.id)}>
                        {t('Anmeldung anlegen')}
                      </button>
                    </div>
                  {/if}
                </div>
              {/if}

              {#if own}
                <p class="text-[13px] text-fg2">
                  {t('Deine Geräte, Ruhezeit und den Rückblick am Sonntag findest du unter Einstellungen › Benachrichtigungen.')}
                </p>
                <button type="button" class="min-h-11 text-[15px] font-semibold text-accent-text" onclick={() => openSettings('notifications')}>{t('Benachrichtigungen öffnen')}</button>
              {:else}
                <PersonDelivery {p} {info} {run} {busy} canEdit={canEdit(p.id)} show={{ delivery: true }} />
              {/if}


              {#if feat.house && admin && house}
                <HouseChannels person={p} {house} {entities} {run} {busy} />
              {/if}


              {#if !own}
                <PersonDelivery {p} {info} {run} {busy} canEdit={canEdit(p.id)} show={{ quiet: true, summary: true, busy: true }} />
              {/if}

              {#if admin && p.isPerson}
                {@const grown = info.people.filter((o) => o.isPerson && !o.isChild && o.id !== p.id)}
                <div data-testid="child-setup">
                  <p class="mb-1.5 text-[13px] font-semibold text-fg2">{t('Rolle Kind')}</p>
                  <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
                    <span>{t('Ist ein Kind (eingeschränkte Rechte)')}</span>
                    <input
                      type="checkbox"
                      class="h-5 w-5 accent-[var(--accent)]"
                      checked={p.isChild}
                      disabled={busy || p.isAdmin}
                      aria-label={t('Kind: {name}', { name: p.displayName })}
                      onchange={(e) => {
                        const on = e.currentTarget.checked;
                        void run(() => api.updatePerson(p.id, { isChild: on }));
                      }}
                    />
                  </label>
                  {#if p.isAdmin}
                    <p class="text-[13px] text-fg2">{t('Ein Administrator kann kein Kind sein.')}</p>
                  {:else if p.isChild}
                    <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
                      <span>{t('Sieht')}</span>
                      <select
                        class="min-h-10 rounded-xl bg-surface2 px-3"
                        value={p.childScope}
                        disabled={busy}
                        aria-label={t('Welche Boards {name} sieht', { name: p.displayName })}
                        onchange={(e) => {
                          const scope = e.currentTarget.value as 'all' | 'assigned';
                          void run(() => api.updatePerson(p.id, { childScope: scope }));
                        }}
                      >
                        <option value="assigned">{t('Nur Boards mit eigenen Karten')}</option>
                        <option value="all">{t('Alle Boards')}</option>
                      </select>
                    </label>
                    <label class="flex min-h-11 items-center justify-between gap-3 text-[15px]">
                      <span>{t('„Erledigt“ braucht eine Bestätigung')}</span>
                      <input
                        type="checkbox"
                        class="h-5 w-5 accent-[var(--accent)]"
                        checked={p.confirmDefault}
                        disabled={busy}
                        aria-label={t('Bestätigung als Vorgabe für {name}', { name: p.displayName })}
                        onchange={(e) => {
                          const on = e.currentTarget.checked;
                          void run(() => api.updatePerson(p.id, { confirmDefault: on }));
                        }}
                      />
                    </label>
                    <p class="mt-1 text-[13px] font-semibold text-fg2">{t('Wer bestätigt')}</p>
                    {#each grown as o (o.id)}
                      <label class="flex min-h-11 items-center gap-3 text-[15px]">
                        <input
                          type="checkbox"
                          class="h-5 w-5 accent-[var(--accent)]"
                          checked={p.confirmers.includes(o.id)}
                          disabled={busy}
                          aria-label={t('{name} bestätigt für {child}', { name: o.displayName, child: p.displayName })}
                          onchange={(e) => {
                            const on = e.currentTarget.checked;
                            const next = on ? [...p.confirmers, o.id] : p.confirmers.filter((x) => x !== o.id);
                            void run(() => api.updatePerson(p.id, { confirmers: next }));
                          }}
                        />
                        <span class="min-w-0 flex-1 truncate">{o.displayName}</span>
                      </label>
                    {/each}
                    <p class="text-[13px] text-fg2">{t('Administratoren dürfen immer bestätigen. Ist niemand gewählt, dürfen alle Erwachsenen.')}</p>
                    <p class="text-[13px] text-fg2">{t('Ein Kind sieht und ändert nur seine eigenen Karten (abhaken, kommentieren, Fotos anhängen), nichts sonst. Sprache und Farbe wählt es selbst.')}</p>
                  {/if}
                </div>
              {/if}

              {#if admin && !info.managed}
                {#if confirmRemove === p.id}
                  <p class="text-[13px] text-fg2">{t('Zugewiesene Karten behalten die Zuweisung, falls {name} zurückkommt.', { name: p.displayName })}</p>
                  <div class="flex gap-2">
                    <button type="button" class="min-h-11 flex-1 rounded-xl bg-danger-bg font-semibold text-danger" disabled={busy} onclick={() => remove(p.id)}>
                      {t('Ja, entfernen')}
                    </button>
                    <button type="button" class="min-h-11 flex-1 rounded-xl bg-surface2 font-semibold" onclick={() => (confirmRemove = null)}>{t('Abbrechen')}</button>
                  </div>
                {:else}
                  <button type="button" class="min-h-11 text-[15px] font-semibold text-danger" disabled={busy} onclick={() => (confirmRemove = p.id)}>
                    {t('Aus Stups entfernen')}
                  </button>
                {/if}
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <p class="px-4 py-4 text-[15px] text-fg2">{t('Noch niemand.')} {admin && !info.managed ? t('Füge unten Personen hinzu.') : ''}</p>
      {/each}
    </Group>

    {#if admin && feat.standalone}
      <Group title={t('Benutzer anlegen')} hint={t('Wer sich anmelden soll. Das Passwort sagst du der Person selbst, sie kann es danach unter Einstellungen ändern.')}>
        <form onsubmit={addUser} class="flex flex-col gap-2 px-4 py-3" aria-label={t('Benutzer anlegen')}>
          <input bind:value={nuName} maxlength="60" placeholder={t('Name in Stups (zum Beispiel Anna)')} aria-label={t('Name der neuen Person')} class="min-h-11 rounded-xl bg-surface2 px-3" />
          <input bind:value={nuUser} autocomplete="off" autocapitalize="none" placeholder={t('Benutzername')} aria-label={t('Benutzername')} class="min-h-11 rounded-xl bg-surface2 px-3" />
          <input type="password" bind:value={nuPw} autocomplete="new-password" placeholder={t('Passwort (mindestens 10 Zeichen)')} aria-label={t('Passwort')} class="min-h-11 rounded-xl bg-surface2 px-3" />
          <label class="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" class="h-5 w-5 accent-[var(--accent)]" bind:checked={nuAdmin} />{t('Administrator')}
          </label>
          <button class="min-h-11 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-40" disabled={busy || !nuUser.trim() || nuPw.length < 10}>{t('Benutzer anlegen')}</button>
        </form>
      </Group>
      {#if feat.ha && info.haPersons.length}
        <Group
          title={t('Aus Home Assistant')}
          hint={t('Personen aus Home Assistant (Einstellungen › Personen). Mit demselben Namen findet Stups sie bei den Wächtern („wer ist zu Hause“).')}
        >
          {#each info.haPersons as hp (hp.userId ?? hp.name)}
            <Row label={hp.name}>
              <button class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-60" disabled={busy} onclick={() => add(hp.name, hp.userId)}>
                {t('Hinzufügen')}
              </button>
            </Row>
          {/each}
        </Group>
      {:else if feat.ha && info.directoryAvailable === false}
        <p class="mb-3 rounded-2xl bg-surface2 px-4 py-3 text-[15px]">{t('Home Assistant liefert die Personenliste gerade nicht.')}</p>
      {/if}
      <Group title={t('Person ohne Anmeldung')} hint={t('Zum Zuweisen von Karten, zum Beispiel für Kinder, die Stups nicht selbst öffnen.')}>
        <form onsubmit={addManual} class="flex items-center gap-2 px-4 py-2">
          <input bind:value={manualName} maxlength="60" placeholder={t('Name')} enterkeyhint="done" class="min-h-11 min-w-0 flex-1 rounded-xl bg-surface2 px-3" aria-label={t('Name der Person ohne Anmeldung')} />
          <button class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-40" disabled={busy || !manualName.trim()}>{t('Hinzufügen')}</button>
        </form>
      </Group>
    {:else if admin && !info.managed}
      {#if info.pending.length}
        <Group title={t('Wartet auf Freigabe')} hint={t('Diese Benutzer haben Stups geöffnet, sind aber keine Person.')}>
          {#each info.pending as u (u.id)}
            <Row label={u.displayName}>
              <button
                class="min-h-10 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-60"
                disabled={busy}
                onclick={() => add(u.displayName, u.haUserId)}
              >
                {t('Freigeben')}
              </button>
            </Row>
          {/each}
        </Group>
      {/if}

      <Group
        title={t('Person hinzufügen')}
        hint={info.directoryAvailable === false
          ? t('Home Assistant liefert die Personenliste gerade nicht. Der Name muss zum Benutzernamen oder Anzeigenamen in Home Assistant passen.')
          : t('Personen aus Home Assistant (Einstellungen › Personen). Wer noch nie angemeldet war, wird beim ersten Öffnen verknüpft.')}
      >
        {#each info.haPersons as hp (hp.userId ?? hp.name)}
          <Row label={hp.name}>
            <button
              class="min-h-10 rounded-xl bg-surface2 px-4 font-semibold disabled:opacity-60"
              disabled={busy}
              onclick={() => add(hp.name, hp.userId)}
            >
              {t('Hinzufügen')}
            </button>
          </Row>
        {/each}
        <form onsubmit={addManual} class="flex items-center gap-2 px-4 py-2">
          <input
            bind:value={manualName}
            maxlength="60"
            placeholder={t('Anderen Namen eintragen')}
            enterkeyhint="done"
            class="min-h-11 min-w-0 flex-1 rounded-xl bg-surface2 px-3"
            aria-label={t('Name der neuen Person')}
          />
          <button class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-40" disabled={busy || !manualName.trim()}>
            {t('Hinzufügen')}
          </button>
        </form>
      </Group>
    {/if}
  {/if}
</Sheet>
