import { AppError } from './errors.js';
import { t } from './i18n/index.js';

export interface UploadLimits {
  /** Anhänge je Aufgabe */
  cardFiles: number;
  cardBytes: number;
  /** Je Person und Stunde (gleitend) */
  hourFiles: number;
  hourBytes: number;
  /** Gleichzeitige Uploads je Person (jeder hält bis zu zwei Dateien im Speicher) */
  parallel: number;
}

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  cardFiles: 20,
  cardBytes: 200 * 1024 * 1024,
  hourFiles: 60,
  hourBytes: 400 * 1024 * 1024,
  parallel: 2,
};

const HOUR_MS = 3_600_000;

/** Obergrenzen für Uploads: je Aufgabe (Anzahl, Gesamtgröße) und je Person und Stunde. Zu viel ergibt 413 oder 429 mit klarem Text. */
export function createUploadQuota(now: () => Date = () => new Date(), limits: Partial<UploadLimits> = {}) {
  const lim = { ...DEFAULT_UPLOAD_LIMITS, ...limits };
  const recent = new Map<string, { at: number; bytes: number }[]>();
  const running = new Map<string, number>();

  const window = (who: string): { at: number; bytes: number }[] => {
    const cutoff = now().getTime() - HOUR_MS;
    const list = (recent.get(who) ?? []).filter((e) => e.at > cutoff);
    if (list.length === 0) recent.delete(who);
    else recent.set(who, list);
    return list;
  };

  return {
    limits: lim,
    /**
     * Vor dem Lesen des Inhalts: die Aufgabe hat Platz für noch eine Datei, die Person lädt nicht zu viel und nicht zu viel zugleich.
     * Gibt die Freigabe zurück (`release`), die nach dem Upload aufzurufen ist.
     */
    begin(who: string, card: { files: number; bytes: number }): () => void {
      if (card.files >= lim.cardFiles) {
        throw new AppError(t('Diese Aufgabe hat schon {n} Anhänge, mehr sind nicht erlaubt', { n: lim.cardFiles }), 413);
      }
      if (card.bytes >= lim.cardBytes) {
        throw new AppError(t('Die Anhänge dieser Aufgabe sind schon {mb} MB groß, mehr ist nicht erlaubt', { mb: Math.round(lim.cardBytes / 1048576) }), 413);
      }
      const list = window(who);
      if (list.length >= lim.hourFiles || list.reduce((n, e) => n + e.bytes, 0) >= lim.hourBytes) {
        throw new AppError(t('Zu viele Uploads in der letzten Stunde. Bitte später noch einmal versuchen'), 429);
      }
      const n = running.get(who) ?? 0;
      if (n >= lim.parallel) throw new AppError(t('Es laufen schon Uploads. Bitte kurz warten'), 429);
      running.set(who, n + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (running.get(who) ?? 1) - 1;
        if (left <= 0) running.delete(who);
        else running.set(who, left);
      };
    },
    /** Nach dem Lesen: die Größe (die Datei) zählt gegen die Aufgabe und die Stunde; true, wenn sie nicht mehr hineinpasst */
    wouldExceedCard(card: { bytes: number }, size: number): boolean {
      return card.bytes + size > lim.cardBytes;
    },
    /** Eine gelungene Ablage zählt für die Stunde */
    record(who: string, bytes: number): void {
      const list = window(who);
      list.push({ at: now().getTime(), bytes });
      recent.set(who, list);
    },
    /** Bilder der Personen: höchstens so oft je Stunde */
    avatar(who: string, max = 20): void {
      const key = `avatar:${who}`;
      const list = window(key);
      if (list.length >= max) throw new AppError(t('Zu viele Uploads in der letzten Stunde. Bitte später noch einmal versuchen'), 429);
      list.push({ at: now().getTime(), bytes: 0 });
      recent.set(key, list);
    },
  };
}
export type UploadQuota = ReturnType<typeof createUploadQuota>;
