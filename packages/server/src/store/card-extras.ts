import { randomUUID } from 'node:crypto';
import { generateKeyBetween } from 'fractional-indexing';
import { NotFoundError } from '../errors.js';
import { detectLinkKind, normalizeUrl } from '../links.js';
import { type Attachment, type StoredAttachment, type Comment, type ChecklistItem, type CardLink, type Row } from './types.js';
import { cleanText } from './validate.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';

/** Anhänge, Kommentare, Checkliste und Links einer Karte */
export function createCardExtras(c: Ctx, late: unknown) {
  // Erst hier auf den vollen Typ gebracht: stünde Internals schon im Kopf, hinge sein Typ von sich selbst ab
  const s = late as Internals;
  const { iso, one, all, run, tx } = c;
  // Funktionen aus anderen Themen: erst beim Aufruf nachgeschlagen (alle Teile sind bei der Verwendung zusammengesetzt)
  const { lastPos, toItem, toLink, touchCard, visibleCardRow } = lazy(s, ['lastPos', 'toItem', 'toLink', 'touchCard', 'visibleCardRow'] as const);

  const toStored = (r: Row): StoredAttachment => ({
    id: r.id,
    cardId: r.card_id,
    filename: r.filename,
    mime: r.mime,
    size: r.size,
    hasThumb: r.thumb !== null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    file: r.file,
    thumb: r.thumb,
  });

  const publicAttachment = ({ file: _file, thumb: _thumb, ...rest }: StoredAttachment): Attachment => rest;

  function listAttachments(cardId: string): Attachment[] {
    return all('select * from attachments where card_id = ? order by created_at, rowid', cardId).map((r) =>
      publicAttachment(toStored(r)),
    );
  }

  function addAttachment(
    cardId: string,
    a: { id: string; filename: string; mime: string; size: number; file: string; thumb: string | null },
    by: string | null,
  ): Attachment {
    visibleCardRow(cardId);
    run(
      `insert into attachments (id, card_id, filename, mime, size, file, thumb, created_by, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.id,
      cardId,
      a.filename,
      a.mime,
      a.size,
      a.file,
      a.thumb,
      by,
      iso(),
    );
    touchCard(cardId);
    return publicAttachment(toStored(one('select * from attachments where id = ?', a.id)!));
  }

  function getAttachment(id: string): StoredAttachment {
    const r = one(
      `select a.* from attachments a join cards c on c.id = a.card_id where a.id = ? and c.deleted_at is null`,
      id,
    );
    if (!r) throw new NotFoundError('Anhang nicht gefunden');
    return toStored(r);
  }

  /** Entfernt den Eintrag und gibt die Dateinamen zurück, die der Aufrufer löschen soll. */
  function deleteAttachment(id: string): { file: string | null; thumb: string | null } {
    const a = getAttachment(id);
    run('delete from attachments where id = ?', id);
    touchCard(a.cardId);
    // Bei einer Wiederholung teilen sich Karten dieselbe Datei: gelöscht wird erst, wenn niemand sie mehr braucht
    const used = (name: string) => !!one('select 1 as x from attachments where file = ? or thumb = ?', name, name);
    return { file: used(a.file) ? null : a.file, thumb: a.thumb && !used(a.thumb) ? a.thumb : null };
  }

  /** Alle Dateinamen im Speicher, auf die noch ein Eintrag verweist (für das Aufräumen) */
  function referencedFiles(): Set<string> {
    const names = new Set<string>();
    for (const r of all('select file, thumb from attachments')) {
      names.add(r.file);
      if (r.thumb) names.add(r.thumb);
    }
    return names;
  }

  const toComment = (r: Row): Comment => ({
    id: r.id,
    cardId: r.card_id,
    authorId: r.author_id,
    authorName: r.author_name ?? null,
    text: r.text,
    createdAt: r.created_at,
    editedAt: r.edited_at,
  });

  const commentRow = (id: string): Row => {
    const r = one(
      `select c.*, u.display_name as author_name from comments c left join users u on u.id = c.author_id where c.id = ?`,
      id,
    );
    if (!r) throw new NotFoundError('Kommentar nicht gefunden');
    return r;
  };

  function addComment(cardId: string, authorId: string | null, text: string): Comment {
    visibleCardRow(cardId);
    const clean = cleanText(text, 'Der Kommentar', 2000);
    const id = randomUUID();
    run('insert into comments (id, card_id, author_id, text, created_at) values (?, ?, ?, ?, ?)', id, cardId, authorId, clean, iso());
    touchCard(cardId);
    return toComment(commentRow(id));
  }

  function listComments(cardId: string): Comment[] {
    visibleCardRow(cardId);
    return all(
      `select c.*, u.display_name as author_name from comments c left join users u on u.id = c.author_id
       where c.card_id = ? order by c.created_at, c.rowid`,
      cardId,
    ).map(toComment);
  }

  function updateComment(id: string, text: string): Comment {
    const c = commentRow(id);
    run('update comments set text = ?, edited_at = ? where id = ?', cleanText(text, 'Der Kommentar', 2000), iso(), id);
    touchCard(c.card_id);
    return toComment(commentRow(id));
  }

  function deleteComment(id: string): void {
    const c = commentRow(id);
    run('delete from comments where id = ?', id);
    touchCard(c.card_id);
  }

  function addChecklistItem(cardId: string, text: string): ChecklistItem {
    visibleCardRow(cardId);
    const clean = cleanText(text, 'Der Text', 200);
    return tx(() => {
      const id = randomUUID();
      run(
        'insert into checklist_items (id, card_id, text, done, position) values (?, ?, ?, 0, ?)',
        id,
        cardId,
        clean,
        generateKeyBetween(lastPos('checklist_items', 'card_id = ?', cardId), null),
      );
      touchCard(cardId);
      return toItem(one('select * from checklist_items where id = ?', id)!);
    });
  }

  function itemRow(id: string): Row {
    const r = one(
      `select i.* from checklist_items i join cards c on c.id = i.card_id where i.id = ? and c.deleted_at is null`,
      id,
    );
    if (!r) throw new NotFoundError('Eintrag nicht gefunden');
    return r;
  }

  function updateChecklistItem(id: string, patch: { text?: string; done?: boolean }): ChecklistItem {
    const item = itemRow(id);
    return tx(() => {
      if (patch.text !== undefined) {
        run('update checklist_items set text = ? where id = ?', cleanText(patch.text, 'Der Text', 200), id);
      }
      if (patch.done !== undefined) run('update checklist_items set done = ? where id = ?', patch.done ? 1 : 0, id);
      touchCard(item.card_id);
      return toItem(one('select * from checklist_items where id = ?', id)!);
    });
  }

  function deleteChecklistItem(id: string): void {
    const item = itemRow(id);
    run('delete from checklist_items where id = ?', id);
    touchCard(item.card_id);
  }

  function addLink(cardId: string, input: { url: string; title?: string | null }): CardLink {
    visibleCardRow(cardId);
    const url = normalizeUrl(input.url);
    const title = input.title?.trim() ? input.title.trim().slice(0, 200) : null;
    return tx(() => {
      const id = randomUUID();
      run(
        'insert into links (id, card_id, url, title, kind, position) values (?, ?, ?, ?, ?, ?)',
        id,
        cardId,
        url,
        title,
        detectLinkKind(url),
        generateKeyBetween(lastPos('links', 'card_id = ?', cardId), null),
      );
      touchCard(cardId);
      return toLink(one('select * from links where id = ?', id)!);
    });
  }

  function linkRow(id: string): Row {
    const r = one('select l.* from links l join cards c on c.id = l.card_id where l.id = ? and c.deleted_at is null', id);
    if (!r) throw new NotFoundError('Link nicht gefunden');
    return r;
  }

  function updateLink(id: string, patch: { url?: string; title?: string | null }): CardLink {
    const link = linkRow(id);
    return tx(() => {
      if (patch.url !== undefined) {
        const url = normalizeUrl(patch.url);
        run('update links set url = ?, kind = ? where id = ?', url, detectLinkKind(url), id);
      }
      if (patch.title !== undefined) {
        run('update links set title = ? where id = ?', patch.title?.trim() ? patch.title.trim().slice(0, 200) : null, id);
      }
      touchCard(link.card_id);
      return toLink(one('select * from links where id = ?', id)!);
    });
  }

  /** Gespeicherte Google-Kurzlinks (für die einmalige Reparatur beim Start) */
  function listShortMapsLinks(): { id: string; url: string; title: string | null }[] {
    return all(
      `select l.id, l.url, l.title from links l join cards c on c.id = l.card_id
       where c.deleted_at is null and (l.url like 'https://maps.app.goo.gl/%' or l.url like 'https://goo.gl/maps/%')`,
    ).map((r) => ({ id: r.id, url: r.url, title: r.title }));
  }

  function deleteLink(id: string): void {
    const link = linkRow(id);
    run('delete from links where id = ?', id);
    touchCard(link.card_id);
  }

  return {
    toStored,
    publicAttachment,
    listAttachments,
    addAttachment,
    getAttachment,
    deleteAttachment,
    referencedFiles,
    toComment,
    commentRow,
    addComment,
    listComments,
    updateComment,
    deleteComment,
    addChecklistItem,
    itemRow,
    updateChecklistItem,
    deleteChecklistItem,
    addLink,
    linkRow,
    updateLink,
    listShortMapsLinks,
    deleteLink,
  };
}
