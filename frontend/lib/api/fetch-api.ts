import * as Sentry from "@sentry/nextjs";

interface ApiErrorBody {
  error?: string;
}

type FetchResult<T> = { data: T; error: null; status: number } | { data: null; error: string; status: number | null };

export async function fetchApi<T>(url: string, init?: RequestInit): Promise<FetchResult<T>> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      const message = await response
        .json()
        .then((body: ApiErrorBody) => body?.error)
        .catch(() => null);
      const errorMessage = message || `Request failed. Please try again.`;
      // Server already captured the underlying error via apiHandler — don't double-report.
      return { data: null, error: errorMessage, status: response.status };
    }
    const data = (await response.json()) as T;
    return { data, error: null, status: response.status };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const error = err instanceof Error ? err : new Error(String(err));
    Sentry.withScope((scope) => {
      scope.setTags({
        "http.method": init?.method ?? "GET",
        source: "fetchApi",
      });
      Sentry.captureException(error);
    });
    return { data: null, error: error.message || "Network error", status: null };
  }
}

export const swrFetcher = async <T = unknown>(url: string): Promise<T> => {
  const { data, error } = await fetchApi<T>(url);
  if (error !== null) throw new Error(error);
  return data;
};
