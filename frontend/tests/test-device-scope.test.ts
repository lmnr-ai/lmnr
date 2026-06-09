import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildProjectScope, parseProjectFromScope } from "@/lib/actions/device/scope";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("device scope round-trip", () => {
  it("builds the scope the device token endpoint echoes back", () => {
    assert.strictEqual(buildProjectScope(UUID), `projects:rw lmnr_project=${UUID}`);
  });

  it("parses the projectId back out of the echoed scope", () => {
    const scope = buildProjectScope(UUID);
    assert.strictEqual(parseProjectFromScope(scope), UUID);
  });

  it("tolerates token order", () => {
    assert.strictEqual(parseProjectFromScope(`lmnr_project=${UUID} projects:rw`), UUID);
  });

  it("returns null when the project token is absent (legacy / logged-in-elsewhere)", () => {
    assert.strictEqual(parseProjectFromScope("projects:rw"), null);
    assert.strictEqual(parseProjectFromScope(""), null);
    assert.strictEqual(parseProjectFromScope(undefined), null);
    assert.strictEqual(parseProjectFromScope(null), null);
  });

  it("returns null when the smuggled value is not a UUID", () => {
    assert.strictEqual(parseProjectFromScope("projects:rw lmnr_project=not-a-uuid"), null);
  });
});
