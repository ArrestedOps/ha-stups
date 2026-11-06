import { describe, expect, it } from 'vitest';
import { deviceLabel, withDevice } from '../src/device-names.js';

describe('Gerätename aus dem Friendly Name', () => {
  it('entfernt Batterie-Endungen der Sensornamen, ohne sie zu verdoppeln', () => {
    expect(deviceLabel('iPhone Rene Battery Level', 'sensor.iphone_rene_battery_level')).toBe('iPhone Rene');
    expect(deviceLabel('iPhone Rene Battery State', 'sensor.iphone_rene_battery_state')).toBe('iPhone Rene');
    expect(deviceLabel('Bad Fenster Batterie', 'sensor.bad_batterie')).toBe('Bad Fenster');
    expect(deviceLabel('Küche Rauchmelder Batteriestand', 'sensor.x')).toBe('Küche Rauchmelder');
    expect(deviceLabel('Flur Tür battery', 'sensor.x')).toBe('Flur Tür');
  });

  it('entfernt auch Mess-Endungen wie Leistung oder Power, mehrere hintereinander', () => {
    expect(deviceLabel('Waschmaschine Leistung', 'sensor.w')).toBe('Waschmaschine');
    expect(deviceLabel('Steckdose Trockner Power', 'sensor.t')).toBe('Steckdose Trockner');
    expect(deviceLabel('Bad Thermostat Battery Level state', 'sensor.x')).toBe('Bad Thermostat');
  });

  it('lässt Trennzeichen am Ende weg', () => {
    expect(deviceLabel('Tür - Batterie', 'sensor.x')).toBe('Tür');
    expect(deviceLabel('Tür: Battery Level', 'sensor.x')).toBe('Tür');
  });

  it('wird nie leer: besteht der Name nur aus der Endung, bleibt er stehen', () => {
    expect(deviceLabel('Battery', 'sensor.battery')).toBe('Battery');
    expect(deviceLabel('Batterie Level', 'sensor.x')).toBe('Batterie Level');
    expect(deviceLabel('   ', 'sensor.x')).toBe('x');
  });

  it('ohne Friendly Name dient die Entitäts-ID, lesbar gemacht', () => {
    expect(deviceLabel(undefined, 'sensor.flur_tuer_battery_level')).toBe('flur tuer');
    expect(deviceLabel(null, 'binary_sensor.kueche_fenster')).toBe('kueche fenster');
    expect(deviceLabel('', 'sensor.battery')).toBe('battery');
  });

  it('ein „Friendly Name", der selbst eine Entitäts-ID ist (Home Assistant ohne Namen), wird wie die ID gelesen', () => {
    expect(deviceLabel('sensor.flur_tuer_batterie_ladestand', 'sensor.flur_tuer_batterie_ladestand')).toBe('flur tuer');
    expect(deviceLabel('sensor.flur_schliesszylinder_wohnungseingangstuer_batterie_ladestand_zusatzmodul', 'sensor.x')).toBe('flur schliesszylinder…');
  });

  it('kürzt lange Namen an einer Wortgrenze mit Auslassungspunkten', () => {
    const label = deviceLabel('Wohnzimmer Heizkörperthermostat Südfenster links oben Battery', 'sensor.x');
    expect(label.length).toBeLessThanOrEqual(28);
    expect(label.endsWith('…')).toBe(true);
    expect(label).toBe('Wohnzimmer…');
  });

  it('kürzt ein einzelnes sehr langes Wort hart', () => {
    const label = deviceLabel('A'.repeat(60), 'sensor.x');
    expect(label.length).toBe(28);
    expect(label.endsWith('…')).toBe(true);
  });

  it('ein Name mit mehreren Wörtern bleibt, solange er passt', () => {
    expect(deviceLabel('Wohnzimmer Heizkörper links', 'sensor.x')).toBe('Wohnzimmer Heizkörper links');
  });
});

describe('Name mit Gerät', () => {
  it('hängt das Gerät mit Doppelpunkt an', () => {
    expect(withDevice('Batterie schwach', 'iPhone Rene')).toBe('Batterie schwach: iPhone Rene');
    expect(withDevice('Batterie wechseln', 'Flur Tür')).toBe('Batterie wechseln: Flur Tür');
  });

  it('lässt den Namen, wenn das Gerät schon darin steht (ohne auf Groß und Klein zu achten)', () => {
    expect(withDevice('Waschmaschine fertig', 'Waschmaschine')).toBe('Waschmaschine fertig');
    expect(withDevice('Batterie schwach: iPhone Rene', 'iphone rene')).toBe('Batterie schwach: iPhone Rene');
  });

  it('steht ein Teil des Geräts schon im Namen, kommt nur der Rest dazu (zwei Waschmaschinen bleiben unterscheidbar)', () => {
    expect(withDevice('Waschmaschine fertig', 'Waschmaschine Keller')).toBe('Waschmaschine fertig: Keller');
    expect(withDevice('Trockner fertig', 'Steckdose Trockner')).toBe('Trockner fertig: Steckdose');
  });

  it('kurze Wörter zählen nur als ganzes Wort, damit „A" nicht in jedem Namen steckt; einmal angehängt, kommt nichts doppelt', () => {
    expect(withDevice('Batterie schwach', 'Zimmer A')).toBe('Batterie schwach: Zimmer A');
    const once = withDevice('Batterie schwach', 'WC');
    expect(once).toBe('Batterie schwach: WC');
    expect(withDevice(once, 'WC')).toBe(once);
  });

  it('ohne Gerät bleibt der Name', () => {
    expect(withDevice('Batterie schwach', '')).toBe('Batterie schwach');
    expect(withDevice('Batterie schwach', '   ')).toBe('Batterie schwach');
  });

  it('bleibt in der Grenze des Namens (80) und kürzt dafür das Gerät, nie den Namen', () => {
    const out = withDevice('Batterie schwach', 'X'.repeat(28), 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.startsWith('Batterie schwach: ')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
  });

  it('ist kein Platz mehr für das Gerät, bleibt der Name', () => {
    expect(withDevice('Ein ziemlich langer Name eines Wächters', 'Flur', 41)).toBe('Ein ziemlich langer Name eines Wächters');
  });
});
