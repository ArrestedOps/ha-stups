import type { FastifyInstance } from 'fastify';
import { ValidationError } from '../errors.js';
import { t } from '../i18n/index.js';
import { type ApiKit } from './kit.js';

/** Fairness: wer erledigt wie viel (nur Zahlen; Sätze und Balken baut die Oberfläche) */
export function registerFairnessRoutes(app: FastifyInstance, k: ApiKit): void {
  const { store } = k;

  app.get<{ Querystring: { period?: string } }>('/api/fairness', async (req) => {
    const period = req.query.period ?? 'week';
    if (period !== 'week' && period !== 'month') throw new ValidationError(t('Der Zeitraum muss „week" oder „month" sein'));
    return store.fairness(period);
  });
}
