import type { FastifyInstance } from 'fastify';
import type { Options } from './config.js';
import type { HaStatus, NotificationAction } from './ha.js';
import { ensureWebsocket } from './ws.js';

export interface SpikeHa {
  status(): HaStatus;
  callService(domain: string, service: string, data: Record<string, unknown>): Promise<void>;
  listNotifyServices(): Promise<string[]>;
  getConfig(): Promise<{ time_zone: string }>;
  onNotificationAction(cb: (a: NotificationAction) => void): void;
}

export interface SpikeDeps {
  options: Options;
  ha: SpikeHa;
  now: () => Date;
}

const TAG = 'stups-spike';
const MAX_ACTIONS = 50;

export async function spikeRoutes(app: FastifyInstance, deps: SpikeDeps): Promise<void> {
  const { options, ha, now } = deps;
  const actions: (NotificationAction & { receivedAt: string })[] = [];

  ha.onNotificationAction((a) => {
    actions.unshift({ ...a, receivedAt: now().toISOString() });
    actions.length = Math.min(actions.length, MAX_ACTIONS);
  });

  await ensureWebsocket(app);

  function findPerson(name: unknown) {
    return options.users.find(
      (u) => typeof name === 'string' && u.name.toLowerCase() === name.toLowerCase(),
    );
  }

  app.get('/api/spike/info', async (req) => {
    const [services, config] = await Promise.all([
      ha.listNotifyServices().catch(() => null),
      ha.getConfig().catch(() => null),
    ]);
    return {
      user: req.principal,
      ingressPath: req.principal?.ingressPath ?? '',
      timeZone: config?.time_zone ?? null,
      dashboardPath: options.dashboardPath,
      notifyServices: services ?? [],
      haEvents: ha.status(),
      people: options.users.map((u) => ({
        name: u.name,
        notify: u.notify.map((service) => ({
          service,
          exists: services ? services.includes(service) : null,
        })),
      })),
    };
  });

  app.post('/api/spike/test-push', async (req, reply) => {
    const body = (req.body ?? {}) as { person?: string; url?: string };
    const person = findPerson(body.person);
    if (!person) return reply.code(404).send({ error: 'Person nicht in den Add-on-Optionen' });
    if (person.notify.length === 0) {
      return reply.code(409).send({ error: 'Für diese Person ist kein Notify-Dienst konfiguriert' });
    }
    const payload = {
      title: 'Test: Bad putzen',
      message: 'Spike-Test. Tippe auf „Erledigt" oder auf die Nachricht.',
      data: {
        tag: TAG,
        group: 'stups',
        url: body.url ?? '/',
        push: { 'interruption-level': 'time-sensitive' },
        actions: [
          { action: `KANBAN_DONE:spike:${now().getTime()}`, title: 'Erledigt' },
        ],
      },
    };
    await Promise.all(person.notify.map((s) => ha.callService('notify', s, payload)));
    return { sent: person.notify };
  });

  app.post('/api/spike/clear', async (req, reply) => {
    const body = (req.body ?? {}) as { person?: string };
    const person = findPerson(body.person);
    if (!person) return reply.code(404).send({ error: 'Person nicht in den Add-on-Optionen' });
    await Promise.all(
      person.notify.map((s) =>
        ha.callService('notify', s, { message: 'clear_notification', data: { tag: TAG } }),
      ),
    );
    return { cleared: person.notify };
  });

  app.get('/api/spike/actions', async () => ({ haEvents: ha.status(), actions }));

  app.get('/api/spike/ws', { websocket: true }, (socket) => {
    socket.send('hello');
    socket.on('message', (m: Buffer) => socket.send(`pong:${m.toString()}`));
  });
}
