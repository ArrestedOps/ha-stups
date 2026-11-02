import { t } from './i18n/index.js';

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
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
  constructor(message: string) {
    super(message, 409);
  }
}
