import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { extensionFor, MAX_THUMB_BYTES, sniffMime } from '../files.js';
import {
  FEEDBACK_MAX_IMAGE_BYTES,
  FEEDBACK_PER_HOUR,
  parseFeedbackContext,
  parseFeedbackKind,
  parseFeedbackMessage,
  parseFeedbackStatus,
  shortUserAgent,
  type FeedbackMeta,
} from '../feedback.js';
import { t } from '../i18n/index.js';
import { requirePermission } from '../permissions.js';
import { createUploadQuota } from '../upload-quota.js';
import { type ApiKit, type Params } from './kit.js';

const HOUR_MS = 3_600_000;

/**
 * Rückmeldungen: Jede angemeldete Person darf eine senden (Art, Text, optional ein Bild); lesen, den Stand ändern und löschen dürfen nur
 * Administratoren und Mitglieder mit dem Recht „feedback“. Ein Kind sendet nichts (steht nicht auf der Erlaubnisliste, api/child-guard.ts). Es geht nichts an Dritte hinaus.
 */
export function registerFeedbackRoutes(app: FastifyInstance, k: ApiKit): void {
  const { deps, store, body, noContent } = k;
  const now = () => (deps.now ?? (() => new Date()))();
  // Bilder zählen wie Anhänge gegen die Obergrenzen je Person und Stunde und gegen gleichzeitige Uploads (upload-quota.ts)
  const quota = createUploadQuota(deps.now, deps.uploadLimits);

  // Entweder JSON (nur Text) oder ein Formular mit Bild: image (Pflicht für ein Bild), thumb (Vorschau, optional)
  app.post('/api/feedback', async (req, reply) => {
    const user = req.user;
    if (!user) throw new ForbiddenError();
    const since = new Date(now().getTime() - HOUR_MS).toISOString();
    if (store.feedbackCountSince(user.id, since) >= FEEDBACK_PER_HOUR) {
      throw new AppError(t('Du hast in der letzten Stunde schon viele Rückmeldungen gesendet. Bitte versuche es später noch einmal'), 429);
    }

    let fields: Record<string, unknown>;
    let image: Buffer | null = null;
    let thumb: Buffer | null = null;
    // Mit Formular (Bild): vor dem Lesen prüfen, ob die Person noch hochladen darf; die Freigabe gibt der Aufrufer zurück
    let release = () => {};
    try {
      if (req.isMultipart()) {
        release = quota.begin(user.id, { files: 0, bytes: 0 });
        fields = {};
        for await (const part of req.parts({ limits: { fileSize: FEEDBACK_MAX_IMAGE_BYTES, files: 2, fields: 6, fieldSize: 8 * 1024 } })) {
          if (part.type === 'field') {
            fields[part.fieldname] = part.value;
            continue;
          }
          const data = await part.toBuffer(); // wirft 413, wenn die Datei zu groß ist
          if (part.fieldname === 'image') image = data;
          else if (part.fieldname === 'thumb') thumb = data;
        }
      } else {
        fields = body(req);
      }

      const kind = parseFeedbackKind(fields.kind);
      const message = parseFeedbackMessage(fields.message);
      const imageMime = image ? sniffMime(image) : null;
      if (image && (!imageMime || !imageMime.startsWith('image/'))) throw new ValidationError(t('Das Bild ist ungültig. Erlaubt sind JPEG, PNG, WebP und GIF'));
      const thumbMime = thumb ? sniffMime(thumb) : null;
      if (thumb && (!thumbMime || !thumbMime.startsWith('image/') || thumb.length > MAX_THUMB_BYTES)) throw new ValidationError(t('Das Vorschaubild ist ungültig'));
      if (image && !deps.files) throw new AppError(t('Die Dateiablage ist nicht verfügbar'), 501);

      const meta: FeedbackMeta = {
        ...parseFeedbackContext(fields.context),
        ...(deps.capabilities?.version ? { version: deps.capabilities.version } : {}),
        ...(deps.capabilities?.channel ? { channel: deps.capabilities.channel } : {}),
        ...(shortUserAgent(req.headers['user-agent']) ? { userAgent: shortUserAgent(req.headers['user-agent']) } : {}),
      };

      const id = randomUUID();
      const imageName = image && imageMime ? `feedback-${id}.${extensionFor(imageMime)}` : null;
      const thumbName = imageName && thumb && thumbMime ? `feedback-${id}.thumb.${extensionFor(thumbMime)}` : null;
      if (image && imageName) deps.files!.write(imageName, image);
      if (thumb && thumbName) deps.files!.write(thumbName, thumb);
      try {
        store.addFeedback({ id, personId: user.id, personName: user.displayName, kind, message, meta, image: imageName, thumb: thumbName });
      } catch (err) {
        if (imageName) deps.files?.remove(imageName);
        if (thumbName) deps.files?.remove(thumbName);
        throw err;
      }
      if (image) quota.record(user.id, image.length + (thumb?.length ?? 0));
      return reply.code(201).send({ id });
    } finally {
      release();
    }
  });

  app.get('/api/feedback', async (req) => {
    requirePermission(req, 'feedback');
    return { items: store.listFeedback(), newCount: store.feedbackNewCount() };
  });

  // Nur die Zahl der neuen, für den Hinweis in den Einstellungen (ohne die ganze Liste zu laden)
  app.get('/api/feedback/summary', async (req) => {
    requirePermission(req, 'feedback');
    return { newCount: store.feedbackNewCount() };
  });

  app.patch<{ Params: Params }>('/api/feedback/:id', async (req) => {
    requirePermission(req, 'feedback');
    return store.setFeedbackStatus(req.params.id, parseFeedbackStatus(body(req).status));
  });

  app.delete<{ Params: Params }>('/api/feedback/:id', async (req, reply) => {
    requirePermission(req, 'feedback');
    const { image, thumb } = store.deleteFeedback(req.params.id);
    if (image) deps.files?.remove(image);
    if (thumb) deps.files?.remove(thumb);
    return noContent(reply);
  });

  function sendImage(reply: FastifyReply, name: string | null, what: 'image' | 'thumb') {
    if (!name || !deps.files) throw new NotFoundError(what === 'image' ? t('Kein Bild vorhanden') : t('Kein Vorschaubild vorhanden'));
    const data = deps.files.read(name);
    return reply
      .header('content-type', sniffMime(data) ?? 'application/octet-stream')
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', 'inline')
      .header('cache-control', 'private, max-age=86400')
      .send(data);
  }
  app.get<{ Params: Params }>('/api/feedback/:id/image', async (req, reply) => {
    requirePermission(req, 'feedback');
    return sendImage(reply, store.feedbackFilesOf(req.params.id).image, 'image');
  });
  app.get<{ Params: Params }>('/api/feedback/:id/thumb', async (req, reply) => {
    requirePermission(req, 'feedback');
    return sendImage(reply, store.feedbackFilesOf(req.params.id).thumb, 'thumb');
  });
}
