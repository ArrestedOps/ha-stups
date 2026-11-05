import { describe, expect, it } from 'vitest';
import { deviceName, quietNow, reach } from '../src/lib/pushStand';

describe('Push-Stand', () => {
  it('Gerätename aus dem Dienst', () => {
    expect(deviceName('mobile_app_annas_iphone')).toBe('Annas iphone');
    expect(deviceName('notify.mobile_app_ben')).toBe('Ben');
  });

  it('erreichbar: Dienste, die Home Assistant kennt (oder unbekannt), plus ntfy-Thema', () => {
    expect(reach({ services: [{ service: 'a', exists: true }, { service: 'b', exists: null }] })).toEqual({ ok: 2, total: 2, missing: [] });
    expect(reach({ services: [{ service: 'a', exists: false }] })).toEqual({ ok: 0, total: 1, missing: ['a'] });
    expect(reach({ services: [{ service: 'a', exists: false }], ntfy: true })).toEqual({ ok: 1, total: 2, missing: ['a'] });
    expect(reach({ services: [], ntfy: false })).toEqual({ ok: 0, total: 0, missing: [] });
  });

  it('Ruhezeit über Mitternacht und am Tag, aus = nie', () => {
    const q = { start: '22:00', end: '07:00', off: false };
    expect(quietNow(q, 23 * 60)).toBe(true);
    expect(quietNow(q, 6 * 60 + 59)).toBe(true);
    expect(quietNow(q, 7 * 60)).toBe(false);
    expect(quietNow(q, 12 * 60)).toBe(false);
    expect(quietNow({ start: '13:00', end: '15:00', off: false }, 14 * 60)).toBe(true);
    expect(quietNow({ ...q, off: true }, 23 * 60)).toBe(false);
  });
});
