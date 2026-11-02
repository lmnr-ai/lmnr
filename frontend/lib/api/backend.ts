import { ApiError } from "./errors";

export async function fetcherRealTime(url: string, init: any): Promise<Response> {
  const res = await fetch(`${process.env.BACKEND_RT_URL}/api/v1${url}`, {
    ...init,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();

    throw new Error(text);
  }

  return res;
}

export async function fetcherJSON<JSON = any>(url: string, init: any): Promise<JSON> {
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1${url}`, {
    ...init,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return (await res.json()) as JSON;
}

/**
 * JSON call to the app-server's internal API; unwraps its `{ error }` envelope on failure. A 4xx is
 * the caller's mistake and passes through as an `ApiError`; a 5xx stays a plain error so
 * `apiHandler` reports it.
 */
export const callAppServer = async <T>(path: string, init: { method: string; body?: unknown }): Promise<T> => {
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1${path}`, {
    method: init.method,
    headers: { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const message = body?.error ?? `App server responded with ${res.status}`;
    throw res.status < 500 ? new ApiError(message, res.status) : new Error(message);
  }
  return (await res.json()) as T;
};
