export const TRASH_DAYS = 30;
export const PERSON_COLORS = ['#9DB4FF', '#FF9EC4', '#8FE3B4', '#FFC58A'];
export const DUE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
export const PRIORITIES = ['low', 'medium', 'high'];


export const NTFY_TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const OPEN_CARD = 'c.deleted_at is null and c.archived_at is null and c.completed_at is null';
