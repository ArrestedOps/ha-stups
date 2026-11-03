import { randomUUID } from 'node:crypto';
import { NotFoundError, ValidationError } from '../errors.js';
import { t } from '../i18n/index.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import { HOUSE_KINDS, type HouseChannel, type HouseChannelType, type HouseKind, type HousePending, type HouseWhenAway, type Row } from './types.js';
import { cleanText, isPosInt } from './validate.js';

const ENTITY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const DOMAIN_OF: Record<HouseChannelType, string> = { speak: 'media_player', light: 'light' };
const TTS_KEY = 'houseTts';

/** Haus-Kanäle: Ansage und Lampe je Person, die Warteschlange für „warten bis zur Heimkehr" und der Sprachdienst */
export function createHouse(c: Ctx, late: unknown) {
  const s = late as Internals;
  const { iso, one, all, run } = c;
  const { userRow, getSetting, putRawSetting } = lazy(s, ['userRow', 'getSetting', 'putRawSetting'] as const);

  function parseKinds(raw: string | null | undefined): HouseKind[] {
    try {
      const list = JSON.parse(raw ?? '[]') as unknown;
      return Array.isArray(list) ? HOUSE_KINDS.filter((k) => list.includes(k)) : [];
    } catch {
      return [];
    }
  }

  const toChannel = (r: Row): HouseChannel => ({
    id: r.id,
    userId: r.user_id,
    type: r.type,
    name: r.name,
    entityId: r.entity_id,
    enabled: r.enabled === 1,
    kinds: parseKinds(r.kinds),
    whenAway: r.when_away,
    waitMinutes: r.wait_minutes,
    volume: typeof r.volume === 'number' ? r.volume : null,
    createdAt: r.created_at,
  });

  const toPending = (r: Row): HousePending => ({
    id: r.id,
    channelId: r.channel_id,
    kind: r.kind,
    spoken: r.spoken,
    cardId: r.card_id ?? null,
    nudgeId: r.nudge_id ?? null,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  });

  // Nur Kanäle von Personen: Wer aus der Liste entfernt wird, hat keine Kanäle mehr, und kommt er zurück, gelten sie wieder
  const CHANNELS = `select h.* from house_channels h join users u on u.id = h.user_id and u.is_person = 1`;

  const houseChannels = (): HouseChannel[] => all(`${CHANNELS} order by h.created_at, h.rowid`).map(toChannel);
  const houseChannelsOf = (userId: string): HouseChannel[] => all(`${CHANNELS} where h.user_id = ? order by h.created_at, h.rowid`, userId).map(toChannel);
  const houseChannel = (id: string): HouseChannel | null => {
    const r = one(`${CHANNELS} where h.id = ?`, id);
    return r ? toChannel(r) : null;
  };

  function parseEntity(raw: unknown, type: HouseChannelType): string {
    if (typeof raw !== 'string' || !ENTITY_RE.test(raw.trim())) throw new ValidationError(t('Die Entität fehlt oder hat kein gültiges Format (zum Beispiel media_player.kueche)'));
    const entityId = raw.trim();
    if (!entityId.startsWith(`${DOMAIN_OF[type]}.`)) {
      throw new ValidationError(t('Die Entität passt nicht zum Typ des Kanals (erlaubt: {domain})', { domain: DOMAIN_OF[type] }));
    }
    return entityId;
  }

  function parseKindList(raw: unknown): HouseKind[] {
    if (!Array.isArray(raw) || raw.some((k) => !HOUSE_KINDS.includes(k as HouseKind))) {
      throw new ValidationError(t('Die Arten müssen aus „nudge", „due" und „watcher" bestehen'));
    }
    return HOUSE_KINDS.filter((k) => raw.includes(k));
  }

  function parseWhenAway(raw: unknown): HouseWhenAway {
    if (raw !== 'skip' && raw !== 'wait') throw new ValidationError(t('„Wenn nicht zu Hause" muss „skip" oder „wait" sein'));
    return raw;
  }

  function parseWait(raw: unknown): number {
    if (!isPosInt(raw) || raw < 1 || raw > 1440) throw new ValidationError(t('Die Frist muss eine ganze Zahl von 1 bis 1440 Minuten sein'));
    return raw;
  }

  function parseVolume(raw: unknown, type: HouseChannelType): number | null {
    if (raw === null || raw === undefined) return null;
    if (type !== 'speak') throw new ValidationError(t('Die Lautstärke gibt es nur bei einer Ansage'));
    if (!isPosInt(raw) || raw < 10 || raw > 100) throw new ValidationError(t('Die Lautstärke muss eine ganze Zahl von 10 bis 100 sein'));
    return raw;
  }

  function parseEnabled(raw: unknown): boolean {
    if (typeof raw !== 'boolean') throw new ValidationError(t('„An" muss wahr oder falsch sein'));
    return raw;
  }

  function addHouseChannel(userId: string, input: Record<string, unknown>): HouseChannel {
    const user = userRow(userId);
    if (user.is_person !== 1) throw new NotFoundError(t('Person nicht gefunden'));
    if (input.type !== 'speak' && input.type !== 'light') throw new ValidationError(t('Der Typ muss „speak" oder „light" sein'));
    const type: HouseChannelType = input.type;
    const entityId = parseEntity(input.entityId, type);
    const id = randomUUID();
    run(
      `insert into house_channels (id, user_id, type, name, entity_id, enabled, kinds, when_away, wait_minutes, volume, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      userId,
      type,
      input.name === undefined || input.name === null || input.name === '' ? entityId : cleanText(input.name, t('Der Name'), 60),
      entityId,
      input.enabled === undefined ? 1 : parseEnabled(input.enabled) ? 1 : 0,
      JSON.stringify(input.kinds === undefined ? ['nudge'] : parseKindList(input.kinds)),
      input.whenAway === undefined ? 'skip' : parseWhenAway(input.whenAway),
      input.waitMinutes === undefined ? 120 : parseWait(input.waitMinutes),
      parseVolume(input.volume, type),
      iso(),
    );
    return houseChannel(id)!;
  }

  function updateHouseChannel(id: string, patch: Record<string, unknown>): HouseChannel {
    const current = houseChannel(id);
    if (!current) throw new NotFoundError(t('Kanal nicht gefunden'));
    const next = {
      name: patch.name === undefined ? current.name : cleanText(patch.name, t('Der Name'), 60),
      entityId: patch.entityId === undefined ? current.entityId : parseEntity(patch.entityId, current.type),
      enabled: patch.enabled === undefined ? current.enabled : parseEnabled(patch.enabled),
      kinds: patch.kinds === undefined ? current.kinds : parseKindList(patch.kinds),
      whenAway: patch.whenAway === undefined ? current.whenAway : parseWhenAway(patch.whenAway),
      waitMinutes: patch.waitMinutes === undefined ? current.waitMinutes : parseWait(patch.waitMinutes),
      volume: patch.volume === undefined ? current.volume : parseVolume(patch.volume, current.type),
    };
    run(
      `update house_channels set name = ?, entity_id = ?, enabled = ?, kinds = ?, when_away = ?, wait_minutes = ?, volume = ? where id = ?`,
      next.name,
      next.entityId,
      next.enabled ? 1 : 0,
      JSON.stringify(next.kinds),
      next.whenAway,
      next.waitMinutes,
      next.volume,
      id,
    );
    return houseChannel(id)!;
  }

  function removeHouseChannel(id: string): void {
    if (!houseChannel(id)) throw new NotFoundError(t('Kanal nicht gefunden'));
    run('delete from house_channels where id = ?', id);
  }

  // ---------- Warteschlange ----------

  function addHousePending(channelId: string, item: { kind: HouseKind; spoken: string; cardId: string | null; nudgeId: string | null }, expiresAt: string): HousePending {
    const id = randomUUID();
    run(
      `insert into house_pending (id, channel_id, kind, spoken, card_id, nudge_id, expires_at, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      channelId,
      item.kind,
      item.spoken,
      item.cardId,
      item.nudgeId,
      expiresAt,
      iso(),
    );
    return toPending(one('select * from house_pending where id = ?', id)!);
  }

  /** Was für diese Person auf die Heimkehr wartet, der Reihe nach */
  const housePendingOf = (userId: string): HousePending[] =>
    all(
      `select p.* from house_pending p join house_channels h on h.id = p.channel_id join users u on u.id = h.user_id and u.is_person = 1
       where h.user_id = ? order by p.created_at, p.rowid`,
      userId,
    ).map(toPending);

  const housePendingAll = (): HousePending[] => all('select * from house_pending order by created_at, rowid').map(toPending);

  const removeHousePending = (id: string): void => void run('delete from house_pending where id = ?', id);

  /** Löscht, was bis `nowIso` abgelaufen ist; gibt zurück, wie viele es waren */
  const purgeHousePending = (nowIso: string): number => Number(run('delete from house_pending where expires_at <= ?', nowIso).changes);

  // ---------- Sprachdienst ----------

  const getHouseTts = (): string | null => getSetting(TTS_KEY);

  function setHouseTts(entityId: string | null): void {
    if (entityId === null || entityId === '') {
      putRawSetting(TTS_KEY, null);
      return;
    }
    if (typeof entityId !== 'string' || !ENTITY_RE.test(entityId) || !entityId.startsWith('tts.')) {
      throw new ValidationError(t('Der Sprachdienst muss eine tts-Entität sein (zum Beispiel tts.piper)'));
    }
    putRawSetting(TTS_KEY, entityId);
  }

  return {
    houseChannels,
    houseChannelsOf,
    houseChannel,
    addHouseChannel,
    updateHouseChannel,
    removeHouseChannel,
    addHousePending,
    housePendingOf,
    housePendingAll,
    removeHousePending,
    purgeHousePending,
    getHouseTts,
    setHouseTts,
  };
}
