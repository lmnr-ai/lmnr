import { type SandboxSessionFixture } from "./types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const requestUrl = (input: RequestInfo | URL) =>
  new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);

const spanText = (fixture: SandboxSessionFixture, spanId: string) => {
  const span = fixture.spans[spanId];
  return span ? JSON.stringify([span.name, span.input, span.output]).toLowerCase() : "";
};

/**
 * Serves the session view's API calls from fixtures. Anything not matched falls
 * through to the real network, so span-panel extras (tags, labels, …) still work.
 */
export function createSandboxFetch(fixtures: SandboxSessionFixture[], realFetch: typeof fetch): typeof fetch {
  const bySession = new Map(fixtures.map((f) => [f.sessionId, f]));
  const byTrace = new Map(fixtures.flatMap((f) => f.traces.map((t) => [t.id, f] as const)));

  return async (input, init) => {
    const url = requestUrl(input);
    const path = url.pathname;
    let m: RegExpMatchArray | null;

    if ((m = path.match(/^\/api\/projects\/[^/]+\/sessions\/([^/]+)\/traces$/))) {
      const f = bySession.get(decodeURIComponent(m[1]));
      if (f) return json({ items: f.traces });
    }

    if ((m = path.match(/^\/api\/projects\/[^/]+\/sessions\/([^/]+)\/spans$/))) {
      const f = bySession.get(decodeURIComponent(m[1]));
      if (f) {
        const search = (url.searchParams.get("search") ?? "").toLowerCase();
        const traces = f.traces
          .map((t) => ({
            traceId: t.id,
            spans: (f.traceSpans[t.id] ?? []).filter((s) => !search || spanText(f, s.spanId).includes(search)),
          }))
          .filter((t) => t.spans.length > 0);
        return json({ traces });
      }
    }

    if (path.match(/^\/api\/projects\/[^/]+\/traces\/output$/) && init?.body) {
      const { traceIds } = JSON.parse(String(init.body)) as { traceIds: string[] };
      const live = traceIds.filter((id) => !byTrace.has(id));
      const fromFixtures = Object.fromEntries(
        traceIds.filter((id) => byTrace.has(id)).map((id) => [id, byTrace.get(id)?.outputs[id] ?? null])
      );
      if (live.length === 0) return json(fromFixtures);
      const res = await realFetch(input, { ...init, body: JSON.stringify({ traceIds: live }) });
      if (!res.ok) return res;
      return json({ ...fromFixtures, ...((await res.json()) as Record<string, string | null>) });
    }

    if ((m = path.match(/^\/api\/projects\/[^/]+\/traces\/([^/]+)\/spans\/previews$/))) {
      const p = byTrace.get(m[1])?.previews[m[1]];
      if (p) return json(p);
    }

    if ((m = path.match(/^\/api\/projects\/[^/]+\/traces\/([^/]+)\/spans\/([^/]+)$/))) {
      const span = byTrace.get(m[1])?.spans[m[2]];
      if (span) return json(span);
    }

    if ((m = path.match(/^\/api\/projects\/[^/]+\/traces\/([^/]+)\/spans$/))) {
      const f = byTrace.get(m[1]);
      const spans = f?.traceSpans[m[1]];
      if (f && spans) {
        const search = (url.searchParams.get("search") ?? "").toLowerCase();
        return json(search ? spans.filter((s) => spanText(f, s.spanId).includes(search)) : spans);
      }
    }

    if ((m = path.match(/^\/api\/projects\/[^/]+\/traces\/([^/]+)\/signals$/)) && byTrace.has(m[1])) {
      return json([]);
    }

    return realFetch(input, init);
  };
}
