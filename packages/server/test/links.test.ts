import { describe, expect, it } from 'vitest';
import { detectLinkKind, fetchPageTitle, normalizeUrl, resolveMapsLink } from '../src/links.js';
import { ValidationError } from '../src/errors.js';

describe('detectLinkKind', () => {
  it.each([
    'https://maps.apple.com/?q=Brandenburger+Tor',
    'https://www.google.com/maps/search/?api=1&query=x',
    'https://maps.google.com/?q=x',
    'https://maps.google.de/maps?q=x',
    'https://goo.gl/maps/abc123',
    'https://maps.app.goo.gl/abc123',
  ])('recognizes %s as a maps link', (url) => {
    expect(detectLinkKind(url)).toBe('maps');
  });

  it.each(['https://www.wikipedia.org/', 'https://www.google.com/search?q=maps', 'https://example.com/maps'])(
    'treats %s as a web link',
    (url) => {
      expect(detectLinkKind(url)).toBe('web');
    },
  );
});

describe('normalizeUrl', () => {
  it('trims and accepts http and https', () => {
    expect(normalizeUrl('  https://example.com/a  ')).toBe('https://example.com/a');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com/');
  });

  it('adds https:// when the scheme is missing', () => {
    expect(normalizeUrl('example.com/x')).toBe('https://example.com/x');
  });

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com', '', 'nicht eine url'])(
    'rejects %s',
    (bad) => {
      expect(() => normalizeUrl(bad)).toThrow(ValidationError);
    },
  );
});

describe('fetchPageTitle', () => {
  const html = (title: string) =>
    (async () =>
      new Response(`<html><head><TITLE>\n  ${title}  \n</TITLE></head></html>`, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })) as unknown as typeof fetch;

  it('extracts and trims the title', async () => {
    expect(await fetchPageTitle('https://x.test', html('Hallo Welt'), 1000)).toBe('Hallo Welt');
  });

  it('decodes basic HTML entities', async () => {
    expect(await fetchPageTitle('https://x.test', html('Tom &amp; Jerry &#39;s'), 1000)).toBe(
      "Tom & Jerry 's",
    );
  });

  it('returns null for non-HTML responses', async () => {
    const f = (async () =>
      new Response('{}', { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    expect(await fetchPageTitle('https://x.test', f, 1000)).toBeNull();
  });

  it('returns null when the request fails', async () => {
    const f = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchPageTitle('https://x.test', f, 1000)).toBeNull();
  });

  it('returns null when the request takes too long', async () => {
    const f = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    expect(await fetchPageTitle('https://x.test', f, 30)).toBeNull();
  });

  it('returns null when there is no title', async () => {
    const f = (async () =>
      new Response('<html></html>', { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    expect(await fetchPageTitle('https://x.test', f, 1000)).toBeNull();
  });
});

describe('resolveMapsLink', () => {
  /** Baut ein fetch, das die angegebenen Weiterleitungen nacheinander liefert */
  const chain = (hops: Record<string, string>) => {
    const calls: string[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect(init?.redirect).toBe('manual');
      const next = hops[url];
      return next ? new Response(null, { status: 302, headers: { location: next } }) : new Response('', { status: 200 });
    }) as unknown as typeof fetch;
    return { fetchFn, calls };
  };

  it('löst den Google-Kurzlink auf und baut die Maps-URL mit Suchbegriff (so öffnet ihn die Maps-App)', async () => {
    const { fetchFn } = chain({
      'https://maps.app.goo.gl/FxYBCpFddGXcZb8D7?g_st=ic':
        'https://maps.google.com?q=Irrland+Logistics+(Bauhof),+Kevelaerer+Str.+35,+47624+Kevelaer-Twisteden&ftid=0x47c76761f2d9d5f5:0x761dec51517a749b&entry=gps',
    });

    const res = await resolveMapsLink('https://maps.app.goo.gl/FxYBCpFddGXcZb8D7?g_st=ic', fetchFn);

    const url = new URL(res!.url);
    expect(`${url.origin}${url.pathname}`).toBe('https://www.google.com/maps/search/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('query')).toBe('Irrland Logistics (Bauhof), Kevelaerer Str. 35, 47624 Kevelaer-Twisteden');
    expect(res!.title).toBe('Irrland Logistics (Bauhof)');
  });

  it('folgt mehreren Weiterleitungen und versteht /maps/place/<Name>', async () => {
    const { fetchFn, calls } = chain({
      'https://goo.gl/maps/abc': 'https://maps.app.goo.gl/xyz',
      'https://maps.app.goo.gl/xyz': 'https://www.google.com/maps/place/Brandenburger+Tor/@52.5163,13.3777,17z/data=!3m1',
    });
    const res = await resolveMapsLink('https://goo.gl/maps/abc', fetchFn);
    expect(calls).toHaveLength(2);
    expect(new URL(res!.url).searchParams.get('query')).toBe('Brandenburger Tor');
    expect(res!.title).toBe('Brandenburger Tor');
  });

  it('nimmt bei Koordinaten keinen Titel', async () => {
    const { fetchFn } = chain({ 'https://maps.app.goo.gl/c': 'https://maps.google.com/maps?q=51.5,6.2' });
    const res = await resolveMapsLink('https://maps.app.goo.gl/c', fetchFn);
    expect(new URL(res!.url).searchParams.get('query')).toBe('51.5,6.2');
    expect(res!.title).toBeNull();
  });

  it('lässt normale Links in Ruhe, ohne etwas abzurufen', async () => {
    const { fetchFn, calls } = chain({});
    expect(await resolveMapsLink('https://maps.apple.com/?q=x', fetchFn)).toBeNull();
    expect(await resolveMapsLink('https://www.google.com/maps/search/?api=1&query=x', fetchFn)).toBeNull();
    expect(await resolveMapsLink('https://example.com', fetchFn)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('gibt bei Fehlern, Sackgassen und Endlosschleifen null zurück', async () => {
    const boom = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await resolveMapsLink('https://maps.app.goo.gl/a', boom)).toBeNull();

    const dead = chain({ 'https://maps.app.goo.gl/a': 'https://example.com/nichts' });
    expect(await resolveMapsLink('https://maps.app.goo.gl/a', dead.fetchFn)).toBeNull();

    const loop = chain({ 'https://maps.app.goo.gl/a': 'https://maps.app.goo.gl/a' });
    expect(await resolveMapsLink('https://maps.app.goo.gl/a', loop.fetchFn)).toBeNull();
    expect(loop.calls.length).toBeLessThanOrEqual(5);
  });
});

