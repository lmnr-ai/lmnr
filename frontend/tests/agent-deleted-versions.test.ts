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

  it("falls back to the nearest later one when none is left before it", () => {
    const shownAs = shownVersionIds([version(1, true), version(2, true), version(3), version(4)]);
    assert.equal(shownAs.get("v1"), "v3");
    assert.equal(shownAs.get("v2"), "v3");
  });

  it("leaves versions out when every one is deleted", () => {
    assert.equal(shownVersionIds([version(1, true)]).size, 0);
  });
});
