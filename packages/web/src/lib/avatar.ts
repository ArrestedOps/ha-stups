import { t } from './i18n/index.svelte';

/** Kantenlänge des hochgeladenen Personenbilds in Pixeln */
export const AVATAR_EDGE = 256;

/** Adresse des Bilds (relativ, wie alle Aufrufe: läuft unter dem Ingress-Pfad); null, wenn die Person keins hat */
export function avatarUrl(p: { id?: string; avatarRev?: number | null }): string | null {
  if (!p.id || p.avatarRev === null || p.avatarRev === undefined) return null;
  return `api/people/${encodeURIComponent(p.id)}/avatar?rev=${p.avatarRev}`;
}

/** Der quadratische Ausschnitt aus der Mitte eines Bilds (Quellrechteck für drawImage) */
export function squareCrop(width: number, height: number): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  return { sx: Math.round((width - size) / 2), sy: Math.round((height - size) / 2), size };
}

/**
 * Macht aus einem gewählten Bild das Personenbild: Quadrat aus der Mitte, 256 × 256, WebP (wo das Gerät es kann, sonst PNG).
 * Das entfernt auch Standort und andere Metadaten.
 */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error(t('Bitte ein Bild wählen'));
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bitmap) throw new Error(t('Dieses Bildformat kann dein Gerät nicht lesen'));
  try {
    const { sx, sy, size } = squareCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_EDGE;
    canvas.height = AVATAR_EDGE;
    canvas.getContext('2d')!.drawImage(bitmap, sx, sy, size, size, 0, 0, AVATAR_EDGE, AVATAR_EDGE);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t('Bild konnte nicht umgewandelt werden')))), 'image/webp', 0.85),
    );
  } finally {
    bitmap.close();
  }
}
