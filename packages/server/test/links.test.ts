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

/** Fake-Namensauflösung: bekannte Namen gehören öffentlichen Adressen, alles andere ist unbekannt */
const PUBLIC = '93.184.216.34';
const dnsOk = async () => [PUBLIC];
const dnsMap = (map: Record<string, string[]>) => async (host: string) => {
  const r = map[host];
  if (!r) throw new Error('ENOTFOUND');
  return r;
};

describe('fetchPageTitle', () => {
  const html = (title: string) =>
    (async () =>
      new Response(`<html><head><TITLE>\n  ${title}  \n</TITLE></head></html>`, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })) as unknown as typeof fetch;

  it('extracts and trims the title', async () => {
    expect(await fetchPageTitle('https://x.test', html('Hallo Welt'), 1000, dnsOk)).toBe('Hallo Welt');
  });

  it('decodes basic HTML entities', async () => {
    expect(await fetchPageTitle('https://x.test', html('Tom &amp; Jerry &#39;s'), 1000, dnsOk)).toBe(
      "Tom & Jerry 's",
    );
  });

  it('returns null for non-HTML responses', async () => {
    const f = (async () =>
      new Response('{}', { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    expect(await fetchPageTitle('https://x.test', f, 1000, dnsOk)).toBeNull();
  });

  it('returns null when the request fails', async () => {
    const f = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchPageTitle('https://x.test', f, 1000, dnsOk)).toBeNull();
  });

  it('returns null when the request takes too long', async () => {
    const f = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as unknown as typeof fetch;
    expect(await fetchPageTitle('https://x.test', f, 30, dnsOk)).toBeNull();
  });

  it('returns null when there is no title', async () => {
    const f = (async () =>
      new Response('<html></html>', { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    expect(await fetchPageTitle('https://x.test', f, 1000, dnsOk)).toBeNull();
  });
});

describe('fetchPageTitle: Schutz vor Abrufen ins eigene Netz (SSRF)', () => {
  const page = () => new Response('<title>Geheim</title>', { headers: { 'content-type': 'text/html' } });
  const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
  const spy = (handler: (url: string) => Response) => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(url);
      return handler(url);
    }) as unknown as typeof fetch;
    return { fetchFn, calls };
  };
  const resolve = dnsMap({ 'example.org': [PUBLIC], 'rebind.example': ['127.0.0.1'], 'evil.example': [PUBLIC] });

  it.each([
    'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/',
    'http://homeassistant:8123/', 'http://localhost:8123/', 'http://rebind.example/', 'ftp://example.org/', 'file:///etc/passwd',
  ])('ruft %s gar nicht erst ab', async (url) => {
    const { fetchFn, calls } = spy(page);
    expect(await fetchPageTitle(url, fetchFn, 1000, resolve)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('prüft jede Weiterleitung neu: Weiterleitung auf eine interne Adresse wird nicht abgerufen', async () => {
    const { fetchFn, calls } = spy((url) => (url === 'https://example.org/' ? redirect('http://169.254.169.254/latest/meta-data/') : page()));
    expect(await fetchPageTitle('https://example.org/', fetchFn, 1000, resolve)).toBeNull();
    expect(calls).toEqual(['https://example.org/']);
  });

  it('lehnt auch eine Weiterleitung auf einen Namen ab, der intern aufgelöst wird', async () => {
    const { fetchFn, calls } = spy((url) => (url === 'https://example.org/' ? redirect('http://rebind.example/') : page()));
    expect(await fetchPageTitle('https://example.org/', fetchFn, 1000, resolve)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('folgt höchstens drei Weiterleitungen', async () => {
    let n = 0;
    const { fetchFn, calls } = spy(() => redirect(`https://example.org/${++n}`));
    expect(await fetchPageTitle('https://example.org/', fetchFn, 1000, resolve)).toBeNull();
    expect(calls).toHaveLength(4); // der Abruf und drei Weiterleitungen
    const ok = spy((url) => (url.endsWith('/c') ? page() : redirect(url.endsWith('/') ? 'https://example.org/a' : url.endsWith('/a') ? 'https://example.org/b' : 'https://example.org/c')));
    expect(await fetchPageTitle('https://example.org/', ok.fetchFn, 1000, resolve)).toBe('Geheim');
  });

  it('ruft Weiterleitungen von Hand ab (redirect: manual), nie mit Zugangsdaten', async () => {
    const seen: RequestInit[] = [];
    const fetchFn = (async (_u: string, init: RequestInit) => {
      seen.push(init);
      return page();
    }) as unknown as typeof fetch;
    await fetchPageTitle('https://example.org/', fetchFn, 1000, resolve);
    expect(seen[0]!.redirect).toBe('manual');
    expect(await fetchPageTitle('https://nutzer:pw@example.org/', fetchFn, 1000, resolve)).toBeNull();
  });

  it('liest nur HTML und höchstens 200 KB', async () => {
    let read = 0;
    const big = new ReadableStream({
      pull(c) {
        read += 50_000;
        c.enqueue(new TextEncoder().encode('x'.repeat(50_000)));
      },
    });
    const fetchFn = (async () => new Response(big, { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch;
    expect(await fetchPageTitle('https://example.org/', fetchFn, 1000, resolve)).toBeNull();
    expect(read).toBeLessThanOrEqual(300_000);
  });
});

describe('resolveMapsLink: Schutz vor Abrufen ins eigene Netz', () => {
  it('folgt keiner Weiterleitung auf eine interne Adresse', async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:8123/api' } });
    }) as unknown as typeof fetch;
    expect(await resolveMapsLink('https://maps.app.goo.gl/abc', fetchFn, undefined, dnsOk)).toBeNull();
    expect(calls).toEqual(['https://maps.app.goo.gl/abc']);
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

    const res = await resolveMapsLink('https://maps.app.goo.gl/FxYBCpFddGXcZb8D7?g_st=ic', fetchFn, undefined, dnsOk);

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
    const res = await resolveMapsLink('https://goo.gl/maps/abc', fetchFn, undefined, dnsOk);
    expect(calls).toHaveLength(2);
    expect(new URL(res!.url).searchParams.get('query')).toBe('Brandenburger Tor');
    expect(res!.title).toBe('Brandenburger Tor');
  });

  it('nimmt bei Koordinaten keinen Titel', async () => {
    const { fetchFn } = chain({ 'https://maps.app.goo.gl/c': 'https://maps.google.com/maps?q=51.5,6.2' });
    const res = await resolveMapsLink('https://maps.app.goo.gl/c', fetchFn, undefined, dnsOk);
    expect(new URL(res!.url).searchParams.get('query')).toBe('51.5,6.2');
    expect(res!.title).toBeNull();
  });

  it('lässt normale Links in Ruhe, ohne etwas abzurufen', async () => {
    const { fetchFn, calls } = chain({});
    expect(await resolveMapsLink('https://maps.apple.com/?q=x', fetchFn, undefined, dnsOk)).toBeNull();
    expect(await resolveMapsLink('https://www.google.com/maps/search/?api=1&query=x', fetchFn, undefined, dnsOk)).toBeNull();
    expect(await resolveMapsLink('https://example.com', fetchFn, undefined, dnsOk)).toBeNull();
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

