import * as Sentry from "@sentry/nextjs";

import { stripBasePath, withBasePath } from "@/lib/utils";

interface ApiErrorBody {
  error?: string;
  code?: string;
}

type FetchResult<T> = { data: T; error: null; status: number } | { data: null; error: string; status: number | null };

// Thrown when an API call is rejected for a missing/expired session (proxy.ts
// returns `{ code: "UNAUTHENTICATED" }` with a 401). Kept distinct from generic
// errors so callers can recognise an auth failure if they need to.
export class UnauthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
    this.name = "UnauthenticatedError";
  }
}

// Module-scoped single-flight guard: a burst of concurrent failures (a
// dashboard firing many hooks at once) triggers exactly one redirect per tab.
let isRedirectingToSignIn = false;

// Force the browser to the sign-in page, preserving where the user was. Triggered
// straight from fetchApi at the moment a 401 is detected, so re-auth does NOT
// depend on SWRConfig.onError — which any hook can override with its own onError.
// `window.location.assign` is a browser API (no React router/context needed); a
// hard navigation is intentional so middleware re-runs and stale client state is
// dropped. Guarded on `window` because this module is also imported server-side.
const redirectToSignIn = () => {
  if (typeof window === "undefined") return;
  if (isRedirectingToSignIn) return;
  // Loop guard: never bounce a request that originated on the sign-in page.
  // pathname carries BASE_PATH under a sub-path deploy, so compare against the
  // prefixed form.
  if (window.location.pathname.startsWith(withBasePath("/sign-in"))) return;
  isRedirectingToSignIn = true;
  // callbackUrl must be prefix-free: the sign-in page re-prefixes it (router.push
  // auto-adds BASE_PATH), so strip the prefix off the observed pathname first.
  const callbackUrl = encodeURIComponent(stripBasePath(window.location.pathname) + window.location.search);
  window.location.assign(withBasePath(`/sign-in?callbackUrl=${callbackUrl}`));
  // A successful navigation tears this module down, so this timer only fires if
  // the navigation was blocked (e.g. a beforeunload prompt the user cancels) —
  // release the guard so a later 401 can retry instead of no-opping forever.
  window.setTimeout(() => {
    isRedirectingToSignIn = false;
  }, 10_000);
};

const UNAUTHENTICATED_MESSAGE = "Unauthenticated";

export async function fetchApi<T>(url: string, init?: RequestInit): Promise<FetchResult<T>> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      // Parse once, tolerating a non-JSON error body.
      const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
      if (response.status === 401 && body?.code === "UNAUTHENTICATED") {
        // Redirect at the detection point so it fires for every caller, not just SWR hooks.
        redirectToSignIn();
        return { data: null, error: UNAUTHENTICATED_MESSAGE, status: response.status };
      }
      const errorMessage = body?.error || `Request failed: ${response.status} ${response.statusText}`;
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
  const { data, error, status } = await fetchApi<T>(url);
  if (error !== null) {
    // Still throw so the hook's loading/error state settles before the navigation completes.
    if (status === 401 && error === UNAUTHENTICATED_MESSAGE) throw new UnauthenticatedError();
    throw new Error(error);
  }
  return data;
};
