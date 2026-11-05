import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../errors.js';
import { FEEDBACK_LIST_LIMIT, type FeedbackKind, type FeedbackMeta, type FeedbackStatus } from '../feedback.js';
import { t } from '../i18n/index.js';
import type { Ctx } from './context.js';
import type { Row } from './types.js';

/** Eine Rückmeldung, wie die Verwaltung sie sieht (die Dateinamen von Bild und Vorschau bleiben intern) */
export interface Feedback {
  id: string;
  personId: string | null;
  /** Name der Person zum Zeitpunkt des Sendens */
  personName: string | null;
  kind: FeedbackKind;
  message: string;
  hasImage: boolean;
  hasThumb: boolean;
  meta: FeedbackMeta;
  status: FeedbackStatus;
  createdAt: string;
}

/** Rückmeldungen (Fehler, Wünsche, Lob, Kritik) aus der App; die Verwaltung liegt bei den Administratoren (api/feedback.ts) */
export function createFeedback(c: Ctx) {
  const { one, all, run, iso } = c;

  const parseMeta = (raw: string): FeedbackMeta => {
    try {
      const v = JSON.parse(raw) as unknown;
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as FeedbackMeta) : {};
    } catch {
      return {};
    }
  };
  const toFeedback = (r: Row): Feedback => ({
    id: r.id,
    personId: r.person_id,
    personName: r.person_name,
    kind: r.kind,
    message: r.message,
    hasImage: r.image !== null,
    hasThumb: r.thumb !== null,
    meta: parseMeta(r.meta),
    status: r.status,
    createdAt: r.created_at,
  });
  const row = (id: string): Row => {
    const r = one('select * from feedback where id = ?', id);
    if (!r) throw new NotFoundError(t('Rückmeldung nicht gefunden'));
    return r;
  };

  return {
    addFeedback(f: { id?: string; personId: string | null; personName: string | null; kind: FeedbackKind; message: string; meta: FeedbackMeta; image?: string | null; thumb?: string | null }): Feedback {
      const id = f.id ?? randomUUID();
      run(
        `insert into feedback (id, person_id, person_name, kind, message, image, thumb, meta, status, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, 'neu', ?)`,
        id,
        f.personId,
        f.personName,
        f.kind,
        f.message,
        f.image ?? null,
        f.thumb ?? null,
        JSON.stringify(f.meta),
        iso(),
      );
      return toFeedback(row(id));
    },
    /** Neueste zuerst */
    listFeedback(limit = FEEDBACK_LIST_LIMIT): Feedback[] {
      return all('select * from feedback order by created_at desc, rowid desc limit ?', limit).map(toFeedback);
    },
    feedbackNewCount(): number {
      return one("select count(*) as n from feedback where status = 'neu'")!.n as number;
    },
    getFeedback(id: string): Feedback {
      return toFeedback(row(id));
    },
    /** Dateinamen von Bild und Vorschau (nur für die Auslieferung durch die Verwaltung) */
    feedbackFilesOf(id: string): { image: string | null; thumb: string | null } {
      const r = row(id);
      return { image: r.image, thumb: r.thumb };
    },
    setFeedbackStatus(id: string, status: FeedbackStatus): Feedback {
      row(id);
      run('update feedback set status = ? where id = ?', status, id);
      return toFeedback(row(id));
    },
    /** Löscht die Rückmeldung und gibt die Dateinamen zurück, die der Aufrufer aus dem Dateispeicher entfernt */
    deleteFeedback(id: string): { image: string | null; thumb: string | null } {
      const files = { image: row(id).image as string | null, thumb: row(id).thumb as string | null };
      run('delete from feedback where id = ?', id);
      return files;
    },
    /** Wie viele Rückmeldungen die Person seit diesem Zeitpunkt gesendet hat (für das Zeitlimit) */
    feedbackCountSince(personId: string, sinceIso: string): number {
      return one('select count(*) as n from feedback where person_id = ? and created_at > ?', personId, sinceIso)!.n as number;
    },
    /** Dateinamen im Speicher, auf die eine Rückmeldung verweist (damit das Aufräumen sie behält) */
    feedbackFiles(): Set<string> {
      const names = new Set<string>();
      for (const r of all('select image, thumb from feedback where image is not null')) {
        names.add(r.image);
        if (r.thumb) names.add(r.thumb);
      }
      return names;
    },
  };
}
