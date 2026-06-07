import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cliKeyName, sanitizeHostname } from "@/lib/cli-login";
import { parseJsonBody } from "@/lib/cli-login/parse-body";

describe("sanitizeHostname", () => {
  it("preserves '-' so hostnames like my-laptop are not mangled", () => {
    assert.equal(sanitizeHostname("my-laptop"), "my-laptop");
    assert.equal(sanitizeHostname("MacBook-Pro-10.local"), "MacBook-Pro-10.local");
  });

  it("drops control chars / spaces / other punctuation", () => {
    assert.equal(sanitizeHostname("host name!@#"), "hostname");
    assert.equal(sanitizeHostname("a\nb\tc"), "abc");
  });

  it("truncates to 64 chars and handles empty input", () => {
    assert.equal(sanitizeHostname(""), "");
    assert.equal(sanitizeHostname(null), "");
    assert.equal(sanitizeHostname("x".repeat(100)).length, 64);
  });

  it("cliKeyName keeps the dash inside the hostname token", () => {
    const name = cliKeyName("my-laptop");
    assert.ok(name.startsWith("CLI - my-laptop - "));
  });
});

describe("parseJsonBody", () => {
  // Minimal NextRequest stand-in: only `.json()` is exercised.
  const fakeReq = (json: () => Promise<unknown>) => ({ json }) as unknown as Parameters<typeof parseJsonBody>[0];

  it("returns parsed data for valid JSON", async () => {
    const out = await parseJsonBody(fakeReq(async () => ({ a: 1 })));
    assert.ok("data" in out);
    assert.deepEqual((out as { data: unknown }).data, { a: 1 });
  });

  it("returns a 400 invalid_json Response for a non-JSON body", async () => {
    const out = await parseJsonBody(
      fakeReq(async () => {
        throw new SyntaxError("Unexpected token 'o'");
      })
    );
    assert.ok("error" in out);
    const res = (out as { error: Response }).error;
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid_json" });
  });
});
