import assert from "node:assert/strict";
import { test } from "node:test";

import { targetFields } from "@/lib/audit/target";

const NO_PARENTS = {};

test("one target is the event's resource", () => {
  assert.deepEqual(targetFields([{ id: "d1", name: "golden set" }], undefined, NO_PARENTS), {
    resourceId: "d1",
    resourceLabel: "golden set",
    metadata: undefined,
  });
});

test("several targets go to metadata, names only when known", () => {
  assert.deepEqual(targetFields([{ id: "a", name: "A" }, { id: "b" }], undefined, NO_PARENTS), {
    resourceId: undefined,
    resourceLabel: undefined,
    metadata: { ids: ["a", "b"], count: 2, names: ["A"] },
  });
  assert.deepEqual(targetFields([{ id: "a" }, { id: "b" }], undefined, NO_PARENTS).metadata, {
    ids: ["a", "b"],
    count: 2,
  });
});

test("parents are only what the handler passed", () => {
  assert.deepEqual(targetFields([{ id: "c1" }], undefined, { dashboardId: "dash" }), {
    resourceId: "c1",
    resourceLabel: undefined,
    metadata: { dashboardId: "dash" },
  });
});

test("bulk targets are capped with their count", () => {
  const targets = Array.from({ length: 150 }, (_, i) => ({ id: `id${i}` }));
  const { metadata } = targetFields(targets, undefined, NO_PARENTS);
  assert.equal((metadata?.ids as string[]).length, 100);
  assert.equal(metadata?.count, 150);
});

test("a label without an id names the event", () => {
  assert.deepEqual(targetFields([], "someone@example.com", NO_PARENTS), {
    resourceId: undefined,
    resourceLabel: "someone@example.com",
    metadata: undefined,
  });
});
