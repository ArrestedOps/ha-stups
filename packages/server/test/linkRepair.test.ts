import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { repairShortMapsLinks } from '../src/linkRepair.js';
import { createStore, type Store } from '../src/store.js';

let store: Store;
let cardId: string;

beforeEach(() => {
  store = createStore(openDb(':memory:'));
  store.syncPeople([{ name: 'Rene' }]);
  const board = store.createBoard({ name: 'Ideen' });
  const column = store.getBoardView(board.id).columns[0]!;
  cardId = store.createCard(board.id, { columnId: column.id, title: 'Date' }, null).id;
});

const resolver = async (url: string) =>
  url.includes('maps.app.goo.gl')
    ? { url: 'https://www.google.com/maps/search/?api=1&query=Irrland', title: 'Irrland' }
    : null;

describe('repairShortMapsLinks', () => {
  it('ersetzt gespeicherte Kurzlinks und setzt den Ortsnamen, wenn noch kein eigener Titel da ist', async () => {
    const generic = store.addLink(cardId, { url: 'https://maps.app.goo.gl/abc?g_st=ic', title: 'Google Maps' });
    const own = store.addLink(cardId, { url: 'https://maps.app.goo.gl/def', title: 'Unser Ziel' });
    const plain = store.addLink(cardId, { url: 'https://maps.apple.com/?q=Tor' });

    const fixed = await repairShortMapsLinks(store, resolver);

    expect(fixed).toBe(2);
    const links = store.getCard(cardId).links;
    const by = (id: string) => links.find((l) => l.id === id)!;
    expect(by(generic.id)).toMatchObject({ url: 'https://www.google.com/maps/search/?api=1&query=Irrland', title: 'Irrland' });
    expect(by(own.id)).toMatchObject({ url: 'https://www.google.com/maps/search/?api=1&query=Irrland', title: 'Unser Ziel' });
    expect(by(plain.id).url).toBe('https://maps.apple.com/?q=Tor');
  });

  it('lässt Links unverändert, die sich nicht auflösen lassen, und macht beim zweiten Lauf nichts mehr', async () => {
    const link = store.addLink(cardId, { url: 'https://maps.app.goo.gl/kaputt' });

    expect(await repairShortMapsLinks(store, async () => null)).toBe(0);
    expect(store.getCard(cardId).links[0]!.url).toBe(link.url);

    expect(await repairShortMapsLinks(store, resolver)).toBe(1);
    expect(await repairShortMapsLinks(store, resolver)).toBe(0);
  });
});
