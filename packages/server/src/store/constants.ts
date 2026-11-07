export const TRASH_DAYS = 30;
export const PERSON_COLORS = ['#9DB4FF', '#FF9EC4', '#8FE3B4', '#FFC58A'];
export const DUE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
export const PRIORITIES = ['low', 'medium', 'high'];


export const NTFY_TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const OPEN_CARD = 'c.deleted_at is null and c.archived_at is null and c.completed_at is null';

/** Nur Karten aus Boards, die es gibt (nicht gelöscht, nicht archiviert; Alias `c` für die Karte): ein archiviertes Board ruht, es stupst und erinnert nicht */
export const LIVE_BOARD = ' and c.board_id in (select id from boards where deleted_at is null and archived_at is null)';

/** Nur Karten aus Boards, die alle sehen (Alias `c` für die Karte): für Sensoren in Home Assistant, die jeder dort lesen kann */
export const PUBLIC_BOARD = " and c.board_id in (select id from boards where visibility = 'all' and archived_at is null)";
