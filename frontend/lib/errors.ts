/**
 * Thrown by data actions when a scoped resource doesn't exist, so API route
 * handlers can map it to a 404 (instead of a generic 500) and clients can tell
 * "missing" apart from "server error".
 */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Thrown when the caller is not authenticated (401) or lacks the required role
 * (403), so route handlers can return the right status instead of a 500.
 */
export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}
