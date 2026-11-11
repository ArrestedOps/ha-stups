import type { Watcher } from '../watcher-data.js';
import type { Ctx } from './context.js';
import type { Parts } from './parts.js';
import { stateOfEvent } from './seen.js';

/** Die Abos bei Home Assistant: je Wächter eines für den Auslöser, eines für „erledigt sich selbst", dazu eines für die Heimkehr */
export function createSubscriptions(ctx: Ctx, calls: () => Parts) {
  const { data, ha, mem, guarded } = ctx;
  let presenceSig = '';

  function unsubscribeWatcher(id: string): void {
    for (const key of [`w:${id}:fire`, `w:${id}:done`]) {
      ha.unsubscribe(key);
      mem.subscribed.delete(key);
    }
  }

  function subscribeWatcher(w: Watcher): void {
    const t = w.trigger;
    const fireKey = `w:${w.id}:fire`;
    const fireSig = `${t.entityId}`;
    if (mem.subscribed.get(fireKey) !== fireSig) {
      mem.subscribed.set(fireKey, fireSig);
      ha.subscribe(fireKey, { type: 'subscribe_trigger', trigger: { platform: 'state', entity_id: t.entityId } }, (ev) => {
        const s = stateOfEvent(ev);
        if (s) mem.seen.set(t.entityId, s);
        void guarded(`Auslöser „${w.name}"`, () => calls().evaluate(data.get(w.id), s));
      });
    }
    const doneKey = `w:${w.id}:done`;
    if (w.done) {
      const d = w.done;
      const sig = `${d.entityId}|${d.kind}|${d.to}|${d.value}`;
      if (mem.subscribed.get(doneKey) !== sig) {
        mem.subscribed.set(doneKey, sig);
        ha.subscribe(doneKey, { type: 'subscribe_trigger', trigger: { platform: 'state', entity_id: d.entityId } }, (ev) => {
          const s = stateOfEvent(ev);
          if (s) void guarded(`Erledigen „${w.name}"`, () => calls().checkDone(data.get(w.id), d, s));
        });
      }
    } else if (mem.subscribed.has(doneKey)) {
      ha.unsubscribe(doneKey);
      mem.subscribed.delete(doneKey);
    }
  }

  /** Abos an den aktuellen Stand der Wächter anpassen (nach Anlegen, Ändern, Löschen, Pausieren) */
  function syncSubscriptions(): void {
    const active = data.list().filter((w) => w.active);
    const wanted = new Set(active.map((w) => w.id));
    for (const key of [...mem.subscribed.keys()]) {
      const id = key.split(':')[1]!;
      if (key.startsWith('w:') && !wanted.has(id)) {
        ha.unsubscribe(key);
        mem.subscribed.delete(key);
      }
    }
    for (const w of active) subscribeWatcher(w);
    syncPresenceSubscription();
  }

  /** Das Abo auf „Person kommt nach Hause": nur, solange eine Karte auf die erste Heimkehr wartet */
  function syncPresenceSubscription(): void {
    const waiting = data.listWaiting();
    if (waiting.length === 0) {
      if (presenceSig) ha.unsubscribe('presence');
      presenceSig = '';
      return;
    }
    const entities = mem.persons.map((p) => p.entity_id).sort();
    const sig = entities.join(',');
    if (entities.length === 0 || sig === presenceSig) return;
    presenceSig = sig;
    ha.subscribe('presence', { type: 'subscribe_trigger', trigger: { platform: 'state', entity_id: entities, to: 'home' } }, (ev) => {
      const entityId = ev.variables?.trigger?.entity_id;
      if (typeof entityId === 'string') void guarded('Heimkehr', () => calls().arrival(entityId));
    });
  }

  return { unsubscribeWatcher, syncSubscriptions, syncPresenceSubscription };
}
