import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_RECENT_PROJECTS,
  readRecentProjects,
  RECENT_PROJECT_TTL_MS,
  type RecentProject,
  upsertRecentProject,
} from "@/lib/projects/recent";

const entry = (id: string, lastAccessedAt: number): RecentProject => ({
  id,
  name: `project-${id}`,
  workspaceId: "ws-1",
  workspaceName: "Workspace",
  lastAccessedAt,
});

describe("upsertRecentProject", () => {
  it("puts the new entry first", () => {
    const now = 1_000_000;
    const list = [entry("a", now - 10), entry("b", now - 20)];
    const next = upsertRecentProject(list, entry("c", now), now);
    assert.deepEqual(
      next.map((p) => p.id),
      ["c", "a", "b"]
    );
  });

  it("dedupes by id, moving a revisited project to the front", () => {
    const now = 1_000_000;
    const list = [entry("a", now - 10), entry("b", now - 20)];
    const next = upsertRecentProject(list, entry("b", now), now);
    assert.deepEqual(
      next.map((p) => p.id),
      ["b", "a"]
    );
  });

  it("caps the list at MAX_RECENT_PROJECTS", () => {
    const now = 1_000_000;
    const list = Array.from({ length: MAX_RECENT_PROJECTS }, (_, i) => entry(`p${i}`, now - i - 1));
    const next = upsertRecentProject(list, entry("new", now), now);
    assert.equal(next.length, MAX_RECENT_PROJECTS);
    assert.equal(next[0].id, "new");
    // Oldest entry falls off the end.
    assert.ok(!next.some((p) => p.id === `p${MAX_RECENT_PROJECTS - 1}`));
  });

  it("drops entries older than the TTL", () => {
    const now = 1_000_000 + RECENT_PROJECT_TTL_MS;
    const list = [entry("stale", now - RECENT_PROJECT_TTL_MS - 1), entry("fresh", now - 10)];
    const next = upsertRecentProject(list, entry("new", now), now);
    assert.deepEqual(
      next.map((p) => p.id),
      ["new", "fresh"]
    );
  });
});

// The module gates on `typeof window`, so give the node test runner a minimal
// window with just the localStorage surface the read path touches.
const withWindowStorage = (stored: string | null, fn: () => void) => {
  (globalThis as { window?: unknown }).window = {
    localStorage: { getItem: () => stored },
  };
  try {
    fn();
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
};

describe("readRecentProjects", () => {
  it("drops entries older than the TTL at read time (no write required)", () => {
    const now = 1_000_000 + RECENT_PROJECT_TTL_MS;
    const stored = [entry("stale", now - RECENT_PROJECT_TTL_MS - 1), entry("fresh", now - 10)];
    withWindowStorage(JSON.stringify(stored), () => {
      assert.deepEqual(
        readRecentProjects("user-1", now).map((p) => p.id),
        ["fresh"]
      );
    });
  });

  it("drops malformed entries, including ones without a numeric lastAccessedAt", () => {
    const now = 1_000_000;
    const stored = [entry("ok", now - 10), { id: "no-timestamp", name: "x", workspaceId: "ws-1" }, "garbage", null];
    withWindowStorage(JSON.stringify(stored), () => {
      assert.deepEqual(
        readRecentProjects("user-1", now).map((p) => p.id),
        ["ok"]
      );
    });
  });

  it("returns [] for missing or corrupt storage", () => {
    withWindowStorage(null, () => {
      assert.deepEqual(readRecentProjects("user-1"), []);
    });
    withWindowStorage("not-json{", () => {
      assert.deepEqual(readRecentProjects("user-1"), []);
    });
    withWindowStorage(JSON.stringify({ not: "an array" }), () => {
      assert.deepEqual(readRecentProjects("user-1"), []);
    });
  });
});
