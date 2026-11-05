import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { notFound, redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { prettifyError, z } from "zod/v4";

import { apiHandler } from "@/lib/api/api-handler";
import { callAppServer } from "@/lib/api/backend";
import { ApiError, AuthorizationError, NotFoundError } from "@/lib/api/errors";
import { fetchApi, swrFetcher, UnauthenticatedError } from "@/lib/api/fetch-api";
import { INTERNAL_TOKEN_HEADER, internalApiHandler } from "@/lib/api/internal";
import { encryptValue } from "@/lib/crypto";

const req = (headers: Record<string, string> = {}) => new NextRequest("http://localhost/api/test", { headers });
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });
const throwing = (error: unknown) =>
  apiHandler(async () => {
    throw error;
  })(req(), ctx({}));

describe("apiHandler", () => {
  it("passes the handler's response and params through", async () => {
    const res = await apiHandler<{ id: string }>(async (_req, { params }) =>
      Response.json({ id: (await params).id }, { status: 201 })
    )(req(), ctx({ id: "abc" }));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { id: "abc" });
  });

  it("maps thrown errors to a status and { error } body", async () => {
    const zodError = z.object({ name: z.string() }).safeParse({}).error!;
    const cases: [unknown, number, string][] = [
      [new ApiError("Conflict", 409), 409, "Conflict"],
      [new NotFoundError("Dataset not found"), 404, "Dataset not found"],
      [new AuthorizationError("Forbidden", 403), 403, "Forbidden"],
      [zodError, 400, prettifyError(zodError)],
      [new Error("db exploded"), 500, "db exploded"],
      // A timeout is a server failure, not a client disconnect.
      [new DOMException("timed out", "TimeoutError"), 500, "timed out"],
      ["boom", 500, "Internal server error"],
    ];
    for (const [error, status, message] of cases) {
      const res = await throwing(error);
      assert.equal(res.status, status, message);
      assert.deepEqual(await res.json(), { error: message });
    }
  });

  it("answers 499 with no body when the client disconnected", async () => {
    for (const error of [
      new DOMException("aborted", "AbortError"),
      Object.assign(new Error("aborted"), { name: "ResponseAborted" }),
      new Error("provider wrapper", { cause: new DOMException("aborted", "AbortError") }),
    ]) {
      const res = await throwing(error);
      assert.equal(res.status, 499);
      assert.equal(await res.text(), "");
    }
  });

  it("rethrows Next control-flow errors", async () => {
    const digest = (e: unknown) => (e as { digest?: string }).digest ?? "";
    await assert.rejects(apiHandler(async () => redirect("/elsewhere"))(req(), ctx({})), (e) =>
      digest(e).startsWith("NEXT_REDIRECT")
    );
    await assert.rejects(apiHandler(async () => notFound())(req(), ctx({})), (e) =>
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(digest(e))
    );
  });
});

describe("internalApiHandler", () => {
  const projectId = "f5b899b7-d112-471b-835d-9eb1c0f6ecaa";
  const originalKey = process.env.AEAD_SECRET_KEY;
  afterEach(() => {
    process.env.AEAD_SECRET_KEY = originalKey;
  });

  const token = async (exp: number, claims: object = {}, forProject = projectId) => {
    process.env.AEAD_SECRET_KEY = "0123456789abcdef".repeat(4);
    const { nonce, value } = await encryptValue(
      `internal-api:${forProject}`,
      JSON.stringify({ exp: Date.now() / 1000 + exp, ...claims })
    );
    return `${nonce}.${value}`;
  };
  const call = internalApiHandler<{ projectId: string }>(async (_req, { params, claims }) => {
    if (claims.userId === "boom") throw new NotFoundError("Alert not found");
    return Response.json({ projectId: params.projectId, claims });
  });
  const send = (value?: string) =>
    call(req(value === undefined ? {} : { [INTERNAL_TOKEN_HEADER]: value }), ctx({ projectId }));

  it("rejects missing, malformed, foreign-project, expired and too-long tokens with 401", async () => {
    const foreign = await token(60, {}, "00000000-0000-0000-0000-000000000000");
    for (const value of [undefined, "garbage", "a.b.c", foreign, await token(-1), await token(3600)]) {
      const res = await send(value);
      assert.equal(res.status, 401, `token ${value}`);
      assert.deepEqual(await res.json(), { error: "Unauthorized" });
    }
  });

  it("passes params and claims through and maps handler errors", async () => {
    const ok = await send(await token(60, { userId: "u1" }));
    assert.deepEqual(await ok.json(), { projectId, claims: { userId: "u1" } });
    const missing = await send(await token(60, { userId: "boom" }));
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "Alert not found" });
  });
});

const realFetch = globalThis.fetch;
const stubFetch = (respond: () => Response) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return respond();
  }) as typeof fetch;
  return calls;
};
const networkError = () => {
  throw new TypeError("fetch failed");
};

describe("callAppServer", () => {
  const originalUrl = process.env.BACKEND_URL;
  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env.BACKEND_URL = originalUrl;
  });

  it("sends JSON to BACKEND_URL/api/v1 and returns the parsed response", async () => {
    process.env.BACKEND_URL = "http://app-server:8000";
    const calls = stubFetch(() => Response.json({ ok: true }));
    assert.deepEqual(await callAppServer("/sql", { method: "POST", body: { query: "SELECT 1" } }), { ok: true });
    await callAppServer("/sql", { method: "DELETE" });
    assert.equal(calls[0].url, "http://app-server:8000/api/v1/sql");
    assert.equal(calls[0].init?.body, JSON.stringify({ query: "SELECT 1" }));
    assert.deepEqual(calls[0].init?.headers, { "Content-Type": "application/json" });
    assert.equal(calls[1].init?.body, undefined);
  });

  // Every error body app-server produces (routes/error.rs, sql/mod.rs, license/routes.rs).
  // 4xx becomes an ApiError with the same status; 5xx a plain Error that apiHandler reports.
  it("unwraps the message from every app-server error format", async () => {
    const cases: [Response, string][] = [
      [Response.json({ error: "Signal not found" }, { status: 404 }), "Signal not found"],
      [Response.json({ error: "License required", code: "LICENSE_REQUIRED" }, { status: 403 }), "License required"],
      [new Response('{"error":"Query validation failed"}', { status: 400 }), "Query validation failed"],
      [new Response("Json deserialize error", { status: 400 }), "Json deserialize error"],
      [new Response(null, { status: 404 }), "App server responded with 404"],
      [Response.json({ message: "x" }, { status: 409 }), '{"message":"x"}'],
      [Response.json({ error: "db down" }, { status: 500 }), "db down"],
      [new Response("ClickHouse client is not configured.", { status: 500 }), "ClickHouse client is not configured."],
      [new Response(null, { status: 503 }), "App server responded with 503"],
    ];
    for (const [res, message] of cases) {
      const status = res.status;
      stubFetch(() => res);
      await assert.rejects(callAppServer("/x", { method: "GET" }), (e: unknown) => {
        assert.ok(e instanceof Error);
        assert.equal(e.message, message);
        assert.equal(e instanceof ApiError && e.status, status < 500 && status);
        return true;
      });
    }
  });

  it("lets a network failure propagate", async () => {
    stubFetch(networkError);
    await assert.rejects(callAppServer("/x", { method: "GET" }), /fetch failed/);
  });
});

describe("fetchApi / swrFetcher", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns { data, error, status } for every outcome", async () => {
    const cases: [() => Response, Awaited<ReturnType<typeof fetchApi>>][] = [
      [() => Response.json([1, 2]), { data: [1, 2], error: null, status: 200 }],
      [() => Response.json({ error: "Not found" }, { status: 404 }), { data: null, error: "Not found", status: 404 }],
      [
        () => new Response("<html>oops</html>", { status: 500, statusText: "Internal Server Error" }),
        { data: null, error: "Request failed: 500 Internal Server Error", status: 500 },
      ],
      // No window under node, so no sign-in redirect.
      [
        () => Response.json({ error: "Authentication required", code: "UNAUTHENTICATED" }, { status: 401 }),
        { data: null, error: "Unauthenticated", status: 401 },
      ],
      [
        () => Response.json({ error: "Unauthorized" }, { status: 401 }),
        { data: null, error: "Unauthorized", status: 401 },
      ],
      [networkError, { data: null, error: "fetch failed", status: null }],
    ];
    for (const [respond, expected] of cases) {
      stubFetch(respond);
      assert.deepEqual(await fetchApi("/api/x"), expected);
    }
  });

  it("rethrows aborts so superseded requests don't surface as errors", async () => {
    stubFetch(() => {
      throw new DOMException("aborted", "AbortError");
    });
    await assert.rejects(fetchApi("/api/x"), { name: "AbortError" });
  });

  it("swrFetcher returns data or throws for SWR's error state", async () => {
    stubFetch(() => Response.json({ a: 1 }));
    assert.deepEqual(await swrFetcher("/api/x"), { a: 1 });
    stubFetch(() => Response.json({ error: "Forbidden" }, { status: 403 }));
    await assert.rejects(swrFetcher("/api/x"), /Forbidden/);
    stubFetch(() => Response.json({ error: "x", code: "UNAUTHENTICATED" }, { status: 401 }));
    await assert.rejects(swrFetcher("/api/x"), UnauthenticatedError);
  });
});
