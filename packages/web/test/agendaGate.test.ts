import { describe, expect, it } from 'vitest';
import { AGENDA_QUIET_MS, agendaDelay } from '../src/lib/agendaGate';

describe('agendaDelay: wann Aufgaben und Glocke neu laden', () => {
  it('auf dem Reiter Aufgaben sofort', () => {
    expect(agendaDelay(1_000, 1_100, true)).toBe(0);
  });

  it('auf anderen Reitern erst, wenn der letzte Stand lange genug her ist', () => {
    expect(agendaDelay(0, 5_000, false)).toBe(AGENDA_QUIET_MS - 5_000);
    expect(agendaDelay(0, AGENDA_QUIET_MS, false)).toBe(0);
    expect(agendaDelay(0, AGENDA_QUIET_MS + 1, false)).toBe(0);
  });

  it('ein eigener Abstand', () => {
    expect(agendaDelay(100, 150, false, 1_000)).toBe(950);
  });
});
