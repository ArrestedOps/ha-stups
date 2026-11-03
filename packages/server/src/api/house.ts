import type { FastifyInstance } from 'fastify';
import { ConflictError, NotFoundError, ValidationError } from '../errors.js';
import type { HaState } from '../ha.js';
import type { HouseResult } from '../house.js';
import { t } from '../i18n/index.js';
import { type ApiKit, type Params } from './kit.js';

/** Haus-Kanäle: Ansage und Lampe je Person (nur Administratoren, nur mit Verbindung zu Home Assistant) */
export function registerHouseRoutes(app: FastifyInstance, k: ApiKit): void {
  const { deps, store, body, requireAdmin, noContent } = k;

  const house = () => {
    if (!deps.house) throw new NotFoundError(t('Haus-Kanäle gibt es nur mit Home Assistant'));
    return deps.house;
  };

  async function states(): Promise<HaState[]> {
    try {
      if (deps.ha?.getStates) return await deps.ha.getStates();
    } catch {
      /* wie „nicht verbunden" behandeln */
    }
    throw new ConflictError(t('Keine Verbindung zu Home Assistant'));
  }

  /** Die Entität muss es in Home Assistant geben (Format und Art prüft der Datenteil) */
  async function requireEntity(entityId: unknown): Promise<void> {
    if (typeof entityId !== 'string') return; // das meldet der Datenteil
    if (!(await states()).some((s) => s.entity_id === entityId)) {
      throw new ValidationError(t('Die Entität {entity} gibt es in Home Assistant nicht', { entity: entityId }));
    }
  }

  /** Ergebnis für die Oberfläche: mit einem Text in der Sprache der Anfrage statt nur der Kennung */
  function describe(r: HouseResult | null) {
    if (!r) return null;
    if (!r.error) return r;
    const message = r.error.code === 'no_tts' ? t('Es ist noch kein Sprachdienst gewählt (Personen & Zugriff › Haus)') : t('Home Assistant hat den Aufruf nicht angenommen: {detail}', { detail: r.error.detail });
    return { ...r, error: { ...r.error, message } };
  }

  app.get('/api/house/channels', async (req) => {
    requireAdmin(req);
    const h = house();
    const channels = store.houseChannels();
    // Personen mit Kanal, denen sich keine Person in Home Assistant zuordnen lässt: dort gilt „zu Hause" immer (Hinweis in der Oberfläche)
    const owners = await h.entityOwners().catch(() => new Map<string, string>());
    const matched = new Set(owners.values());
    const unmatched = owners.size === 0 ? [] : [...new Set(channels.map((c) => c.userId))].filter((id) => !matched.has(id));
    return { channels: channels.map((c) => ({ ...c, status: describe(h.push.status(c.id)) })), tts: store.getHouseTts(), unmatched };
  });

  app.post('/api/house/channels', async (req, reply) => {
    requireAdmin(req);
    const h = house();
    const b = body(req);
    await requireEntity(b.entityId);
    const channel = store.addHouseChannel(typeof b.userId === 'string' ? b.userId : '', b);
    await h.sync();
    return reply.code(201).send(channel);
  });

  app.patch<{ Params: Params }>('/api/house/channels/:id', async (req) => {
    requireAdmin(req);
    const h = house();
    const b = body(req);
    if (b.entityId !== undefined) await requireEntity(b.entityId);
    const channel = store.updateHouseChannel(req.params.id, b);
    await h.sync();
    return channel;
  });

  app.delete<{ Params: Params }>('/api/house/channels/:id', async (req, reply) => {
    requireAdmin(req);
    const h = house();
    store.removeHouseChannel(req.params.id);
    await h.sync();
    return noContent(reply);
  });

  app.post<{ Params: Params }>('/api/house/channels/:id/test', async (req) => {
    requireAdmin(req);
    const result = await house().push.test(req.params.id);
    if (!result) throw new NotFoundError(t('Kanal nicht gefunden'));
    return describe(result);
  });

  app.get('/api/house/entities', async (req) => {
    requireAdmin(req);
    house();
    const list = await states();
    const pick = (domain: string) =>
      list
        .filter((s) => s.entity_id.startsWith(`${domain}.`))
        .map((s) => ({ entityId: s.entity_id, name: typeof s.attributes?.friendly_name === 'string' ? (s.attributes.friendly_name as string) : s.entity_id }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return { speakers: pick('media_player'), lights: pick('light'), tts: pick('tts') };
  });

  app.put('/api/house/settings', async (req) => {
    requireAdmin(req);
    house();
    const b = body(req);
    if (b.tts !== null) await requireEntity(b.tts);
    store.setHouseTts(b.tts === null ? null : (b.tts as string));
    return { tts: store.getHouseTts() };
  });
}
