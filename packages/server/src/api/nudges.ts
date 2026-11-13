import type { FastifyInstance } from 'fastify';
import { NUDGE_TEMPLATES, NUDGE_TEXT_MAX } from '../store.js';
import { type ApiKit, type Params } from './kit.js';

/** Stupsen */
export function registerNudgeRoutes(app: FastifyInstance, k: ApiKit): void {
  const { deps, store, body } = k;

  // ----- Stupsen -----
  app.get<{ Params: Params }>('/api/cards/:id/nudges', async (req) => {
    const me = req.user;
    const canNudge = !!me?.isPerson;
    return {
      canNudge,
      maxText: NUDGE_TEXT_MAX,
      templates: NUDGE_TEMPLATES,
      people: canNudge ? store.nudgeTargets(req.params.id, me!.id) : [],
    };
  });
  app.post<{ Params: Params }>('/api/cards/:id/nudge', async (req, reply) => {
    const b = body(req);
    const r = store.createNudges(req.params.id, req.user!.id, { to: b.to, template: b.template, text: b.text });
    if (r.sent.length === 0) {
      return reply.code(409).send({ error: 'Es ließ sich niemand stupsen (Sperrzeit oder kein Push-Gerät)', ...r });
    }
    // Sofort zustellen, statt auf den nächsten 30-Sekunden-Takt zu warten
    setImmediate(() => void deps.notifier?.tick?.().catch(() => undefined));
    return reply.code(201).send(r);
  });

  /** Antwort des Empfängers auf einen Stups: erledigt, mach ich oder später (wie die Knöpfe der Push-Nachricht) */
  app.post<{ Params: Params }>('/api/nudges/:id/reply', async (req, reply) => {
    const me = req.user;
    if (!me?.isPerson) return reply.code(403).send({ error: 'Nur eine Person kann auf einen Stups antworten' });
    const kind = { done: 'DONE', ack: 'ACK', later: 'LATER' }[String(body(req).action) as 'done'] as 'DONE' | 'ACK' | 'LATER' | undefined;
    if (!kind) return reply.code(400).send({ error: 'action muss done, ack oder later sein' });
    const nudge = store.getNudge(req.params.id);
    if (!nudge) return reply.code(404).send({ error: 'Stups nicht gefunden' });
    if (nudge.toId !== me.id) return reply.code(403).send({ error: 'Der Stups ging an eine andere Person' });
    if (deps.notifier?.replyToNudge) {
      const outcome = await deps.notifier.replyToNudge(nudge.id, me.id, kind);
      return { outcome };
    }
    if (kind === 'DONE') return reply.code(501).send({ error: 'Erledigen läuft über die Aufgabe' });
    const r = store.replyNudge(nudge.id, me.id, kind === 'ACK' ? 'ack' : 'later');
    return { outcome: r.outcome === 'ok' ? (kind === 'ACK' ? 'acked' : 'postponed') : 'stale' };
  });
}
