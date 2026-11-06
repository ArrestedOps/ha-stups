import { t } from './i18n/index.js';

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Zusätzliche Angaben für die Oberfläche (kommen neben `error` in der Antwort an), zum Beispiel die betroffenen Wächter */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = t('Kein Zugriff')) {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = t('Nicht gefunden')) {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, details);
  }
}
