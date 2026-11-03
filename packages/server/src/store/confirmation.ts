import { ConflictError } from '../errors.js';
import { t } from '../i18n/index.js';
import { lazy, type Ctx } from './context.js';
import type { Internals } from './internals.js';
import type { CardDetail, CompleteResult, CompletionSource } from './types.js';

/** Eine Anfrage, die auf Bestätigung wartet */
export interface ConfirmationRequest {
  cardId: string;
  title: string;
  childId: string | null;
  requestedAt: string;
}

/**
 * Bestätigung durch Erwachsene: Ein Kind hakt ab, die Karte bleibt offen und „wartet auf Bestätigung", bis ein Bestätiger
 * zustimmt (dann erledigt `completeCard` die Karte, gezählt auf das Kind) oder „Nochmal" sagt (die Anfrage entfällt).
 */
export function createConfirmation(c: Ctx, late: unknown) {
  const s = late as Internals;
  const { one, all, run, iso } = c;
  const { completeCard, getCard, touchCard, visibleCardRow } = lazy(s, ['completeCard', 'getCard', 'touchCard', 'visibleCardRow'] as const);

  /** Braucht „Erledigt" dieser Person an dieser Karte eine Bestätigung? Nur ein Kind, dem die Karte zugewiesen ist. */
  function needsConfirmation(cardId: string, userId: string): boolean {
    const card = one('select confirm, completed_at from cards where id = ? and deleted_at is null', cardId);
    const user = one('select is_child, is_person, confirm_default from users where id = ?', userId);
    if (!card || !user || card.completed_at !== null || user.is_child !== 1 || user.is_person !== 1) return false;
    if (!one('select 1 as x from card_assignees where card_id = ? and user_id = ?', cardId, userId)) return false;
    return card.confirm === 'on' || (card.confirm === null && user.confirm_default === 1);
  }

  /** Das Kind hakt ab: die Anfrage wird gemerkt (ein zweites Abhaken ändert nichts). created = erstmals gestellt. */
  function requestConfirmation(cardId: string, childId: string): { created: boolean; card: CardDetail } {
    const row = visibleCardRow(cardId);
    if (row.confirm_requested_at !== null) return { created: false, card: getCard(cardId) };
    run('update cards set confirm_requested_at = ?, confirm_requested_by = ? where id = ?', iso(), childId, cardId);
    touchCard(cardId);
    return { created: true, card: getCard(cardId) };
  }

  /**
   * Die Antwort eines Bestätigers. „Bestätigen" erledigt die Karte und zählt auf das Kind, „Nochmal" nimmt die Anfrage zurück.
   * Wer zuerst antwortet, entscheidet: danach gibt es keine Anfrage mehr (Konflikt).
   */
  function answerConfirmation(
    cardId: string,
    answer: 'confirm' | 'reject',
    source: CompletionSource,
  ): { childId: string | null; card: CardDetail; result: CompleteResult | null } {
    const row = visibleCardRow(cardId);
    if (row.confirm_requested_at === null) throw new ConflictError(t('Es wartet nichts auf Bestätigung'));
    const childId: string | null = row.confirm_requested_by ?? null;
    if (answer === 'reject') {
      run('update cards set confirm_requested_at = null, confirm_requested_by = null where id = ?', cardId);
      touchCard(cardId);
      return { childId, card: getCard(cardId), result: null };
    }
    const result = completeCard(cardId, { by: childId, source }); // löscht die Anfrage mit
    return { childId, card: result.card, result };
  }

  /** Wer für dieses Kind bestätigen darf: die gewählten Personen, ohne Auswahl alle Erwachsenen (nie Kinder) */
  function confirmerIds(childId: string): string[] {
    const chosen = all(
      'select c.user_id from child_confirmers c join users u on u.id = c.user_id and u.is_person = 1 where c.child_id = ? order by c.rowid',
      childId,
    ).map((r) => r.user_id as string);
    if (chosen.length > 0) return chosen.filter((id) => id !== childId);
    return all('select id from users where is_person = 1 and is_child = 0 and id != ? order by rowid', childId).map((r) => r.id as string);
  }

  /** Darf diese Person für das Kind bestätigen? Administratoren immer, das Kind nie selbst. */
  const mayConfirm = (userId: string, childId: string | null, isAdmin: boolean): boolean =>
    userId !== childId && (isAdmin || (childId !== null && confirmerIds(childId).includes(userId)));

  /** Alle offenen Anfragen, älteste zuerst (für die Erinnerung an die Bestätiger) */
  function openConfirmations(): ConfirmationRequest[] {
    return all(
      `select id, title, confirm_requested_at, confirm_requested_by from cards
       where deleted_at is null and archived_at is null and completed_at is null and confirm_requested_at is not null
       order by confirm_requested_at, id`,
    ).map((r) => ({ cardId: r.id, title: r.title, childId: r.confirm_requested_by ?? null, requestedAt: r.confirm_requested_at }));
  }

  return { needsConfirmation, requestConfirmation, answerConfirmation, confirmerIds, mayConfirm, openConfirmations };
}
