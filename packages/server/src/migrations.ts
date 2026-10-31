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
];
