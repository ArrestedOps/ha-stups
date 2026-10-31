export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 2048;
const THUMB_EDGE = 320;

/** Passt Maße in ein Quadrat von `max` Pixeln ein, ohne zu vergrößern. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Text, warum eine Datei nicht hochgeladen werden kann, sonst null. Bilder werden vor dem Upload verkleinert. */
export function uploadProblem(file: File): string | null {
  if (file.type.startsWith('image/')) return null;
  if (file.type === 'application/pdf') {
    return file.size > MAX_UPLOAD_BYTES ? 'Das PDF ist größer als 20 MB' : null;
  }
  return 'Erlaubt sind nur Bilder und PDF';
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht umgewandelt werden'))), 'image/jpeg', quality),
  );
}

async function render(bitmap: ImageBitmap, edge: number, quality: number): Promise<Blob> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, edge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // Transparenz (z. B. PNG-Screenshots) wird zu Weiß
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return toBlob(canvas, quality);
}

export interface PreparedUpload {
  file: Blob;
  filename: string;
  thumb: Blob | null;
}

/**
 * Bereitet eine Datei für den Upload vor. Bilder werden auf höchstens 2048 Pixel an der langen Kante
 * verkleinert und als JPEG (80 %) neu kodiert. Das entfernt auch Standort und andere Metadaten.
 * Dazu kommt ein kleines Vorschaubild. PDFs gehen unverändert hoch.
 */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  if (!file.type.startsWith('image/')) return { file, filename: file.name, thumb: null };
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bitmap) throw new Error('Dieses Bildformat kann dein Gerät nicht lesen');
  try {
    const full = await render(bitmap, MAX_EDGE, 0.8);
    const thumb = await render(bitmap, THUMB_EDGE, 0.7);
    const filename = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return { file: full, filename: filename === '.jpg' ? 'Foto.jpg' : filename, thumb };
  } finally {
    bitmap.close();
  }
}
