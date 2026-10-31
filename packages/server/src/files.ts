import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

export type AllowedMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'application/pdf';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_THUMB_BYTES = 400 * 1024;

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

/** Erkennt den Typ am Inhalt. Was der Browser oder der Dateiname behauptet, zählt nicht. */
export function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length < 4) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

const EXTENSIONS: Record<AllowedMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

export const extensionFor = (mime: AllowedMime): string => EXTENSIONS[mime];

/** Dateiname aus dem Upload: ohne Pfad, ohne Steuerzeichen, begrenzt */
export function cleanFilename(name: string): string {
  // Browser schreiben Zeilenumbrüche und Anführungszeichen im Dateinamen als %0A, %0D und %22 (HTML-Standard)
  const decoded = name.replace(/%0A/gi, '\n').replace(/%0D/gi, '\r').replace(/%22/g, '"');
  // eslint-disable-next-line no-control-regex -- Steuerzeichen sollen hier gerade entfernt werden
  const base = basename(decoded.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return base.slice(0, 120) || 'Datei';
}

export function createFileStore(dir: string) {
  const root = resolve(dir);
  mkdirSync(root, { recursive: true });

  function pathFor(name: string): string {
    const p = resolve(root, name);
    if (basename(name) !== name || !p.startsWith(root + sep)) throw new Error('Ungültiger Dateiname');
    return p;
  }

  return {
    dir: root,
    write(name: string, data: Buffer): void {
      writeFileSync(pathFor(name), data);
    },
    read(name: string): Buffer {
      return readFileSync(pathFor(name));
    },
    remove(name: string): void {
      rmSync(pathFor(name), { force: true });
    },
    /** Löscht Dateien, auf die nichts mehr verweist. `minAgeMs` schützt Uploads, die gerade erst ankommen. */
    cleanup(keep: Set<string>, minAgeMs = 0, now = Date.now()): number {
      let n = 0;
      for (const name of readdirSync(root)) {
        if (keep.has(name)) continue;
        const p = join(root, name);
        if (minAgeMs > 0 && now - statSync(p).mtimeMs < minAgeMs) continue;
        rmSync(p, { force: true });
        n++;
      }
      return n;
    },
  };
}

export type FileStore = ReturnType<typeof createFileStore>;
