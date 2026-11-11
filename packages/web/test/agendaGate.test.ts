import { describe, expect, it } from 'vitest';
import { AGENDA_BURST_MS, AGENDA_QUIET_MS, agendaDelay } from '../src/lib/agendaGate';

describe('agendaDelay: wann Aufgaben und Glocke neu laden', () => {
  it('auf dem Reiter Aufgaben sofort, wenn die letzte Runde länger her ist als die Bündelung', () => {
    expect(agendaDelay(1_000, 1_000 + AGENDA_BURST_MS, true)).toBe(0);
    expect(agendaDelay(0, 60_000, true)).toBe(0);
  });

  it('auf dem Reiter Aufgaben werden schnelle Änderungen gebündelt: die erste lädt sofort, die folgenden warten kurz auf eine einzige Runde', () => {
    expect(agendaDelay(1_000, 1_100, true)).toBe(AGENDA_BURST_MS - 100);
    expect(agendaDelay(1_000, 1_000, true)).toBe(AGENDA_BURST_MS);
    // eine Serie von zehn Änderungen im Abstand von 30 ms: eine Runde sofort, eine zum Schluss statt zehn
    let last = -Infinity;
    let loads = 0;
    for (let i = 0; i < 10; i++) {
      const now = i * 30;
      if (agendaDelay(last, now, true) === 0) {
        last = now;
        loads += 1;
      }
    }
    expect(loads).toBe(1); // die übrigen warten auf den einen Nachlauf (App.svelte setzt dafür den Timer)
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
