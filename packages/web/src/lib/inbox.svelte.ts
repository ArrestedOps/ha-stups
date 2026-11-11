import { api, type InboxEntry } from './api';
import { unreadCount } from './inbox';

/**
 * Der Posteingang der angemeldeten Person (Glocke und Mitteilungen). Er wird im selben Takt wie die Aufgaben nachgeladen
 * (App.svelte, bei jeder Änderung über ui.rev), nicht in einer eigenen Schleife und über keinen eigenen Kanal.
 */
export const inbox = $state({
  items: [] as InboxEntry[],
  /** bis wann die Person alles gelesen hat (null: noch nie) */
  seenAt: null as string | null,
  hasMore: false,
  loaded: false,
  loadingMore: false,
  failed: false,
});

let request = 0;
let running: AbortController | null = null;

/** Lädt den neuesten Stand (die letzte Anfrage gewinnt; eine überholte wird abgebrochen und meldet keinen Fehler) */
export async function loadInbox(): Promise<void> {
  const mine = ++request;
  running?.abort();
  const { signal } = (running = new AbortController());
  try {
    const r = await api.inbox(undefined, signal);
    if (mine !== request) return;
    inbox.items = r.items;
    inbox.seenAt = r.seenAt;
    inbox.hasMore = r.hasMore;
    inbox.loaded = true;
    inbox.failed = false;
  } catch {
    if (mine === request) inbox.failed = true;
  }
}

/** Ältere Einträge anhängen (innerhalb der 14 Tage) */
export async function loadMoreInbox(): Promise<void> {
  const last = inbox.items[inbox.items.length - 1];
  if (!last || inbox.loadingMore) return;
  inbox.loadingMore = true;
  try {
    const r = await api.inbox(last.at);
    const have = new Set(inbox.items.map((i) => i.id));
    inbox.items = [...inbox.items, ...r.items.filter((i) => !have.has(i.id))];
    inbox.hasMore = r.hasMore;
  } catch {
    /* beim nächsten Tippen noch einmal */
  } finally {
    inbox.loadingMore = false;
  }
}

/** „Alle gelesen": der Punkt an der Glocke verschwindet sofort, der Server hält den Marker je Person */
export async function markAllRead(): Promise<void> {
  const before = inbox.seenAt;
  inbox.seenAt = new Date().toISOString();
  try {
    inbox.seenAt = (await api.markInboxSeen()).seenAt;
  } catch {
    inbox.seenAt = before;
  }
}

export const unread = (): number => unreadCount(inbox.items, inbox.seenAt);
