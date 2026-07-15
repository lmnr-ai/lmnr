import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_RECENT_PROJECTS,
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
