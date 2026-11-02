import { describe, expect, it } from 'vitest';
import { ACTION_TTL_MS, createActionTokens, createNtfyPush } from '../src/ntfy.js';
import { combinePush, createNoPush, type PushGateway, type PushMessage } from '../src/push.js';

interface Sent {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
}

function fakeFetch(respond: (r: Sent) => Response | Promise<Response> = () => new Response('{}', { status: 200 })) {
  const sent: Sent[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    const r: Sent = {
      method: init.method ?? 'GET',
      url,
      headers: init.headers as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    sent.push(r);
    return respond(r);
  }) as unknown as typeof fetch;
  return { sent, fn };
}

const message = (extra: Partial<PushMessage> = {}): PushMessage => ({
  title: 'Bad putzen',
  body: 'Fällig: heute 10:00 · Haushalt',
  tag: 'stups-card-c1',
  group: 'stups',
  open: { cardId: 'c1' },
  level: 'time-sensitive',
  actions: [{ id: 'KANBAN_DONE:c1:2026-11-01T09:00:00.000Z', title: 'Erledigt' }],
  ...extra,
});

function setup(opts: { publicUrl?: string | null; config?: Partial<{ token: string; username: string; password: string }>; respond?: (r: Sent) => Response } = {}) {
  const f = fakeFetch(opts.respond);
  const warnings: string[] = [];
  let clock = Date.parse('2026-11-01T07:00:00Z');
  const tokens = createActionTokens({ secret: () => 'geheim', now: () => clock });
  const topics: Record<string, string | null> = { anna: 'anna-topf', ben: null };
  const push = createNtfyPush({
    config: { url: 'https://ntfy.example.org', ...opts.config },
    topicFor: (id) => topics[id] ?? null,
    publicUrl: opts.publicUrl === undefined ? 'https://stups.example.org' : opts.publicUrl,
    tokens,
    fetch: f.fn,
    log: { warn: (m) => warnings.push(m) },
  });
  return { push, sent: f.sent, warnings, tokens, advance: (ms: number) => (clock += ms) };
}

describe('Aktions-Token', () => {
  const make = (secret = 'geheim', now = () => 1_000_000) => createActionTokens({ secret: () => secret, now });

  it('trägt Person und Aktion und überlebt den Hin- und Rückweg', () => {
    const t = make();
    expect(t.verify(t.sign({ personId: 'p1', action: 'KANBAN_DONE:c1:x' }))).toEqual({ personId: 'p1', action: 'KANBAN_DONE:c1:x' });
  });

  it('läuft nach 14 Tagen ab', () => {
    let clock = 1_000_000;
    const t = createActionTokens({ secret: () => 's', now: () => clock });
    const token = t.sign({ personId: 'p', action: 'a' });
    clock += ACTION_TTL_MS - 1000;
    expect(t.verify(token)).not.toBeNull();
    clock += 2000;
    expect(t.verify(token)).toBeNull();
  });

  it('weist Verändertes ab: Inhalt, Signatur, anderes Geheimnis, Unsinn', () => {
    const t = make();
    const token = t.sign({ personId: 'p1', action: 'KANBAN_DONE:c1:x' });
    const [payload, sig] = token.split('.') as [string, string];

    const forged = Buffer.from(JSON.stringify(['p2', 'KANBAN_DONE:c1:x', 9_999_999_999])).toString('base64url');
    expect(t.verify(`${forged}.${sig}`)).toBeNull();
    expect(t.verify(`${payload}.${sig.slice(0, -2)}AA`)).toBeNull();
    expect(t.verify(`${payload}.`)).toBeNull();
    expect(make('anderes').verify(token)).toBeNull();
    for (const bad of ['', 'x', '...', undefined, null, 42, {}, 'a'.repeat(5000)]) expect(t.verify(bad)).toBeNull();
  });

  it('verlangt die richtige Form im Inhalt, auch bei gültiger Signatur', async () => {
    const { createHmac } = await import('node:crypto');
    const sign = (value: unknown) => {
      const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
      return `${payload}.${createHmac('sha256', 'geheim').update(payload).digest('base64url')}`;
    };
    const t = make();
    expect(t.verify(sign(['p', 'a', 2_000_000]))).toEqual({ personId: 'p', action: 'a' });
    expect(t.verify(sign({ personId: 'p' }))).toBeNull();
    expect(t.verify(sign(['p', 'a']))).toBeNull();
    expect(t.verify(sign([1, 'a', 2_000_000]))).toBeNull();
    expect(t.verify(sign(['p', 'a', '2000000']))).toBeNull();
  });
});

describe('NtfyPush', () => {
  it('veröffentlicht als JSON an die Adresse des Servers, mit Thema, Titel, Text, Priorität, Link und Kennung', async () => {
    const t = setup();
    expect(await t.push.send('anna', message())).toBe(true);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({
      method: 'POST',
      url: 'https://ntfy.example.org',
      body: {
        topic: 'anna-topf',
        title: 'Bad putzen',
        message: 'Fällig: heute 10:00 · Haushalt',
        priority: 4,
        sequence_id: 'stups-card-c1',
        click: 'https://stups.example.org/?card=c1',
      },
    });
  });

  it('Knöpfe rufen Stups mit einem Token zurück, das Person und Aktion trägt', async () => {
    const t = setup();
    await t.push.send('anna', message());
    const [button] = t.sent[0]!.body.actions;
    expect(button).toMatchObject({
      action: 'http',
      label: 'Erledigt',
      url: 'https://stups.example.org/api/push/action',
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      clear: true,
    });
    expect(t.tokens.verify(button.body)).toEqual({ personId: 'anna', action: 'KANBAN_DONE:c1:2026-11-01T09:00:00.000Z' });
  });

  it('drei Knöpfe bei einem Stups, mehr schneidet ntfy-Grenze ab', async () => {
    const t = setup();
    const four = ['A', 'B', 'C', 'D'].map((x) => ({ id: `K:${x}`, title: x }));
    await t.push.send('anna', message({ actions: four }));
    expect(t.sent[0]!.body.actions.map((a: any) => a.label)).toEqual(['A', 'B', 'C']);
  });

  it('Priorität folgt der Stufe: dringend 4, aktiv 3, leise 2, ohne Stufe 3', async () => {
    const t = setup();
    for (const level of ['time-sensitive', 'active', 'passive', undefined] as const) await t.push.send('anna', message({ level }));
    expect(t.sent.map((s) => s.body.priority)).toEqual([4, 3, 2, 3]);
  });

  it('ohne Karte öffnet der Link die Startseite', async () => {
    const t = setup();
    await t.push.send('anna', message({ open: {}, actions: undefined }));
    expect(t.sent[0]!.body.click).toBe('https://stups.example.org/');
    expect(t.sent[0]!.body.actions).toBeUndefined();
  });

  it('ohne öffentliche Adresse: weder Link noch Knöpfe, ein Hinweis im Protokoll (einmal)', async () => {
    const t = setup({ publicUrl: null });
    expect(await t.push.send('anna', message())).toBe(true);
    await t.push.send('anna', message());
    expect(t.sent[0]!.body.click).toBeUndefined();
    expect(t.sent[0]!.body.actions).toBeUndefined();
    expect(t.warnings).toHaveLength(1);
    expect(t.warnings[0]).toMatch(/STUPS_PUBLIC_URL/);
  });

  it('meldet sich mit Zugriffstoken (Bearer) oder Benutzer und Passwort (Basic) an', async () => {
    const bearer = setup({ config: { token: 'tk_abc' } });
    await bearer.push.send('anna', message());
    expect(bearer.sent[0]!.headers.authorization).toBe('Bearer tk_abc');

    const basic = setup({ config: { username: 'stups', password: 'pw' } });
    await basic.push.send('anna', message());
    expect(basic.sent[0]!.headers.authorization).toBe(`Basic ${Buffer.from('stups:pw').toString('base64')}`);

    const none = setup();
    await none.push.send('anna', message());
    expect(none.sent[0]!.headers.authorization).toBeUndefined();
  });

  it('ohne Thema ist niemand erreichbar und nichts wird gesendet', async () => {
    const t = setup();
    expect(t.push.canReach('anna')).toBe(true);
    expect(t.push.canReach('ben')).toBe(false);
    expect(t.push.canReach('niemand')).toBe(false);
    expect(await t.push.send('ben', message())).toBe(false);
    await t.push.clear('ben', 'x');
    expect(t.sent).toHaveLength(0);
  });

  it('Fehler: Ablehnung und nicht erreichbarer Server geben false zurück und stehen im Protokoll', async () => {
    const denied = setup({ respond: () => new Response('nein', { status: 403 }) });
    expect(await denied.push.send('anna', message())).toBe(false);
    expect(denied.warnings[0]).toMatch(/403.*Zugang prüfen/);

    const f = setup();
    const broken = createNtfyPush({
      config: { url: 'https://ntfy.example.org' },
      topicFor: () => 't',
      publicUrl: null,
      tokens: f.tokens,
      fetch: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
      log: { warn: (m) => f.warnings.push(m) },
    });
    expect(await broken.send('x', message())).toBe(false);
    expect(f.warnings.at(-1)).toMatch(/nicht erreichbar.*ECONNREFUSED/);
  });

  it('Entfernen löscht per Kennung, und ein Fehler dabei bleibt still', async () => {
    const t = setup();
    await t.push.clear('anna', 'stups-card-c1');
    expect(t.sent[0]).toMatchObject({ method: 'DELETE', url: 'https://ntfy.example.org/anna-topf/stups-card-c1' });

    const f = fakeFetch(() => {
      throw new Error('aus');
    });
    const quiet = createNtfyPush({ config: { url: 'https://n' }, topicFor: () => 't', publicUrl: null, tokens: setup().tokens, fetch: f.fn });
    await expect(quiet.clear('x', 'tag')).resolves.toBeUndefined();
  });

  it('ein Server unter einem Unterpfad bekommt den Pfad vor das Thema', async () => {
    const f = fakeFetch();
    const push = createNtfyPush({
      config: { url: 'https://example.org/ntfy' },
      topicFor: () => 't',
      publicUrl: null,
      tokens: setup().tokens,
      fetch: f.fn,
    });
    await push.send('x', message());
    await push.clear('x', 'tag');
    expect(f.sent.map((s) => s.url)).toEqual(['https://example.org/ntfy', 'https://example.org/ntfy/t/tag']);
  });
});

describe('Mehrere Push-Wege', () => {
  const gateway = (reach: string[], ok = true): PushGateway & { log: string[] } => {
    const log: string[] = [];
    return {
      log,
      canReach: (id) => reach.includes(id),
      send: async (id) => {
        log.push(`send:${id}`);
        return ok;
      },
      clear: async (id, tag) => void log.push(`clear:${id}:${tag}`),
    };
  };

  it('ohne Weg ist niemand erreichbar', async () => {
    const none = combinePush([]);
    expect(none.canReach('a')).toBe(false);
    expect(await none.send('a', message())).toBe(false);
    expect(await createNoPush().send('a', message())).toBe(false);
  });

  it('erreichbar über einen von beiden; gesendet nur über die, die die Person kennen', async () => {
    const ha = gateway(['a']);
    const ntfy = gateway(['a', 'b']);
    const both = combinePush([ha, ntfy]);
    expect(both.canReach('b')).toBe(true);
    expect(both.canReach('c')).toBe(false);
    expect(await both.send('b', message())).toBe(true);
    expect(ha.log).toEqual([]);
    expect(ntfy.log).toEqual(['send:b']);
    await both.send('a', message());
    expect(ha.log).toEqual(['send:a']);
  });

  it('angekommen, wenn ein Weg es geschafft hat', async () => {
    expect(await combinePush([gateway(['a'], false), gateway(['a'], true)]).send('a', message())).toBe(true);
    expect(await combinePush([gateway(['a'], false), gateway(['a'], false)]).send('a', message())).toBe(false);
  });

  it('Entfernen geht an alle Wege', async () => {
    const a = gateway(['x']);
    const b = gateway(['y']);
    await combinePush([a, b]).clear('x', 't');
    expect(a.log).toEqual(['clear:x:t']);
    expect(b.log).toEqual(['clear:x:t']);
  });
});
