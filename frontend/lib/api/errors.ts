/**
 * An expected failure a route answers with `{ error: message }` and `status` (a missing row, a
 * conflicting write, a caller mistake). `apiHandler` maps it without reporting to Sentry, so domain
 * code throws it instead of each route catching and translating its own errors.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A scoped resource doesn't exist (404), as opposed to a server error. */
export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

/** The caller is not authenticated (401) or lacks the required role (403). */
export class AuthorizationError extends ApiError {
  constructor(message: string, status: 401 | 403) {
    super(message, status);
    this.name = "AuthorizationError";
  }
}
