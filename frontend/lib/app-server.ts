/** Carries the app-server's status so the Next route can pass 400/404/409 through instead of flattening to 500. */
export class AppServerError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AppServerError";
  }
}

/** JSON call to the app-server's internal API; unwraps its `{ error }` envelope on failure. */
export async function callAppServer<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1${path}`, {
    method: init.method,
    headers: { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new AppServerError(body?.error ?? `App server responded with ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}
