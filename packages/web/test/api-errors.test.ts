import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setUnauthorizedHandler } from '../src/lib/api';

function answer(status: number, body: unknown = {}) {
  return vi.fn(async () => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response);
}

let unauthorized: number;
beforeEach(() => {
  unauthorized = 0;
  setUnauthorizedHandler(() => void unauthorized++);
});
afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

describe('Abgelaufene Sitzung (401) führt zur Anmeldung, auch bei Uploads', () => {
  it('normale Anfragen', async () => {
    vi.stubGlobal('fetch', answer(401, { error: 'Bitte anmelden' }));
    await expect(api.boards()).rejects.toBeInstanceOf(ApiError);
    expect(unauthorized).toBe(1);
  });

  it('Anhang hochladen', async () => {
    vi.stubGlobal('fetch', answer(401, { error: 'Bitte anmelden' }));
    await expect(api.uploadAttachment('c1', new Blob(['x']), 'a.jpg', null)).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toBe(1);
  });

  it('Personenbild hochladen', async () => {
    vi.stubGlobal('fetch', answer(401, { error: 'Bitte anmelden' }));
    await expect(api.uploadAvatar('p1', new Blob(['x'], { type: 'image/webp' }))).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toBe(1);
  });

  it('andere Fehler lösen die Anmeldung nicht aus, Erfolg liefert die Daten', async () => {
    vi.stubGlobal('fetch', answer(413, { error: 'zu groß' }));
    await expect(api.uploadAttachment('c1', new Blob(['x']), 'a.jpg', null)).rejects.toMatchObject({ status: 413, message: 'zu groß' });
    expect(unauthorized).toBe(0);
    vi.stubGlobal('fetch', answer(201, { id: 'a1' }));
    await expect(api.uploadAttachment('c1', new Blob(['x']), 'a.jpg', null)).resolves.toEqual({ id: 'a1' });
  });

  it('ohne Verbindung: Status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await expect(api.uploadAvatar('p1', new Blob(['x']))).rejects.toMatchObject({ status: 0 });
  });
});
