import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { apiRoutes } from '../src/api.js';
import { openDb } from '../src/db.js';
import { NotFoundError } from '../src/errors.js';
import { registerLanguageHook } from '../src/i18n/hook.js';
import { currentLanguage, parseLanguage, setDefaultLanguage, t, tn, tx, useCatalog, withLanguage } from '../src/i18n/index.js';
import { ingressAuth } from '../src/ingress.js';
import { createStore } from '../src/store.js';

let restore: () => void = () => undefined;
afterEach(() => {
  restore();
  setDefaultLanguage('de');
});
const catalog = (c: Record<string, string | [string, string]>) => (restore = useCatalog(c));

describe('parseLanguage', () => {
  it('nach Gewichtung die erste bekannte Sprache', () => {
    expect(parseLanguage('de-CH, en;q=0.5')).toBe('de');
    expect(parseLanguage('en-GB,de;q=0.4')).toBe('en');
    expect(parseLanguage('de;q=0.3, en;q=0.9')).toBe('en');
    expect(parseLanguage('fr, en;q=0.5')).toBe('en');
    expect(parseLanguage('EN')).toBe('en');
    expect(parseLanguage('de')).toBe('de');
  });

  it('unbekannt, leer, kaputt: null, nie ein Fehler', () => {
    expect(parseLanguage('fr')).toBeNull();
    expect(parseLanguage('')).toBeNull();
    expect(parseLanguage(undefined)).toBeNull();
    expect(parseLanguage(';;;')).toBeNull();
    expect(parseLanguage('*')).toBeNull();
    expect(parseLanguage('de;q=abc')).toBe('de');
    expect(parseLanguage('de;q=0')).toBeNull();
    expect(parseLanguage('😀, ,,')).toBeNull();
  });
});

describe('t, tn, tx', () => {
  it('Platzhalter, Katalog und Rückfall auf Deutsch', () => {
    catalog({ 'Hallo {name}': 'Hello {name}', '{n} Aufgabe': ['{n} card', '{n} cards'], 'Kontext|Alle': 'Every' });
    withLanguage('en', () => {
      expect(t('Hallo {name}', { name: 'Anna' })).toBe('Hello Anna');
      expect(t('Noch nicht übersetzt')).toBe('Noch nicht übersetzt');
      expect(tn('{n} Aufgabe', '{n} Aufgaben', 1)).toBe('1 card');
      expect(tn('{n} Aufgabe', '{n} Aufgaben', 2)).toBe('2 cards');
      expect(tx('Kontext', 'Alle')).toBe('Every');
    });
    withLanguage('de', () => {
      expect(t('Hallo {name}', { name: 'Anna' })).toBe('Hallo Anna');
      expect(tn('{n} Aufgabe', '{n} Aufgaben', 2)).toBe('2 Aufgaben');
      expect(tx('Kontext', 'Alle')).toBe('Alle');
    });
  });

  it('Eingaben mit Klammern werden nicht ein zweites Mal ersetzt', () => {
    catalog({ 'Hallo {name}': 'Hello {name}' });
    for (const lang of ['de', 'en'] as const) {
      withLanguage(lang, () => expect(t('Hallo {name}', { name: '{x}' })).toBe(lang === 'de' ? 'Hallo {x}' : 'Hello {x}'));
    }
  });

  it('withLanguage gilt auch für asynchrone Arbeit; außerhalb gilt die Standardsprache', async () => {
    setDefaultLanguage('de');
    const inside = await withLanguage('en', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return currentLanguage();
    });
    expect(inside).toBe('en');
    expect(currentLanguage()).toBe('de');
  });
});

describe('Sprache je Anfrage', () => {
  async function app(withHook = true) {
    const f = Fastify();
    if (withHook) registerLanguageHook(f);
    f.setErrorHandler((err: Error & { status?: number }, _req, reply) => reply.code(err.status ?? 500).send({ error: err.message }));
    f.get('/boom', async () => {
      throw new NotFoundError();
    });
    return f;
  }

  it('X-Stups-Language gewinnt vor Accept-Language, ohne Angabe gilt die Standardsprache', async () => {
    const f = await app();
    setDefaultLanguage('de');
    const get = async (headers: Record<string, string>) => (await f.inject({ url: '/boom', headers })).json().error;
    expect(await get({})).toBe('Nicht gefunden');
    expect(await get({ 'x-stups-language': 'en' })).toBe('Not found');
    expect(await get({ 'accept-language': 'en-GB,en;q=0.9' })).toBe('Not found');
    expect(await get({ 'x-stups-language': 'de', 'accept-language': 'en' })).toBe('Nicht gefunden');
    expect(await get({ 'accept-language': 'fr' })).toBe('Nicht gefunden');
    setDefaultLanguage('en');
    expect(await get({})).toBe('Not found');
  });

  it('die API trägt den Haken selbst ein (Fehlermeldungen und 500)', async () => {
    const f = Fastify();
    const store = createStore(openDb(':memory:'));
    store.setAccessMode('selected');
    await f.register(ingressAuth, { enforceIp: false });
    await f.register(apiRoutes, { store, directory: { isAdmin: async () => false, persons: async () => [] } });
    const headers = { 'x-remote-user-id': 'u', 'x-remote-user-name': 'u', 'x-remote-user-display-name': 'U' };
    expect((await f.inject({ url: '/api/boards', headers: { ...headers, 'x-stups-language': 'en' } })).json().error).toMatch(/^No access/);
    expect((await f.inject({ url: '/api/boards', headers })).json().error).toMatch(/^Kein Zugriff/);
  });
});
