/** A dashboard write the caller got wrong; `status` is what API routes answer with. */
export class DashboardError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409
  ) {
    super(message);
    this.name = "DashboardError";
  }

  static validation(message: string) {
    return new DashboardError(message, 400);
  }

  static notFound(what: string) {
    return new DashboardError(`${what} not found`, 404);
  }

  static lastDashboard() {
    return new DashboardError("A project must have at least one dashboard", 409);
  }
}
