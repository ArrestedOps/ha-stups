import type { Migration } from './db.js';

/** Append only: never edit a released migration, add a new version instead. */
export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      create table users (
        id           text primary key,
        ha_user_id   text unique,
        name         text not null,
        display_name text not null,
        is_person    integer not null default 0,
        color        text,
        created_at   text not null
      );

      create table boards (
        id                 text primary key,
        name               text not null,
        icon               text,
        color              text,
        position           text not null,
        archive_after_days integer not null default 7,
        created_at         text not null,
        updated_at         text not null,
        deleted_at         text
      );

      create table columns (
        id         text primary key,
        board_id   text not null references boards(id) on delete cascade,
        name       text not null,
        position   text not null,
        is_done    integer not null default 0,
        deleted_at text
      );
      create unique index ux_columns_one_done
        on columns(board_id) where is_done = 1 and deleted_at is null;
      create index ix_columns_board on columns(board_id);

      create table categories (
        id         text primary key,
        board_id   text not null references boards(id) on delete cascade,
        name       text not null,
        color      text not null,
        position   text not null,
        deleted_at text
      );
      create index ix_categories_board on categories(board_id);

      create table cards (
        id           text primary key,
        board_id     text not null references boards(id) on delete cascade,
        column_id    text not null references columns(id),
        position     text not null,
        title        text not null,
        description  text,
        priority     text check (priority in ('low', 'medium', 'high')),
        due_at       text,
        recurrence   text,
        completed_at text,
        archived_at  text,
        created_by   text references users(id),
        created_at   text not null,
        updated_at   text not null,
        deleted_at   text,
        version      integer not null default 1
      );
      create index ix_cards_board on cards(board_id);
      create index ix_cards_column on cards(column_id);
      create index ix_cards_due on cards(due_at) where deleted_at is null;

      create table card_categories (
        card_id     text not null references cards(id) on delete cascade,
        category_id text not null references categories(id) on delete cascade,
        primary key (card_id, category_id)
      );

      create table card_assignees (
        card_id text not null references cards(id) on delete cascade,
        user_id text not null references users(id),
        primary key (card_id, user_id)
      );

      create table checklist_items (
        id       text primary key,
        card_id  text not null references cards(id) on delete cascade,
        text     text not null,
        done     integer not null default 0,
        position text not null
      );
      create index ix_checklist_card on checklist_items(card_id);

      create table links (
        id       text primary key,
        card_id  text not null references cards(id) on delete cascade,
        url      text not null,
        title    text,
        kind     text not null check (kind in ('web', 'maps')),
        position text not null
      );
      create index ix_links_card on links(card_id);

      create table completions (
        id           text primary key,
        card_id      text not null references cards(id) on delete cascade,
        completed_by text references users(id),
        completed_at text not null,
        due_at       text,
        source       text not null check (source in ('app', 'push'))
      );
      create index ix_completions_card on completions(card_id);
    `,
  },
  {
    version: 2,
    // Zustand der Karte vor dem Erledigen, damit "Rückgängig" alles wiederherstellen kann
    sql: `alter table completions add column snapshot text;`,
  },
  {
    version: 3,
    sql: `
      alter table cards add column remind_before_min integer;
      alter table cards add column overdue_nag integer not null default 0;
      alter table cards add column cost_cents integer;

      -- Gesendete Erinnerungen: verhindert Doppelnachrichten, auch nach einem Neustart.
      -- card_id ist bewusst kein Fremdschlüssel (Zusammenfassungen haben keine Karte).
      create table sent_notifications (
        id             integer primary key autoincrement,
        card_id        text not null,
        user_id        text not null,
        kind           text not null check (kind in ('due', 'reminder', 'nag', 'summary')),
        occurrence_key text not null,
        status         text not null default 'sent' check (status in ('sent', 'skipped', 'failed')),
        sent_at        text not null,
        unique (card_id, user_id, kind, occurrence_key)
      );

      create table settings (
        key   text primary key,
        value text not null
      );

      create table comments (
        id         text primary key,
        card_id    text not null references cards(id) on delete cascade,
        author_id  text references users(id),
        text       text not null,
        created_at text not null,
        edited_at  text
      );
      create index ix_comments_card on comments(card_id);
    `,
  },
  {
    version: 4,
    sql: `
      create table attachments (
        id         text primary key,
        card_id    text not null references cards(id) on delete cascade,
        filename   text not null,
        mime       text not null,
        size       integer not null,
        file       text not null,
        thumb      text,
        created_by text references users(id),
        created_at text not null
      );
      create index ix_attachments_card on attachments(card_id);
    `,
  },
  {
    version: 5,
    // "Geplant": Spalte nur für Karten mit Termin in der Zukunft
    sql: `
      alter table columns add column is_planned integer not null default 0;
      create unique index ux_columns_one_planned
        on columns(board_id) where is_planned = 1 and deleted_at is null;
    `,
  },
  {
    version: 6,
    // Verlauf einer Karte: Verschieben, Wieder-Öffnen und geänderte Fälligkeit.
    // "angelegt" und "erledigt" kommen aus cards und completions und stehen hier nicht doppelt.
    sql: `
      create table card_events (
        id      text primary key,
        card_id text not null references cards(id) on delete cascade,
        kind    text not null check (kind in ('moved', 'reopened', 'due')),
        by_user text references users(id),
        at      text not null,
        from_v  text,
        to_v    text
      );
      create index ix_card_events_card on card_events(card_id);
    `,
  },
  {
    version: 7,
    // Push-Geräte (Notify-Dienste) je Person; vorher standen sie nur in den Add-on-Optionen
    sql: `alter table users add column notify_services text not null default '[]';`,
  },
  {
    version: 8,
    // Wiederholung: Welche Felder die nächste Karte übernimmt (null = Voreinstellung) und von welcher Karte sie stammt.
    // repeated_from ist bewusst kein Fremdschlüssel: Die Vorgängerin darf später endgültig gelöscht werden.
    sql: `
      alter table cards add column carry_over text;
      alter table cards add column repeated_from text;
    `,
  },
  {
    version: 9,
    // Stupsen: eine Zeile pro Empfänger. Die Zustellung wird hier selbst entschieden (delivered_round), damit weder
    // sent_notifications noch card_events (beide mit check-Einschränkung) umgebaut werden müssen.
    sql: `
      create table nudges (
        id              text primary key,
        card_id         text not null references cards(id) on delete cascade,
        from_user       text not null references users(id),
        to_user         text not null references users(id),
        template        text,
        text            text not null,
        created_at      text not null,
        deliver_at      text not null,
        delivered_at    text,
        delivered_round integer not null default -1,
        later_count     integer not null default 0,
        later_log       text not null default '[]',
        reply           text check (reply in ('ack', 'done', 'closed')),
        reply_at        text
      );
      create index ix_nudges_card on nudges(card_id);
      create index ix_nudges_open on nudges(to_user) where reply is null;

      alter table users add column nudge_quiet_start text;
      alter table users add column nudge_quiet_end text;
      alter table users add column nudge_quiet_off integer not null default 0;
    `,
  },
  {
    version: 10,
    // Wächter: Karten entstehen automatisch aus Zuständen in Home Assistant.
    // Auslöser, Kartenvorlage und Zuweisung stehen als JSON (werden beim Speichern geprüft). Läufe halten die letzten 50
    // je Wächter und liefern auch den Verlauf der Karte, damit card_events (mit check-Einschränkung) nicht umgebaut werden muss.
    sql: `
      create table watchers (
        id             text primary key,
        name           text not null,
        active         integer not null default 1,
        position       integer not null default 0,
        trigger_json   text not null,
        card_json      text not null,
        assign_json    text not null,
        done_json      text,
        cooldown_min   integer not null default 10,
        dedupe         integer not null default 1,
        nudge_after_min integer,
        status         text not null default 'ok' check (status in ('ok', 'entity_missing', 'target_missing')),
        last_fired_at  text,
        last_assignees text not null default '[]',
        created_at     text not null,
        updated_at     text not null
      );

      create table watcher_state (
        watcher_id    text primary key references watchers(id) on delete cascade,
        armed         integer not null default 1,
        met_since     text,
        counter       integer not null default 0,
        counter_since text,
        last_person   text,
        last_fire_at  text
      );

      create table watcher_runs (
        id          text primary key,
        watcher_id  text not null references watchers(id) on delete cascade,
        at          text not null,
        result      text not null check (result in
                      ('created', 'retriggered', 'counted', 'cooldown', 'waiting', 'assigned', 'auto_done', 'nudged', 'test', 'error')),
        card_id     text,
        assigned_to text not null default '[]',
        note        text
      );
      create index ix_watcher_runs on watcher_runs(watcher_id, at);

      create table watcher_waiting (
        card_id           text primary key references cards(id) on delete cascade,
        watcher_id        text not null references watchers(id) on delete cascade,
        since             text not null,
        first_assigned_at text
      );

      alter table cards add column watcher_id text;
      alter table cards add column dedupe_key text;
      create index ix_cards_watcher on cards(watcher_id) where watcher_id is not null;
      create index ix_cards_dedupe on cards(dedupe_key) where dedupe_key is not null;
    `,
  },
  {
    version: 11,
    // Betrieb ohne Home Assistant: eigene Konten mit Passwort und Sitzungen. Ein Konto gehört zu einer Person (users);
    // dessen ha_user_id lautet "local:<Zufallswert>". Im Add-on bleiben beide Tabellen leer.
    sql: `
      create table local_accounts (
        user_id             text primary key references users(id) on delete cascade,
        username            text not null unique collate nocase,
        password_hash       text not null,
        is_admin            integer not null default 0,
        created_at          text not null,
        password_changed_at text not null
      );

      create table sessions (
        token_hash   text primary key,
        user_id      text not null references users(id) on delete cascade,
        created_at   text not null,
        last_seen_at text not null,
        expires_at   text not null
      );
      create index ix_sessions_user on sessions(user_id);
    `,
  },
  {
    version: 12,
    // Push über ntfy: das Thema, das die Person in der ntfy-App abonniert. Die Notify-Dienste für Home Assistant bleiben daneben bestehen.
    sql: `alter table users add column ntfy_topic text;`,
  },
  {
    version: 13,
    // Passkeys für die eigene Anmeldung (nur im Container). Der öffentliche Schlüssel ist nicht geheim.
    sql: `
      create table passkeys (
        id            text primary key,
        user_id       text not null references users(id) on delete cascade,
        credential_id text not null unique,
        public_key    blob not null,
        counter       integer not null default 0,
        transports    text,
        name          text not null,
        created_at    text not null,
        last_used_at  text
      );
      create index ix_passkeys_user on passkeys(user_id);
    `,
  },
  {
    version: 14,
    // Sprache je Person: `language` ist die zuletzt gemeldete Sprache (für Push, ohne Browser), `language_choice` die feste Wahl (null = Automatisch)
    sql: `
      alter table users add column language text;
      alter table users add column language_choice text;
    `,
  },
  {
    version: 15,
    // Eigene Akzentfarbe je Person als Farbton 0–359 (null = das Orange der App)
    sql: `
      alter table users add column accent_hue integer;
    `,
  },
  {
    version: 16,
    // Haus-Kanäle (Ansage über einen Lautsprecher, Lampe) je Person und die Warteschlange „warten bis zur Heimkehr"
    sql: `
      create table house_channels (
        id            text primary key,
        user_id       text not null references users(id) on delete cascade,
        type          text not null check (type in ('speak', 'light')),
        name          text not null,
        entity_id     text not null,
        enabled       integer not null default 1,
        kinds         text not null default '["nudge"]',
        when_away     text not null default 'skip' check (when_away in ('skip', 'wait')),
        wait_minutes  integer not null default 120,
        volume        integer,
        created_at    text not null
      );
      create index ix_house_channels_user on house_channels(user_id);

      create table house_pending (
        id          text primary key,
        channel_id  text not null references house_channels(id) on delete cascade,
        kind        text not null check (kind in ('nudge', 'due', 'watcher')),
        spoken      text not null,
        card_id     text,
        nudge_id    text,
        expires_at  text not null,
        created_at  text not null
      );
      create index ix_house_pending_channel on house_pending(channel_id);
    `,
  },
  {
    version: 17,
    // Eigene Board-Vorlagen (die eingebauten stehen im Code, siehe templates.ts)
    sql: `
      create table board_templates (
        id          text primary key,
        name        text not null,
        data        text not null,
        created_by  text references users(id) on delete set null,
        created_at  text not null
      );
    `,
  },
  {
    version: 18,
    // Aufwand je Karte (klein, mittel, groß; leer = mittel) für die Fairness-Ansicht, und die Sonntags-Zusammenfassung je Person
    sql: `
      alter table cards add column effort text check (effort in ('small', 'medium', 'large'));
      alter table users add column weekly_summary integer not null default 0;
    `,
  },
  {
    version: 19,
    // Rolle „Kind": eingeschränkte Rechte, Sichtbarkeit (alle Boards oder nur Boards mit eigenen Karten), Bestätigung durch Eltern
    sql: `
      alter table users add column is_child integer not null default 0;
      alter table users add column child_scope text not null default 'all' check (child_scope in ('all', 'assigned'));
      alter table users add column confirm_default integer not null default 0;

      create table child_confirmers (
        child_id text not null references users(id) on delete cascade,
        user_id  text not null references users(id) on delete cascade,
        primary key (child_id, user_id)
      );

      -- Bestätigung je Karte: leer = Vorgabe der zuständigen Person, on = immer, off = nie
      alter table cards add column confirm text check (confirm in ('on', 'off'));
      -- Das Kind hat „erledigt" gesagt, die Karte wartet auf Bestätigung
      alter table cards add column confirm_requested_at text;
      alter table cards add column confirm_requested_by text references users(id) on delete set null;
    `,
  },
  {
    version: 20,
    // Stufe 4: Bild der Person (Quelle und Fassung für den Cache), „wenig Zeit" bis Datum, offene Vorschläge der Wächter („Erst vorschlagen")
    sql: `
      alter table users add column avatar_source text check (avatar_source in ('ha', 'upload'));
      alter table users add column avatar_rev integer not null default 0;
      alter table users add column busy_until text;

      create table watcher_suggest (
        card_id    text primary key references cards(id) on delete cascade,
        watcher_id text not null references watchers(id) on delete cascade,
        since      text not null
      );

      -- Neue Ergebnisse der Läufe (Weitergeben, Vorschlagen, Übernehmen, Rückfall nach 30 Minuten): die Prüfliste der Tabelle erweitern
      create table watcher_runs_new (
        id          text primary key,
        watcher_id  text not null references watchers(id) on delete cascade,
        at          text not null,
        result      text not null check (result in
                      ('created', 'retriggered', 'counted', 'cooldown', 'waiting', 'assigned', 'auto_done', 'nudged', 'test', 'error', 'passed', 'suggested', 'claimed', 'suggest_fallback')),
        card_id     text,
        assigned_to text not null default '[]',
        note        text
      );
      insert into watcher_runs_new select id, watcher_id, at, result, card_id, assigned_to, note from watcher_runs;
      drop table watcher_runs;
      alter table watcher_runs_new rename to watcher_runs;
      create index ix_watcher_runs on watcher_runs(watcher_id, at);
    `,
  },
  {
    version: 21,
    // „Gefunden": Treffer, die ein Administrator ausgeblendet hat (Vorlage + Entität), damit sie nicht wieder vorgeschlagen werden
    sql: `
      create table watcher_hidden (
        template_id text not null,
        entity_id   text not null,
        at          text not null,
        primary key (template_id, entity_id)
      );
    `,
  },
  {
    version: 22,
    // Neues Design, Phase 3: Symbol und Farbe je Karte. icon = Name aus der Symbol-Bibliothek der Oberfläche (leer = Standard
    // „Aufgabe"), icon_color = eine der acht Kachelfarben (leer = Auto, nach Bereich des Symbols), icon_source = auto (aus dem Titel
    // erkannt) oder manual (von Hand gewählt). Keine Massenänderung: vorhandene Karten bleiben leer.
    sql: `
      alter table cards add column icon text;
      alter table cards add column icon_color text;
      alter table cards add column icon_source text check (icon_source in ('auto', 'manual'));
    `,
  },
  {
    version: 23,
    // Neues Design, Phase 6b und Dashboard je Person.
    // inbox_seen_at: bis wann die Person ihre Mitteilungen gelesen hat (ein Eintrag ist ungelesen, wenn er jünger ist). Bei der Migration
    // auf „jetzt" gesetzt, damit die Glocke nicht mit Altlasten startet; null bei später angelegten Personen heißt: noch nichts gelesen.
    // dashboard_path: das Dashboard, zu dem der Home-Knopf diese Person führt (null = Standard). Dazu Indexe für die Abfrage des Posteingangs.
    sql: `
      alter table users add column inbox_seen_at text;
      update users set inbox_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
      alter table users add column dashboard_path text;
      create index ix_nudges_to on nudges(to_user, created_at);
      create index ix_nudges_from on nudges(from_user, reply_at);
      create index ix_comments_at on comments(created_at);
      create index ix_completions_at on completions(completed_at);
      create index ix_watcher_runs_at on watcher_runs(at);
      create index ix_card_events_at on card_events(at);
      create index ix_sent_user_at on sent_notifications(user_id, sent_at);
    `,
  },
  {
    version: 24,
    // Rückmeldungen (Fehler, Wünsche, Lob, Kritik) aus der App. Nur neue Tabelle, nichts Vorhandenes wird angefasst.
    // kind: bug | idea | praise | criticism | other; status: neu | gelesen | erledigt. person_name ist der Name zum Zeitpunkt des Sendens
    // (die Person darf später gelöscht werden, die Rückmeldung bleibt). image und thumb sind Dateinamen im Dateispeicher (wie bei Anhängen).
    // meta: JSON mit Version, Kanal, Ansicht, Sprache, Hell/Dunkel, Fenstergröße, eingebettet, User-Agent (gekürzt).
    sql: `
      create table feedback (
        id text primary key,
        person_id text references users(id) on delete set null,
        person_name text,
        kind text not null check (kind in ('bug', 'idea', 'praise', 'criticism', 'other')),
        message text not null,
        image text,
        thumb text,
        meta text not null default '{}',
        status text not null default 'neu' check (status in ('neu', 'gelesen', 'erledigt')),
        created_at text not null
      );
      create index ix_feedback_at on feedback(created_at);
      create index ix_feedback_person on feedback(person_id, created_at);
    `,
  },
  {
    version: 25,
    // Berechtigungen je Person: Ein Administrator gibt einzelnen Mitgliedern gezielt Rechte, die sonst nur Administratoren haben
    // (Wächter, Haus-Kanäle, App-Einstellungen, Personen, Bestätigungen für Kinder). Nur eine neue Tabelle, nichts Vorhandenes wird
    // angefasst; niemand hat danach eine Berechtigung. permission ist einer der Schlüssel aus permissions.ts (der Server prüft das beim
    // Speichern), mit der Person verschwinden auch ihre Rechte.
    sql: `
      create table user_permissions (
        user_id text not null references users(id) on delete cascade,
        permission text not null,
        primary key (user_id, permission)
      );
    `,
  },
  {
    version: 26,
    // Kategorie am Wächter: ein frei wählbarer Text (null = „Ohne Kategorie"), mit dem die Oberfläche die Wächter gruppiert. Nur eine neue
    // Spalte, nichts Vorhandenes wird angefasst; bestehende Wächter bleiben ohne Kategorie, bis ein Mensch eine wählt oder „Kategorien
    // vorschlagen" drückt. Gleiche Namen (ohne Beachtung der Groß-/Kleinschreibung) legt der Server beim Speichern zusammen.
    sql: `
      alter table watchers add column category text;
    `,
  },
  {
    version: 27,
    // Boards: Sichtbarkeit und Fairness, dazu Wächter-Regeln. visibility: all (jeder mit Zugriff) | private (nur der Besitzer) | selected
    // (Besitzer und Mitglieder aus board_members). owner_id ist bei Bestandsboards null (sie bleiben für alle sichtbar). counts_for_fairness:
    // 0 nimmt das Board aus der Fairness-Auswertung (private Boards zählen nie, egal was hier steht). Am Wächter: counts_for_fairness (Bestand: 1)
    // und assignees_missing (1 = es sind keine gültigen Zuständigen mehr da: der Wächter legt keine Karten an, bis neue gewählt sind).
    // Die Läufe der Wächter bekommen das Ergebnis no_assignees (Tabellenumbau wie in Migration 20); watcher_notices sind die Mitteilungen
    // für die Glocke („braucht neue Zuständige", „läuft weiter mit …").
    sql: `
      alter table boards add column visibility text not null default 'all' check (visibility in ('all', 'private', 'selected'));
      alter table boards add column owner_id text references users(id) on delete set null;
      alter table boards add column counts_for_fairness integer not null default 1;
      create table board_members (
        board_id text not null references boards(id) on delete cascade,
        user_id  text not null references users(id) on delete cascade,
        primary key (board_id, user_id)
      );
      create index ix_board_members_user on board_members(user_id);

      alter table watchers add column counts_for_fairness integer not null default 1;
      alter table watchers add column assignees_missing integer not null default 0;

      create table watcher_runs_new (
        id          text primary key,
        watcher_id  text not null references watchers(id) on delete cascade,
        at          text not null,
        result      text not null check (result in
                      ('created', 'retriggered', 'counted', 'cooldown', 'waiting', 'assigned', 'auto_done', 'nudged', 'test', 'error', 'passed', 'suggested', 'claimed', 'suggest_fallback', 'no_assignees')),
        card_id     text,
        assigned_to text not null default '[]',
        note        text
      );
      insert into watcher_runs_new select id, watcher_id, at, result, card_id, assigned_to, note from watcher_runs;
      drop table watcher_runs;
      alter table watcher_runs_new rename to watcher_runs;
      create index ix_watcher_runs on watcher_runs(watcher_id, at);
      create index ix_watcher_runs_at on watcher_runs(at);

      create table watcher_notices (
        id         text primary key,
        watcher_id text not null references watchers(id) on delete cascade,
        kind       text not null check (kind in ('assignees_missing', 'shrunk')),
        at         text not null,
        by_user    text,
        recipients text not null default '[]',
        detail     text not null default '{}'
      );
      create index ix_watcher_notices_at on watcher_notices(at);
    `,
  },
];
