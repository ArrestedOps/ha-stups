import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isPublicIp } from '../src/safe-fetch.js';

describe('isPublicIp', () => {
  it.each([
    '127.0.0.1', '127.1.2.3', '10.0.0.1', '10.255.255.255', '192.168.1.5', '172.16.0.1', '172.31.255.255', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1',
    '::ffff:169.254.169.254', '64:ff9b::7f00:1', '2001:db8::1', '2002:7f00:1::1', 'fec0::1', 'not-an-ip', '',
  ])('lehnt %s ab', (ip) => expect(isPublicIp(ip)).toBe(false));

  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '172.15.255.255', '1.1.1.1', '2606:4700:4700::1111', '2a00:1450:4001::200e', '::ffff:8.8.8.8'])(
    'erlaubt %s',
    (ip) => expect(isPublicIp(ip)).toBe(true),
  );
});

describe('assertPublicUrl', () => {
  const dns = (map: Record<string, string[]>) => async (host: string) => {
    const r = map[host];
    if (!r) throw new Error('ENOTFOUND');
    return r;
  };
  const resolve = dns({ 'example.org': ['93.184.216.34'], 'evil.example': ['127.0.0.1'], 'mixed.example': ['93.184.216.34', '10.0.0.5'] });

  it('erlaubt eine öffentliche Adresse', async () => {
    await expect(assertPublicUrl('https://example.org/x', resolve)).resolves.toEqual(['93.184.216.34']);
    await expect(assertPublicUrl('http://[2606:4700:4700::1111]/', resolve)).resolves.toBeTruthy();
  });

  it.each([
    'http://127.0.0.1/', 'http://10.1.2.3:8080/', 'http://192.168.0.10/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/',
    'http://homeassistant:8123/', 'http://homeassistant.local:8123/', 'http://localhost/', 'http://foo.localhost/', 'http://nas.lan/',
    'http://evil.example/', 'http://mixed.example/', 'http://unbekannt.example/', 'ftp://example.org/', 'file:///etc/passwd',
    'https://user:pw@example.org/', 'http://2130706433/', 'http://0x7f.1/', 'http://[::ffff:127.0.0.1]/',
  ])('lehnt %s ab', async (u) => {
    await expect(assertPublicUrl(u, resolve)).rejects.toThrow();
  });
});

describe('pinnedFetch (echte Verbindung)', () => {
  it('verbindet nie an eine interne Adresse, auch nicht per DNS-Rebinding (erst öffentlich, dann intern)', async () => {
    const http = await import('node:http');
    let hits = 0;
    const server = http.createServer((_q, r) => {
      hits++;
      r.end('geheim');
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const port = (server.address() as { port: number }).port;
    try {
      const { pinnedFetch } = await import('../src/safe-fetch.js');
      await expect(pinnedFetch(async () => ['127.0.0.1'])(`http://127.0.0.1:${port}/`)).rejects.toThrow();
      let calls = 0;
      const rebinding = async () => (++calls === 1 ? ['93.184.216.34'] : ['127.0.0.1']); // Prüfung: öffentlich, Verbindung: intern
      await expect(pinnedFetch(rebinding)(`http://rebind.example:${port}/`)).rejects.toThrow();
      expect(hits).toBe(0);
    } finally {
      server.close();
    }
  });
});
