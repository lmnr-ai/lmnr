import assert from "node:assert/strict";
import test from "node:test";

import { createAnimationFrameScheduler } from "@/components/traces/trace-view/condensed-timeline/use-dynamic-time-intervals";

test("resize notifications are deferred and coalesced per animation frame", () => {
  let notifications = 0;
  let queued: FrameRequestCallback | null = null;
  const scheduler = createAnimationFrameScheduler(
    () => notifications++,
    (callback) => {
      queued = callback;
      return 1;
    },
    () => {
      queued = null;
    }
  );

  scheduler.schedule();
  scheduler.schedule();

  assert.equal(notifications, 0);
  assert.ok(queued);
  const frame = queued as FrameRequestCallback;
  frame(0);
  assert.equal(notifications, 1);
});

test("cancel drops a pending resize notification", () => {
  let notifications = 0;
  let queued: FrameRequestCallback | null = null;
  const scheduler = createAnimationFrameScheduler(
    () => notifications++,
    (callback) => {
      queued = callback;
      return 1;
    },
    () => {
      queued = null;
    }
  );

  scheduler.schedule();
  scheduler.cancel();

  assert.equal(queued, null);
  assert.equal(notifications, 0);
});
