import assert from "node:assert/strict";
import test from "node:test";

import { estimateDataGB, estimatedStoredBytesPerRun } from "../components/landing/pricing/storage-estimate";

test("uses discrete storage estimates at each lower-bound slider step", () => {
  assert.equal(estimatedStoredBytesPerRun(1_000), 2_763);
  assert.equal(estimatedStoredBytesPerRun(2_500), 6_883);
  assert.equal(estimatedStoredBytesPerRun(4_999), 6_883);
  assert.equal(estimatedStoredBytesPerRun(5_000), 13_682);
});

test("keeps the 1M storage estimate from falling below 500K", () => {
  assert.equal(estimatedStoredBytesPerRun(500_000), 447_826);
  assert.equal(estimatedStoredBytesPerRun(1_000_000), 447_826);
});

test("converts per-run storage to monthly gigabytes", () => {
  assert.equal(estimateDataGB(1_000, 100_000), 0.217479);
});
