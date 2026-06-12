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
