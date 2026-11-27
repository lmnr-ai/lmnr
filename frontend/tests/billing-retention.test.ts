import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { subDays } from "date-fns";

import { retentionCutoff, retentionDays } from "@/lib/billing/retention";

describe("retentionDays", () => {
  it("maps raw tier names, including the legacy Hobby and Starter rows, to the published windows", () => {
    assert.equal(retentionDays("Free"), 7);
    assert.equal(retentionDays("Hobby"), 90);
    assert.equal(retentionDays(" starter "), 90);
    assert.equal(retentionDays("Pro"), 365);
  });

  it("leaves custom tiers unenforced so their DB value applies", () => {
    assert.equal(retentionDays("unlimited"), null);
    assert.equal(retentionDays("Enterprise"), null);
  });
});

describe("retentionCutoff", () => {
  it("is exactly the picker's day window, so the picker never offers a range the API rejects", () => {
    const now = new Date("2026-05-01T00:00:00Z");
    assert.deepEqual(retentionCutoff("Hobby", now), subDays(now, 90));
    assert.deepEqual(retentionCutoff("Pro", now), subDays(now, 365));
    assert.equal(retentionCutoff("unlimited", now), null);
  });
});
