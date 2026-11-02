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
}
