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

// App-server answers errors as plain text or as a `{ error }` JSON envelope, depending on the route.
const errorMessage = async (res: Response): Promise<string> => {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {
    // Not JSON: use the text as is.
  }
  return text || `App server responded with ${res.status}`;
};

/**
 * JSON call to app-server's REST API. A 4xx is the caller's mistake and passes through as an
 * `ApiError`; a 5xx stays a plain error so `apiHandler` reports it.
 */
export const callAppServer = async <T = any>(path: string, init: { method: string; body?: unknown }): Promise<T> =>
  (await callAppServerWithHeaders<T>(path, init)).data;

/** `callAppServer` that also returns the response headers. */
export const callAppServerWithHeaders = async <T = any>(
  path: string,
  init: { method: string; body?: unknown }
): Promise<{ data: T; headers: Headers }> => {
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1${path}`, {
    method: init.method,
    headers: { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  if (!res.ok) {
    const message = await errorMessage(res);
    throw res.status < 500 ? new ApiError(message, res.status) : new Error(message);
  }
  return { data: (await res.json()) as T, headers: res.headers };
};
