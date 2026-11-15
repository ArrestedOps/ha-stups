import { describe, expect, it } from 'vitest';
import { blockReason, variantName } from '../src/lib/foundGroups';
import type { EntityHistory } from '../src/lib/history';
import { deviceMet, deviceValue } from '../src/lib/watcher-devices';

const h = (current: string | null, kind: 'numeric' | 'state' = 'numeric'): EntityHistory => ({ status: 'ok', from: '', to: '', hours: 3, kind, states: [], points: [], fired: [], current, min: null, max: null });

describe('Gemeinsam einrichten: gilt die Bedingung beim aktuellen Wert?', () => {
  it('unter und über vergleichen die Zahl mit der Schwelle (Komma erlaubt)', () => {
    expect(deviceMet({ kind: 'below', to: '', value: '20' }, h('14'))).toBe(true);
    expect(deviceMet({ kind: 'below', to: '', value: '20' }, h('21'))).toBe(false);
    expect(deviceMet({ kind: 'below', to: '', value: '20,5' }, h('20.2'))).toBe(true);
    expect(deviceMet({ kind: 'above', to: '', value: '80' }, h('88'))).toBe(true);
  });
  it('Zustand: gleicht mit dem Zielzustand ab', () => {
    expect(deviceMet({ kind: 'state', to: 'on', value: '' }, h('on', 'state'))).toBe(true);
    expect(deviceMet({ kind: 'state', to: 'on', value: '' }, h('off', 'state'))).toBe(false);
    expect(deviceMet({ kind: 'state', to: '', value: '' }, h('off', 'state'))).toBeNull();
  });
  it('ohne Verlauf, mit unbekanntem Wert, bei Kalender und Vorhersage: keine Aussage', () => {
    expect(deviceMet({ kind: 'below', to: '', value: '20' }, null)).toBeNull();
    expect(deviceMet({ kind: 'below', to: '', value: '20' }, h('unavailable'))).toBeNull();
    expect(deviceMet({ kind: 'below', to: '', value: '' }, h('14'))).toBeNull();
    expect(deviceMet({ kind: 'calendar_event', to: '', value: '' }, h('14'))).toBeNull();
  });
  it('der Wert mit Einheit; ohne Wert ein Strich', () => {
    expect(deviceValue(h('14'), '%')).toBe('14 %');
    expect(deviceValue(null, '%')).toBe('–');
  });
});

describe('Gefunden: warum ein Treffer nicht zur Auswahl passt', () => {
  const title = (id: string) => (id === 'battery' ? 'Batterie schwach' : id);
  const a = { templateId: 'battery', variant: 'level' as const };
  it('passt er, gibt es keinen Grund', () => {
    expect(blockReason([], a, title)).toBeNull();
    expect(blockReason([a], { templateId: 'battery', variant: 'level' }, title)).toBeNull();
  });
  it('andere Vorlage: nennt die Art der Auswahl', () => {
    expect(blockReason([a], { templateId: 'bins', variant: 'default' }, title)).toBe('Andere Art als „Batterie schwach“');
  });
  it('dieselbe Vorlage, andere Fassung: nennt den anderen Auslöser', () => {
    expect(blockReason([{ templateId: 'washer', variant: 'power' }], { templateId: 'washer', variant: 'status' }, title)).toBe('Anderer Auslöser: Programmstatus');
    expect(variantName('power')).toBe('Leistung');
  });
});
