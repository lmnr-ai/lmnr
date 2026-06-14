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
  if (!w.__lmnrBasePathFetchPatched) {
    w.__lmnrBasePathFetchPatched = true;

    const needsPrefix = (path: string) =>
      path.startsWith("/") && !path.startsWith("//") && path !== BASE_PATH && !path.startsWith(`${BASE_PATH}/`);

    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && needsPrefix(input)) {
        return originalFetch(`${BASE_PATH}${input}`, init);
      }
      // Request objects already carry a resolved absolute URL, and URL/absolute
      // string inputs are origin-qualified — neither needs prefixing.
      return originalFetch(input, init);
    };

    // EventSource (realtime SSE) is likewise not prefixed by Next.
    const OriginalEventSource = window.EventSource;
    if (OriginalEventSource) {
      const PatchedEventSource = function (url: string | URL, init?: EventSourceInit) {
        if (typeof url === "string" && needsPrefix(url)) {
          return new OriginalEventSource(`${BASE_PATH}${url}`, init);
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
