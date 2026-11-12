import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors.js';
import { createUploadQuota, DEFAULT_UPLOAD_LIMITS } from '../src/upload-quota.js';

const HOUR = 3_600_000;
const MB = 1024 * 1024;

function clock(start = Date.UTC(2026, 0, 1, 12)) {
  let ms = start;
  return {
    now: () => new Date(ms),
    advance: (by: number) => {
      ms += by;
    },
  };
}

function thrown(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error('Es wurde kein Fehler geworfen');
}

describe('Upload-Obergrenzen', () => {
  it('Standardgrenzen', () => {
    expect(DEFAULT_UPLOAD_LIMITS).toEqual({
      cardFiles: 20,
      cardBytes: 200 * MB,
      hourFiles: 60,
      hourBytes: 400 * MB,
      parallel: 2,
    });
    expect(createUploadQuota().limits).toEqual(DEFAULT_UPLOAD_LIMITS);
    expect(createUploadQuota(undefined, { parallel: 5 }).limits).toEqual({ ...DEFAULT_UPLOAD_LIMITS, parallel: 5 });
  });

  describe('je Karte', () => {
    it('Anzahl: an der Grenze gesperrt, knapp darunter frei', () => {
      const q = createUploadQuota(undefined, { cardFiles: 3 });
      q.begin('a', { files: 2, bytes: 0 })();
      const err = thrown(() => q.begin('a', { files: 3, bytes: 0 }));
      expect(err.status).toBe(413);
      expect(err.message).toBe('Diese Karte hat schon 3 Anhänge, mehr sind nicht erlaubt');
    });

    it('Größe: an der Grenze gesperrt, knapp darunter frei, Meldung nennt die Megabyte', () => {
      const q = createUploadQuota(undefined, { cardBytes: 5 * MB });
      q.begin('a', { files: 0, bytes: 5 * MB - 1 })();
      const err = thrown(() => q.begin('a', { files: 0, bytes: 5 * MB }));
      expect(err.status).toBe(413);
      expect(err.message).toBe('Die Anhänge dieser Karte sind schon 5 MB groß, mehr ist nicht erlaubt');
    });

    it('Größe: Standard sind 200 MB', () => {
      const q = createUploadQuota();
      const err = thrown(() => q.begin('a', { files: 0, bytes: 200 * MB }));
      expect(err.message).toBe('Die Anhänge dieser Karte sind schon 200 MB groß, mehr ist nicht erlaubt');
    });

    it('wouldExceedCard: genau voll passt, ein Byte mehr nicht', () => {
      const q = createUploadQuota(undefined, { cardBytes: 100 });
      expect(q.wouldExceedCard({ bytes: 60 }, 40)).toBe(false);
      expect(q.wouldExceedCard({ bytes: 60 }, 41)).toBe(true);
    });
  });

  describe('je Person und Stunde', () => {
    it('Anzahl: ab der Grenze 429 mit Text, andere Personen bleiben frei', () => {
      const c = clock();
      const q = createUploadQuota(c.now, { hourFiles: 2 });
      q.record('a', 1);
      q.begin('a', { files: 0, bytes: 0 })();
      q.record('a', 1);
      const err = thrown(() => q.begin('a', { files: 0, bytes: 0 }));
      expect(err.status).toBe(429);
      expect(err.message).toBe('Zu viele Uploads in der letzten Stunde. Bitte später noch einmal versuchen');
      q.begin('b', { files: 0, bytes: 0 })();
    });

    it('Bytes: Summe aller Ablagen zählt, an der Grenze gesperrt, knapp darunter frei', () => {
      const c = clock();
      const q = createUploadQuota(c.now, { hourBytes: 100 });
      q.record('a', 30);
      q.record('a', 69);
      q.begin('a', { files: 0, bytes: 0 })();
      q.record('a', 1);
      const err = thrown(() => q.begin('a', { files: 0, bytes: 0 }));
      expect(err.status).toBe(429);
      expect(err.message).toBe('Zu viele Uploads in der letzten Stunde. Bitte später noch einmal versuchen');
    });

    it('Eintrag genau eine Stunde alt zählt nicht mehr, eine Millisekunde jünger noch', () => {
      const c = clock();
      const q = createUploadQuota(c.now, { hourFiles: 1 });
      q.record('a', 1);
      c.advance(HOUR - 1);
      expect(thrown(() => q.begin('a', { files: 0, bytes: 0 })).status).toBe(429);
      c.advance(1);
      q.begin('a', { files: 0, bytes: 0 })();
    });

    it('Gleitendes Fenster: nur der alte Eintrag fällt heraus', () => {
      const c = clock();
      const q = createUploadQuota(c.now, { hourFiles: 2 });
      q.record('a', 1);
      c.advance(HOUR / 2);
      q.record('a', 1);
      c.advance(HOUR / 2);
      // der erste ist jetzt eine Stunde alt, der zweite eine halbe: ein Platz frei
      q.begin('a', { files: 0, bytes: 0 })();
      q.record('a', 1);
      expect(thrown(() => q.begin('a', { files: 0, bytes: 0 })).status).toBe(429);
    });
  });

  describe('gleichzeitige Uploads', () => {
    it('ab der Grenze 429 mit Text, nach Freigabe wieder frei', () => {
      const q = createUploadQuota(undefined, { parallel: 2 });
      const card = { files: 0, bytes: 0 };
      const r1 = q.begin('a', card);
      q.begin('a', card);
      const err = thrown(() => q.begin('a', card));
      expect(err.status).toBe(429);
      expect(err.message).toBe('Es laufen schon Uploads. Bitte kurz warten');
      r1();
      q.begin('a', card);
      expect(thrown(() => q.begin('a', card)).status).toBe(429);
    });

    it('zählt je Person', () => {
      const q = createUploadQuota(undefined, { parallel: 1 });
      const card = { files: 0, bytes: 0 };
      q.begin('a', card);
      q.begin('b', card);
      expect(thrown(() => q.begin('a', card)).status).toBe(429);
      expect(thrown(() => q.begin('b', card)).status).toBe(429);
    });

    it('Freigabe ist einmalig: doppelter Aufruf gibt keinen zweiten Platz frei', () => {
      const q = createUploadQuota(undefined, { parallel: 2 });
      const card = { files: 0, bytes: 0 };
      const r1 = q.begin('a', card);
      q.begin('a', card);
      r1();
      r1();
      q.begin('a', card);
      expect(thrown(() => q.begin('a', card)).status).toBe(429);
    });

    it('Freigabe der letzten Datei räumt auf, die nächste Runde beginnt bei null', () => {
      const q = createUploadQuota(undefined, { parallel: 1 });
      const card = { files: 0, bytes: 0 };
      q.begin('a', card)();
      const r2 = q.begin('a', card);
      expect(thrown(() => q.begin('a', card)).status).toBe(429);
      r2();
      q.begin('a', card);
    });
  });

  describe('Bilder der Personen', () => {
    it('höchstens max je Stunde, mit Text; 429', () => {
      const c = clock();
      const q = createUploadQuota(c.now);
      q.avatar('a', 2);
      q.avatar('a', 2);
      const err = thrown(() => q.avatar('a', 2));
      expect(err.status).toBe(429);
      expect(err.message).toBe('Zu viele Uploads in der letzten Stunde. Bitte später noch einmal versuchen');
    });

    it('zählt je Person und getrennt von Anhängen', () => {
      const c = clock();
      const q = createUploadQuota(c.now, { hourFiles: 1 });
      q.avatar('a', 1);
      q.avatar('b', 1);
      expect(thrown(() => q.avatar('a', 1)).status).toBe(429);
      // Anhänge derselben Person sind davon unberührt
      q.begin('a', { files: 0, bytes: 0 })();
      q.record('a', 1);
      expect(thrown(() => q.begin('a', { files: 0, bytes: 0 })).status).toBe(429);
      q.avatar('c', 1);
    });

    it('Standard sind 20 je Stunde, nach einer Stunde wieder frei', () => {
      const c = clock();
      const q = createUploadQuota(c.now);
      for (let i = 0; i < 20; i++) q.avatar('a');
      expect(thrown(() => q.avatar('a')).status).toBe(429);
      c.advance(HOUR);
      q.avatar('a');
    });
  });
});
