"use client";

import { BASE_PATH } from "@/lib/utils";

// Next bakes basePath into <Link>/router/redirect/next-image/static assets, but
// NOT into runtime native fetch() — a root-relative `fetch("/api/...")` resolves
// against the browser origin and loses the sub-path prefix, 404ing. Rather than
// touch all ~140 fetch call sites, prefix root-relative requests once here.
// No-op (and not even installed) when root-served, so the regular frontend-ee
// image behaves identically.
if (typeof window !== "undefined" && BASE_PATH) {
  const w = window as typeof window & { __lmnrBasePathFetchPatched?: boolean };
  // `__lmnrBasePathFetchPatched` is shared mutable state, but browser JS is
  // single-threaded so the check-then-set can't race — no mutex needed. It only
  // guards against double-evaluation in one realm (HMR / double-import).
  if (!w.__lmnrBasePathFetchPatched) {
    w.__lmnrBasePathFetchPatched = true;

    const needsPrefix = (path: string) =>
      path.startsWith("/") && !path.startsWith("//") && path !== BASE_PATH && !path.startsWith(`${BASE_PATH}/`);

    const prefixString = (path: string) => (needsPrefix(path) ? `${BASE_PATH}${path}` : path);

    // A URL built from a root-relative path (`new URL("/api/foo", origin)`) has
    // already resolved against the origin and dropped the sub-path. Re-prefix the
    // pathname for same-origin URLs only — cross-origin URLs (PostHog, GitHub, …)
    // pass through untouched.
    const prefixUrl = (url: URL): URL => {
      if (url.origin === window.location.origin && needsPrefix(url.pathname)) {
        const next = new URL(url);
        next.pathname = `${BASE_PATH}${url.pathname}`;
        return next;
      }
      return url;
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string") {
        return originalFetch(prefixString(input), init);
      }
      if (input instanceof URL) {
        return originalFetch(prefixUrl(input), init);
      }
      // Request objects carry an already-resolved absolute URL, so they pass through.
      return originalFetch(input, init);
    };

    // EventSource (realtime SSE) is likewise not prefixed by Next.
    const OriginalEventSource = window.EventSource;
    if (OriginalEventSource) {
      const PatchedEventSource = function (url: string | URL, init?: EventSourceInit) {
        if (typeof url === "string") {
          return new OriginalEventSource(prefixString(url), init);
        }
        if (url instanceof URL) {
          return new OriginalEventSource(prefixUrl(url), init);
        }
        return new OriginalEventSource(url, init);
      } as unknown as typeof EventSource;
      PatchedEventSource.prototype = OriginalEventSource.prototype;
      // The readyState constants are readonly on the typed constructor; copy them
      // onto the patched ctor so `EventSource.OPEN` etc. still resolve statically.
      Object.assign(PatchedEventSource, {
        CONNECTING: OriginalEventSource.CONNECTING,
        OPEN: OriginalEventSource.OPEN,
        CLOSED: OriginalEventSource.CLOSED,
      });
      window.EventSource = PatchedEventSource;
    }
  }
}

// Side-effect-only module; rendering nothing keeps it a cheap mount in the tree.
export default function BasePathFetchShim() {
  return null;
}
