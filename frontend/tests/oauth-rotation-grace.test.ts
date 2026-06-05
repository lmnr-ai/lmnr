import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isWithinRotationGrace, ROTATION_GRACE_SECONDS } from "@/lib/oauth/refresh-tokens";

describe("isWithinRotationGrace", () => {
  it("returns false when rotatedAt is null (never rotated)", () => {
    assert.equal(isWithinRotationGrace(null), false);
  });

  it("returns true for a rotation that happened just now", () => {
    const now = new Date("2026-01-01T00:00:10Z");
    const rotatedAt = new Date("2026-01-01T00:00:10Z");
    assert.equal(isWithinRotationGrace(rotatedAt, now), true);
  });

  it("returns true for a rotation 1s ago", () => {
    const now = new Date("2026-01-01T00:00:10Z");
    const rotatedAt = new Date("2026-01-01T00:00:09Z");
    assert.equal(isWithinRotationGrace(rotatedAt, now), true);
  });

  it("returns true for a rotation just within the grace window", () => {
    const now = new Date("2026-01-01T00:00:10Z");
    const rotatedAt = new Date(now.getTime() - (ROTATION_GRACE_SECONDS * 1000 - 1));
    assert.equal(isWithinRotationGrace(rotatedAt, now), true);
  });

  it("returns false for a rotation exactly at the grace boundary", () => {
    // Strict-less-than: rotations at the boundary are NOT in grace.
    const now = new Date("2026-01-01T00:00:10Z");
    const rotatedAt = new Date(now.getTime() - ROTATION_GRACE_SECONDS * 1000);
    assert.equal(isWithinRotationGrace(rotatedAt, now), false);
  });

  it("returns false for a rotation older than the grace window", () => {
    const now = new Date("2026-01-01T00:00:30Z");
    const rotatedAt = new Date("2026-01-01T00:00:10Z");
    assert.equal(isWithinRotationGrace(rotatedAt, now), false);
  });

  it("accepts ISO strings (matches drizzle's mode: 'string')", () => {
    const now = new Date("2026-01-01T00:00:10Z");
    assert.equal(isWithinRotationGrace("2026-01-01T00:00:05Z", now), true);
    assert.equal(isWithinRotationGrace("2026-01-01T00:00:00Z", now), false);
  });

  it("returns false on garbage input", () => {
    const now = new Date("2026-01-01T00:00:10Z");
    assert.equal(isWithinRotationGrace("not-a-date", now), false);
  });

  it("uses the documented 10-second window", () => {
    assert.equal(ROTATION_GRACE_SECONDS, 10);
  });
});
