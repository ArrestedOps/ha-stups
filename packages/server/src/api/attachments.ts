import { AppError, ValidationError } from '../errors.js';
import { cleanFilename, extensionFor, MAX_FILE_BYTES, MAX_THUMB_BYTES, sniffMime } from '../files.js';
import multipart from '@fastify/multipart';
import { type FastifyInstance, type FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { type ApiKit, type Params } from './kit.js';
import { t } from '../i18n/index.js';
import { createUploadQuota } from '../upload-quota.js';

/** Anhänge */
export async function registerAttachmentRoutes(app: FastifyInstance, k: ApiKit): Promise<void> {
  const { deps, store, noContent } = k;
  const quota = createUploadQuota(deps.now, deps.uploadLimits);

  // ----- attachments -----
  await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 2, fields: 5 } });
  app.post<{ Params: Params }>('/api/cards/:id/attachments', async (req, reply) => {
    const files = deps.files;
    if (!files) throw new AppError(t('Die Dateiablage ist nicht verfügbar'), 501);
    const existing = store.getCard(req.params.id).attachments; // unbekannte Karte: sofort 404
    const card = { files: existing.length, bytes: existing.reduce((n, a) => n + a.size, 0) };
    // Obergrenzen vor dem Lesen: je Karte und je Person (Kinder dürfen hochladen, jeder Upload hält bis zu zwei Dateien im Speicher)
    const who = req.user?.id ?? 'anonym';
    const release = quota.begin(who, card);
    try {
      return await receiveUpload(req, reply, files, card, who);
    } finally {
      release();
    }
  });

  async function receiveUpload(
    req: import('fastify').FastifyRequest<{ Params: Params }>,
    reply: FastifyReply,
    files: NonNullable<typeof deps.files>,
    card: { files: number; bytes: number },
    who: string,
  ) {
    let file: { name: string; data: Buffer } | null = null;
    let thumb: Buffer | null = null;
    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      const data = await part.toBuffer(); // wirft 413, wenn die Datei zu groß ist
      if (part.fieldname === 'file') file = { name: part.filename, data };
      else if (part.fieldname === 'thumb') thumb = data;
    }
    if (!file) throw new ValidationError(t('Es fehlt die Datei'));
    if (quota.wouldExceedCard(card, file.data.length + (thumb?.length ?? 0))) {
      throw new AppError(t('Die Anhänge dieser Karte sind schon {mb} MB groß, mehr ist nicht erlaubt', { mb: Math.round(quota.limits.cardBytes / 1048576) }), 413);
    }

    const mime = sniffMime(file.data);
    if (!mime) throw new ValidationError(t('Dieser Dateityp ist nicht erlaubt. Erlaubt sind Bilder und PDF'));
    const thumbMime = thumb ? sniffMime(thumb) : null;
    if (thumb && (!thumbMime || !thumbMime.startsWith('image/') || thumb.length > MAX_THUMB_BYTES)) {
      throw new ValidationError(t('Das Vorschaubild ist ungültig'));
    }

    const id = randomUUID();
    const fileName = `${id}.${extensionFor(mime)}`;
    const thumbName = thumb && thumbMime ? `${id}.thumb.${extensionFor(thumbMime)}` : null;
    files.write(fileName, file.data);
    if (thumb && thumbName) files.write(thumbName, thumb);
    try {
      const att = store.addAttachment(
        req.params.id,
        { id, filename: cleanFilename(file.name), mime, size: file.data.length, file: fileName, thumb: thumbName },
        req.user?.id ?? null,
      );
      quota.record(who, file.data.length + (thumb?.length ?? 0));
      return reply.code(201).send(att);
    } catch (err) {
      files.remove(fileName);
      if (thumbName) files.remove(thumbName);
      throw err;
    }
  }
  function sendFile(reply: FastifyReply, data: Buffer, filename: string) {
    return reply
      .header('content-type', sniffMime(data) ?? 'application/octet-stream')
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`)
      .header('cache-control', 'private, max-age=86400')
      .send(data);
  }
  app.get<{ Params: Params }>('/api/attachments/:id', async (req, reply) => {
    const a = store.getAttachment(req.params.id);
    return sendFile(reply, deps.files!.read(a.file), a.filename);
  });
  app.get<{ Params: Params }>('/api/attachments/:id/thumb', async (req, reply) => {
    const a = store.getAttachment(req.params.id);
    if (!a.thumb) return reply.code(404).send({ error: 'Kein Vorschaubild vorhanden' });
    return sendFile(reply, deps.files!.read(a.thumb), a.filename);
  });
  app.delete<{ Params: Params }>('/api/attachments/:id', async (req, reply) => {
    const { file, thumb } = store.deleteAttachment(req.params.id);
    if (file) deps.files?.remove(file);
    if (thumb) deps.files?.remove(thumb);
    return noContent(reply);
  });
}
