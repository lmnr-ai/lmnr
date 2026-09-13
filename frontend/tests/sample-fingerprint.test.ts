import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sampleFingerprint } from "@/lib/actions/sql/column-sql-queries";

const COLS = ["data", "target", "metadata"];
const row = (data: unknown, target: unknown = {}, metadata: unknown = {}) => ({
  data: JSON.stringify(data),
  target: JSON.stringify(target),
  metadata: JSON.stringify(metadata),
});

// The cache key must be structural: same shape ⇒ same fingerprint regardless of
// values or array length; different shape ⇒ different fingerprint.
describe("sampleFingerprint", () => {
  it("ignores scalar values", () => {
    const a = sampleFingerprint(row({ name: "Morphic Films", n: 1 }), COLS);
    const b = sampleFingerprint(row({ name: "Agentlock", n: 999 }), COLS);
    assert.equal(a, b);
  });

  it("ignores array length", () => {
    const a = sampleFingerprint(row({ spans: [{ id: "x" }] }), COLS);
    const b = sampleFingerprint(row({ spans: [{ id: "x" }, { id: "y" }, { id: "z" }] }), COLS);
    assert.equal(a, b);
  });

  it("differs when the key set differs", () => {
    const a = sampleFingerprint(row({ name: "x" }), COLS);
    const b = sampleFingerprint(row({ trace_id: "x" }), COLS);
    assert.notEqual(a, b);
  });

  it("differs when a value's type differs", () => {
    const a = sampleFingerprint(row({ v: "text" }), COLS);
    const b = sampleFingerprint(row({ v: 123 }), COLS);
    assert.notEqual(a, b);
  });

  it("treats a non-JSON string column as a plain string leaf", () => {
    const a = sampleFingerprint({ data: "not json", target: "{}", metadata: "{}" }, COLS);
    const b = sampleFingerprint({ data: "also not json", target: "{}", metadata: "{}" }, COLS);
    assert.equal(a, b);
  });
});
