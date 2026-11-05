import { describe, expect, it } from 'vitest';
import { effectiveInsets, insetsFromMessage, parseInset, startSafeArea, SUBSCRIBE_MESSAGE, type SafeAreaEnv } from '../src/lib/haSafeArea';

describe('parseInset', () => {
  it('nimmt Pixelwerte als Text oder Zahl, alles andere ist 0', () => {
    expect(parseInset('34px')).toBe(34);
    expect(parseInset('47.5px')).toBe(47.5);
    expect(parseInset(' 20px ')).toBe(20);
    expect(parseInset('0px')).toBe(0);
    expect(parseInset(12)).toBe(12);
    for (const bad of ['', 'env(safe-area-inset-bottom)', 'auto', '-5px', null, undefined, NaN, Infinity, {}, [], '12em']) expect(parseInset(bad), String(bad)).toBe(0);
  });
  it('unsinnig große Werte werden nicht übernommen', () => {
    expect(parseInset('900px')).toBe(0);
  });
});

describe('insetsFromMessage', () => {
  const msg = (extra: object) => ({ type: 'home-assistant/properties', narrow: true, route: {}, ...extra });
  it('liest safeAreaInsets aus der Antwort von Home Assistant', () => {
    expect(insetsFromMessage(msg({ safeAreaInsets: { top: '47px', right: '0px', bottom: '34px', left: '0px' } }))).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
  });
  it('fehlende Schlüssel sind 0; andere Nachrichten und Fehlformen ergeben null', () => {
    expect(insetsFromMessage(msg({ safeAreaInsets: { bottom: '34px' } }))).toEqual({ top: 0, right: 0, bottom: 34, left: 0 });
    expect(insetsFromMessage(msg({}))).toBeNull(); // ältere Version ohne safeAreaInsets
    expect(insetsFromMessage({ type: 'something-else', safeAreaInsets: { bottom: '34px' } })).toBeNull();
    for (const bad of [null, undefined, 'text', 5, [], { type: 'home-assistant/properties', safeAreaInsets: 'x' }]) expect(insetsFromMessage(bad), String(bad)).toBeNull();
  });
});

describe('effectiveInsets (nichts doppelt zählen)', () => {
  const raw = { top: 47, right: 0, bottom: 34, left: 0 };
  it('iframe füllt den Bildschirm: die Werte von Home Assistant gelten ganz', () => {
    expect(effectiveInsets(raw, { top: 0, bottom: 800 }, 800)).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
  });
  it('Home Assistant hat oben schon eine Leiste (iframe beginnt darunter): oben bleibt nichts übrig', () => {
    expect(effectiveInsets(raw, { top: 87, bottom: 800 }, 800).top).toBe(0);
  });
  it('liegt der iframe nur zum Teil in der Zone, zählt nur der Rest', () => {
    expect(effectiveInsets(raw, { top: 20, bottom: 790 }, 800)).toMatchObject({ top: 27, bottom: 24 });
  });
  it('iframe endet über dem Rand: unten nichts mehr abziehen', () => {
    expect(effectiveInsets(raw, { top: 0, bottom: 700 }, 800).bottom).toBe(0);
  });
  it('ohne Lage des iframes (anderer Ursprung) gelten die Werte unverändert', () => {
    expect(effectiveInsets(raw, null, null)).toEqual(raw);
  });
});

/** Ersatz für Fenster und Seitenwurzel: nur das, was startSafeArea braucht (die Testumgebung hat kein DOM) */
function fake(opts: { embedded: boolean; frame?: { top: number; bottom: number } | null; parentHeight?: number | null }) {
  const posted: unknown[] = [];
  const listeners: ((e: { source: unknown; data: unknown }) => void)[] = [];
  const props = new Map<string, string>();
  const classes = new Set<string>();
  const parent = { postMessage: (m: unknown) => void posted.push(m) };
  const env: SafeAreaEnv = {
    embedded: opts.embedded,
    parent,
    frameRect: () => opts.frame ?? null,
    parentHeight: () => opts.parentHeight ?? null,
    postToParent: (m) => parent.postMessage(m),
    listen: (fn) => void listeners.push(fn as never),
    onResize: () => undefined,
    setVar: (k, v) => void props.set(k, v),
    addClass: (c) => void classes.add(c),
  };
  const reply = (insets: object, source: unknown = parent) => listeners.forEach((l) => l({ source, data: { type: 'home-assistant/properties', safeAreaInsets: insets } }));
  return { env, posted, props, classes, reply, parent };
}

describe('startSafeArea', () => {
  it('meldet sich bei Home Assistant mit handleSafeArea an', () => {
    const f = fake({ embedded: true });
    startSafeArea(f.env);
    expect(f.posted).toEqual([SUBSCRIBE_MESSAGE]);
    expect(SUBSCRIBE_MESSAGE).toEqual({ type: 'home-assistant/subscribe-properties', handleSafeArea: true });
  });
  it('nicht eingebettet: nichts melden, nichts lauschen', () => {
    const f = fake({ embedded: false });
    startSafeArea(f.env);
    expect(f.posted).toEqual([]);
    f.reply({ bottom: '34px' });
    expect(f.props.size).toBe(0);
  });
  it('die Antwort setzt die Abstände und das Kennzeichen „safe-managed“', () => {
    const f = fake({ embedded: true });
    startSafeArea(f.env);
    f.reply({ top: '47px', right: '0px', bottom: '34px', left: '0px' });
    expect(f.props.get('--safe-top')).toBe('47px');
    expect(f.props.get('--safe-bottom')).toBe('34px');
    expect(f.classes.has('safe-managed')).toBe(true);
  });
  it('nur Antworten des übergeordneten Fensters zählen', () => {
    const f = fake({ embedded: true });
    startSafeArea(f.env);
    f.reply({ bottom: '34px' }, { other: true });
    expect(f.props.size).toBe(0);
    expect(f.classes.size).toBe(0);
  });
  it('liegt der iframe unter einer Leiste von Home Assistant, wird oben nichts doppelt gezählt', () => {
    const f = fake({ embedded: true, frame: { top: 87, bottom: 800 }, parentHeight: 800 });
    startSafeArea(f.env);
    f.reply({ top: '47px', bottom: '34px' });
    expect(f.props.get('--safe-top')).toBe('0px');
    expect(f.props.get('--safe-bottom')).toBe('34px');
  });
  it('eine spätere Antwort (Drehen des Geräts) aktualisiert die Werte', () => {
    const f = fake({ embedded: true });
    startSafeArea(f.env);
    f.reply({ top: '47px', bottom: '34px' });
    f.reply({ top: '0px', bottom: '21px' });
    expect(f.props.get('--safe-top')).toBe('0px');
    expect(f.props.get('--safe-bottom')).toBe('21px');
  });
});
