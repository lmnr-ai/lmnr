import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { notFound, redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { z } from "zod/v4";

import { apiHandler } from "@/lib/api/api-handler";
import { callAppServer } from "@/lib/api/backend";
import { ApiError, AuthorizationError, NotFoundError } from "@/lib/api/errors";
import { fetchApi, swrFetcher, UnauthenticatedError } from "@/lib/api/fetch-api";
import { INTERNAL_TOKEN_HEADER, internalApiHandler } from "@/lib/api/internal";
import { encryptValue } from "@/lib/crypto";

const req = (init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest("http://localhost/api/test", init);
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });
const run = (handler: Parameters<typeof apiHandler>[0], init?: ConstructorParameters<typeof NextRequest>[1]) =>
  apiHandler(handler)(req(init), ctx({}));

describe("apiHandler", () => {
  it("returns the handler's response untouched and passes params through", async () => {
    const res = await apiHandler<{ id: string }>(async (_req, { params }) =>
      Response.json({ id: (await params).id }, { status: 201, headers: { "x-test": "1" } })
    )(req(), ctx({ id: "abc" }));
    assert.equal(res.status, 201);
    assert.equal(res.headers.get("x-test"), "1");
    assert.deepEqual(await res.json(), { id: "abc" });
  });

  it("maps ApiError and its subclasses to their status with an { error } body", async () => {
    for (const [error, status] of [
      [new ApiError("Conflict", 409), 409],
      [new NotFoundError("Dataset not found"), 404],
      [new NotFoundError(), 404],
      [new AuthorizationError("Unauthorized", 401), 401],
      [new AuthorizationError("Forbidden", 403), 403],
    ] as const) {
      const res = await run(async () => {
        throw error;
      });
      assert.equal(res.status, status);
      assert.deepEqual(await res.json(), { error: error.message });
    }
  });

  it("maps a ZodError to 400 with the prettified message", async () => {
    const res = await run(async () => {
      z.object({ name: z.string() }).parse({});
      return Response.json({});
    });
    assert.equal(res.status, 400);
    const { error } = (await res.json()) as { error: string };
    assert.match(error, /name/);
    assert.doesNotMatch(error, /^\[/, "prettified, not the raw issue JSON");
  });

  it("maps an unexpected error to 500 with its message", async () => {
    const res = await run(async () => {
      throw new Error("db exploded");
    });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "db exploded" });
  });

  it("maps a non-Error throw to a generic 500", async () => {
    const res = await run(async () => {
      throw "boom";
    });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "Internal server error" });
  });

  it("maps a malformed JSON body to 500 (SyntaxError is not a client-mapped error)", async () => {
    const res = await run(async (r) => Response.json(await r.json()), { method: "POST", body: "{" });
    assert.equal(res.status, 500);
  });

  it("rethrows Next control-flow errors instead of answering 500", async () => {
    await assert.rejects(
      run(async () => redirect("/elsewhere")),
      (e: unknown) => (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT") === true
    );
    await assert.rejects(
      run(async () => notFound()),
      (e: unknown) => /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test((e as { digest?: string }).digest ?? "")
    );
  });

  it("answers 499 with no body when the client disconnected", async () => {
    for (const error of [
      new DOMException("aborted", "AbortError"),
      Object.assign(new Error("aborted"), { name: "ResponseAborted" }),
      new Error("provider wrapper", { cause: new DOMException("aborted", "AbortError") }),
    ]) {
      const res = await run(async () => {
        throw error;
      });
      assert.equal(res.status, 499);
      assert.equal(await res.text(), "");
    }
  });

  it("treats a TimeoutError as a real failure, not a disconnect", async () => {
    const res = await run(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    assert.equal(res.status, 500);
  });
});

describe("internalApiHandler", () => {
  const projectId = "f5b899b7-d112-471b-835d-9eb1c0f6ecaa";
  const original = process.env.AEAD_SECRET_KEY;
  afterEach(() => {
    process.env.AEAD_SECRET_KEY = original;
  });

  const token = async (claims: object, forProject = projectId) => {
    const { nonce, value } = await encryptValue(`internal-api:${forProject}`, JSON.stringify(claims));
    return `${nonce}.${value}`;
  };
  const handler = internalApiHandler<{ projectId: string }>(async (_req, { params, claims }) => {
    if (claims.userId === "boom") throw new NotFoundError("Alert not found");
    return Response.json({ projectId: params.projectId, claims });
  });
  const call = (headers: Record<string, string> = {}) => handler(req({ headers }), ctx({ projectId }));

  it("rejects missing, malformed, foreign-project and expired tokens with 401", async () => {
    process.env.AEAD_SECRET_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const now = Date.now() / 1000;
    for (const value of [
      undefined,
      "garbage",
      "a.b.c",
      await token({ exp: now + 60 }, "00000000-0000-0000-0000-000000000000"),
      await token({ exp: now - 1 }),
      await token({ exp: now + 3600 }),
    ]) {
      const res = await call(value === undefined ? {} : { [INTERNAL_TOKEN_HEADER]: value });
      assert.equal(res.status, 401, `token ${value}`);
      assert.deepEqual(await res.json(), { error: "Unauthorized" });
    }
  });

  it("passes params and claims to the handler and maps its errors like apiHandler", async () => {
    process.env.AEAD_SECRET_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const now = Date.now() / 1000;
    const ok = await call({ [INTERNAL_TOKEN_HEADER]: await token({ exp: now + 60, userId: "u1" }) });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { projectId, claims: { userId: "u1" } });

    const notFound = await call({ [INTERNAL_TOKEN_HEADER]: await token({ exp: now + 60, userId: "boom" }) });
    assert.equal(notFound.status, 404);
    assert.deepEqual(await notFound.json(), { error: "Alert not found" });
  });
});

const realFetch = globalThis.fetch;
const stubFetch = (respond: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return respond(String(url), init);
  }) as typeof fetch;
  return calls;
};

describe("callAppServer", () => {
  const originalUrl = process.env.BACKEND_URL;
  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env.BACKEND_URL = originalUrl;
  });

  it("sends a JSON body to BACKEND_URL/api/v1 and returns the parsed response", async () => {
    process.env.BACKEND_URL = "http://app-server:8000";
    const calls = stubFetch(() => Response.json({ ok: true }));
    assert.deepEqual(await callAppServer("/projects/p/sql/query", { method: "POST", body: { query: "SELECT 1" } }), {
      ok: true,
    });
    assert.equal(calls[0].url, "http://app-server:8000/api/v1/projects/p/sql/query");
    assert.equal(calls[0].init?.method, "POST");
    assert.equal(calls[0].init?.body, JSON.stringify({ query: "SELECT 1" }));
    assert.deepEqual(calls[0].init?.headers, { "Content-Type": "application/json" });
  });

  it("sends no body when none is given", async () => {
    const calls = stubFetch(() => Response.json({}));
    await callAppServer("/x", { method: "DELETE" });
    assert.equal(calls[0].init?.body, undefined);
  });

  // Every error format app-server produces (see routes/error.rs, sql/mod.rs, license/routes.rs).
  const errorCases: [string, () => Response, number, string][] = [
    [
      "JSON { error } envelope",
      () => Response.json({ error: "Signal not found" }, { status: 404 }),
      404,
      "Signal not found",
    ],
    [
      "JSON envelope with extra fields",
      () => Response.json({ error: "License required", code: "LICENSE_REQUIRED" }, { status: 403 }),
      403,
      "License required",
    ],
    [
      "JSON written as plain text (SqlQueryError)",
      () => new Response('{"error":"Query validation failed: unknown table"}', { status: 400 }),
      400,
      "Query validation failed: unknown table",
    ],
    [
      "plain text",
      () => new Response("Json deserialize error: missing field", { status: 400 }),
      400,
      "Json deserialize error: missing field",
    ],
    ["empty body", () => new Response(null, { status: 404 }), 404, "App server responded with 404"],
    ["JSON without an error field", () => Response.json({ message: "x" }, { status: 409 }), 409, '{"message":"x"}'],
  ];

  for (const [name, respond, status, message] of errorCases) {
    it(`turns a 4xx with ${name} into an ApiError`, async () => {
      stubFetch(respond);
      await assert.rejects(
        callAppServer("/x", { method: "POST", body: {} }),
        (e: unknown) => e instanceof ApiError && e.status === status && e.message === message
      );
    });
  }

  it("turns a 5xx into a plain Error so apiHandler reports it", async () => {
    for (const respond of [
      () => Response.json({ error: "Failed to save license: db down" }, { status: 500 }),
      () => new Response("ClickHouse client is not configured.", { status: 500 }),
      () => new Response(null, { status: 503 }),
    ]) {
      stubFetch(respond);
      await assert.rejects(
        callAppServer("/x", { method: "GET" }),
        (e: unknown) => e instanceof Error && !(e instanceof ApiError)
      );
    }
    stubFetch(() => Response.json({ error: "Failed to save license: db down" }, { status: 500 }));
    await assert.rejects(callAppServer("/x", { method: "GET" }), /Failed to save license: db down/);
  });

  it("lets a network failure propagate", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    await assert.rejects(callAppServer("/x", { method: "GET" }), /fetch failed/);
  });
});

describe("fetchApi / swrFetcher", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns data and status on success", async () => {
    stubFetch(() => Response.json([1, 2], { status: 200 }));
    assert.deepEqual(await fetchApi("/api/x"), { data: [1, 2], error: null, status: 200 });
  });

  it("returns the server's { error } message and status on failure", async () => {
    stubFetch(() => Response.json({ error: "Dataset not found" }, { status: 404 }));
    assert.deepEqual(await fetchApi("/api/x"), { data: null, error: "Dataset not found", status: 404 });
  });

  it("falls back to the status line for a non-JSON error body", async () => {
    stubFetch(() => new Response("<html>oops</html>", { status: 500, statusText: "Internal Server Error" }));
    const res = await fetchApi("/api/x");
    assert.equal(res.status, 500);
    assert.equal(res.error, "Request failed: 500 Internal Server Error");
  });

  it("reports an UNAUTHENTICATED 401 as Unauthenticated (no window here, so no redirect)", async () => {
    stubFetch(() => Response.json({ error: "Authentication required", code: "UNAUTHENTICATED" }, { status: 401 }));
    assert.deepEqual(await fetchApi("/api/x"), { data: null, error: "Unauthenticated", status: 401 });
    await assert.rejects(swrFetcher("/api/x"), UnauthenticatedError);
  });

  it("keeps a 401 without the UNAUTHENTICATED code as an ordinary error", async () => {
    stubFetch(() => Response.json({ error: "Unauthorized" }, { status: 401 }));
    assert.deepEqual(await fetchApi("/api/x"), { data: null, error: "Unauthorized", status: 401 });
  });

  it("rethrows aborts so superseded requests don't surface as errors", async () => {
    stubFetch(() => {
      throw new DOMException("aborted", "AbortError");
    });
    await assert.rejects(fetchApi("/api/x"), (e: unknown) => e instanceof DOMException && e.name === "AbortError");
  });

  it("returns a network failure as an error with no status", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    assert.deepEqual(await fetchApi("/api/x"), { data: null, error: "fetch failed", status: null });
  });

  it("swrFetcher throws the server message so SWR enters its error state", async () => {
    stubFetch(() => Response.json({ error: "Forbidden" }, { status: 403 }));
    await assert.rejects(swrFetcher("/api/x"), /Forbidden/);
    stubFetch(() => Response.json({ a: 1 }));
    assert.deepEqual(await swrFetcher("/api/x"), { a: 1 });
  });
});
