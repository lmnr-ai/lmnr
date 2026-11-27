import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shownVersionIds } from "@/lib/actions/agents/deleted-versions";

const version = (n: number, deleted = false) => ({
  id: `v${n}`,
  versionNumber: n,
  deletedAt: deleted ? "2026-11-25T00:00:00Z" : null,
});

describe("shownVersionIds", () => {
  it("shows a deleted version as the nearest earlier one still shown", () => {
    const shownAs = shownVersionIds([version(4), version(3, true), version(2, true), version(1)]);
    assert.deepEqual(Object.fromEntries(shownAs), { v4: "v4", v3: "v1", v2: "v1", v1: "v1" });
  });

  it("leaves out a deleted version with none shown before it", () => {
    const shownAs = shownVersionIds([version(1, true), version(2)]);
    assert.equal(shownAs.has("v1"), false);
    assert.equal(shownAs.get("v2"), "v2");
  });
});
