import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sameZoomGeometry } from "@/components/traces/traces-chart/zoom-scene";

type Scene = Parameters<typeof sameZoomGeometry>[0];
const timestamps = ["2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z"];

const scene = (domain = timestamps, plotX = 40, bandwidth = 12): Scene =>
  ({
    width: 800,
    height: 200,
    points: Array(4).fill(null),
    chart: { x: plotX, y: 8, width: 740, height: 160 },
    scales: { x: { domain, bandwidth } },
  }) as unknown as Scene;

describe("traces zoom scene", () => {
  it("keeps the scene when only values change, so paint does not cause a rerender", () => {
    assert.equal(sameZoomGeometry(scene(), scene()), true);
  });

  it("updates the scale when a refetch replaces buckets with the same count", () => {
    assert.equal(sameZoomGeometry(scene(), scene(["2026-01-02T00:00:00Z", "2026-01-02T01:00:00Z"])), false);
  });

  it("updates the overlay when the plot shifts within unchanged outer dimensions", () => {
    assert.equal(sameZoomGeometry(scene(), scene(timestamps, 55)), false);
  });

  it("updates the overlay when the band width changes", () => {
    assert.equal(sameZoomGeometry(scene(), scene(timestamps, 40, 14)), false);
  });
});
