/** Domain error hierarchy → mapped to RFC-7807 responses by the API's exception filter. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, details?: unknown) {
    super(`${resource} not found`, 404, 'not_found', details);
  }
}

export class ValidationError extends DomainError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 422, 'validation_error', details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'unauthorized');
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(message, 403, 'forbidden', details);
  }
}

export class RateLimitError extends DomainError {
  constructor(message = 'Too Many Requests', details?: unknown) {
    super(message, 429, 'rate_limit', details);
  }
}

export class ConflictError extends DomainError {
  constructor(message = 'Conflict', details?: unknown) {
    super(message, 409, 'conflict', details);
  }
}
