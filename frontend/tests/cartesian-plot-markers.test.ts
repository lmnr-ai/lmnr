import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { snapMarkersToBuckets } from "../components/charts/cartesian-plot/markers-utils";

describe("snapMarkersToBuckets", () => {
  const buckets = [{ timestamp: "2026-01-01T00:00:00.000Z" }, { timestamp: "2026-01-01T01:00:00.000Z" }];

  it("snaps and merges annotations in a bucket, retaining the last link and original instants", () => {
    const markers = [
      { timestamp: "2026-01-01T00:05:00.000Z", label: "v2", href: "/v2" },
      { timestamp: "2026-01-01T00:30:00.000Z", label: "v3", href: "/v3" },
    ];
    assert.deepEqual(snapMarkersToBuckets(markers, buckets), [
      {
        timestamp: buckets[0].timestamp,
        label: "v2, v3",
        href: "/v3",
        tooltip: [
          { label: "v2", timestamp: markers[0].timestamp },
          { label: "v3", timestamp: markers[1].timestamp },
        ],
      },
    ]);
  });

  it("omits annotations before the first bucket and at or beyond the final bucket end", () => {
    assert.deepEqual(
      snapMarkersToBuckets(
        [
          { timestamp: "2025-12-31T23:59:00.000Z", label: "before" },
          { timestamp: "2026-01-01T02:00:00.000Z", label: "after" },
        ],
        buckets
      ),
      []
    );
  });

  it("keeps the only bucket open when its width is unknown", () => {
    assert.equal(
      snapMarkersToBuckets([{ timestamp: "2026-01-01T09:00:00.000Z", label: "v2" }], buckets.slice(0, 1))[0].timestamp,
      buckets[0].timestamp
    );
  });
});
