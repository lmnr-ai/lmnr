import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NextRequest } from "next/server";

import { type AuditDeps, createHandlerWithAudit } from "@/lib/audit/handler";
import { type AuditEventPayload } from "@/lib/audit/post";

const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const req = () => new NextRequest("http://localhost/api/test", { method: "POST" });
const ok = () => Response.json({ ok: true }, { status: 201 });

const setup = (overrides: Partial<AuditDeps> = {}) => {
  const posted: AuditEventPayload[] = [];
  const deferred: (() => Promise<void>)[] = [];
  const wrap = createHandlerWithAudit({
    getUserId: async () => "user-1",
    getNames: async () => new Map(),
    post: async (event) => {
      posted.push(event);
    },
    after: (task) => {
      deferred.push(task);
    },
    ...overrides,
  });
  // Runs what the wrapper left for after the response.
  const flush = async () => {
    for (const task of deferred.splice(0)) await task();
  };
  return { wrap, posted, deferred, flush };
};

// The handler's own response must come back unchanged, whatever the audit side does.
const assertUntouched = async (res: Response) => {
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true });
};

describe("handlerWithAudit", () => {
  it("sends a write after the response, with names read during the request", async () => {
    let lookedUp = false;
    const { wrap, posted, flush } = setup({
      getNames: async () => {
        lookedUp = true;
        return new Map([["d1", "golden set"]]);
      },
    });
    const res = await wrap({ resource: "dataset", action: "delete" }, async (_req, _ctx, audit) => {
      await audit.target("d1");
      // A delete removes the row right after; the name must already be read.
      assert.ok(lookedUp);
      return ok();
    })(req(), { params: Promise.resolve({ projectId: PROJECT_ID }) });
    await assertUntouched(res);
    assert.equal(posted.length, 0);
    await flush();
    assert.equal(posted.length, 1);
    assert.equal(posted[0].resourceId, "d1");
    assert.equal(posted[0].resourceLabel, "golden set");
    assert.equal(posted[0].projectId, PROJECT_ID);
    assert.equal(posted[0].outcome, "success");
  });

  it("serves routes without dynamic segments", async () => {
    const { wrap, posted, flush } = setup();
    const handler = wrap({ resource: "workspace", action: "create" }, async (_req, _ctx, audit) => {
      audit.set({ workspaceId: "w1" });
      return ok();
    });
    // Next passes no `params` for static routes; some callers pass no ctx at all.
    await assertUntouched(await handler(req(), {} as never));
    await assertUntouched(await handler(req(), undefined as never));
    await flush();
    assert.equal(posted.length, 2);
    assert.equal(posted[0].workspaceId, "w1");
  });

  it("returns the response when the session, lookup or post fails", async () => {
    const boom = async () => {
      throw new Error("boom");
    };
    for (const overrides of [{ getUserId: boom }, { getNames: boom }, { post: boom }]) {
      const { wrap, flush } = setup(overrides);
      const res = await wrap({ resource: "dataset", action: "delete" }, async (_req, _ctx, audit) => {
        await audit.target("d1");
        return ok();
      })(req(), { params: Promise.resolve({ projectId: PROJECT_ID }) });
      await assertUntouched(res);
      await flush();
    }
  });

  it("returns the response when ctx.params rejects", async () => {
    const { wrap, posted, flush } = setup();
    const params = Promise.reject(new Error("bad params"));
    params.catch(() => {});
    const res = await wrap({ resource: "dataset", action: "create" }, async () => ok())(req(), { params });
    await assertUntouched(res);
    await flush();
    assert.equal(posted.length, 0);
  });

  it("ignores malformed ids from the request body", async () => {
    const { wrap, posted, flush } = setup();
    const res = await wrap({ resource: "evaluation", action: "delete" }, async (_req, _ctx, audit) => {
      await audit.target({ not: "an array" } as never);
      await audit.target([1, null, "", "e1"] as never);
      await audit.target(undefined, { parent: { datasetId: 42 } as never });
      return ok();
    })(req(), { params: Promise.resolve({ projectId: PROJECT_ID }) });
    await assertUntouched(res);
    await flush();
    assert.equal(posted[0].resourceId, "e1");
    assert.equal(posted[0].metadata, undefined);
  });

  it("looks up names of reads after the response, and swallows failures", async () => {
    const { wrap, deferred, flush } = setup({
      post: async () => {
        throw new Error("down");
      },
    });
    const res = await wrap({ resource: "dataset", action: "view", read: true }, async (_req, _ctx, audit) => {
      await audit.target("d1");
      return ok();
    })(req(), { params: Promise.resolve({ projectId: PROJECT_ID }) });
    await assertUntouched(res);
    assert.equal(deferred.length, 1);
    await flush();
  });

  it("records the error outcome of a throwing handler", async () => {
    const { wrap, posted, flush } = setup();
    const res = await wrap({ resource: "dataset", action: "create" }, async () => {
      throw new Error("handler failed");
    })(req(), { params: Promise.resolve({ projectId: PROJECT_ID }) });
    assert.equal(res.status, 500);
    await flush();
    assert.equal(posted[0].outcome, "error");
  });

  it("records nothing after skip", async () => {
    const { wrap, posted, deferred } = setup();
    const res = await wrap({ resource: "dataset", action: "update" }, async (_req, _ctx, audit) => {
      audit.skip();
      return ok();
    })(req(), { params: Promise.resolve({ projectId: PROJECT_ID }) });
    await assertUntouched(res);
    assert.equal(deferred.length, 0);
    assert.equal(posted.length, 0);
  });
});
