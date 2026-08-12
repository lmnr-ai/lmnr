// Per-user MRU list of recently accessed projects, persisted in localStorage.
// Client-side on purpose: this is per-user, per-device navigation sugar — same
// trust level as the last-project-id cookie, no server round-trip needed.

export type RecentProject = {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName?: string;
  lastAccessedAt: number;
};

export const MAX_RECENT_PROJECTS = 5;
// Stale entries (project likely deleted or no longer relevant) age out.
export const RECENT_PROJECT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const storageKey = (userId: string) => `recent-projects:${userId}`;

// Pure MRU upsert: newest first, deduped by id, capped, expired entries dropped.
export const upsertRecentProject = (
  list: RecentProject[],
  entry: RecentProject,
  now: number = Date.now()
): RecentProject[] =>
  [entry, ...list.filter((p) => p.id !== entry.id)]
    .filter((p) => now - p.lastAccessedAt < RECENT_PROJECT_TTL_MS)
    .slice(0, MAX_RECENT_PROJECTS);

export const readRecentProjects = (userId: string, now: number = Date.now()): RecentProject[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (
      parsed
        .filter(
          (p): p is RecentProject =>
            typeof p?.id === "string" &&
            typeof p?.name === "string" &&
            typeof p?.workspaceId === "string" &&
            typeof p?.lastAccessedAt === "number"
        )
        // Apply the TTL on read too, so expired entries never render even if no
        // write (upsert) has run since they aged out.
        .filter((p) => now - p.lastAccessedAt < RECENT_PROJECT_TTL_MS)
    );
  } catch {
    return [];
  }
};

export const recordRecentProject = (userId: string, entry: Omit<RecentProject, "lastAccessedAt">) => {
  if (typeof window === "undefined") return;
  try {
    const next = upsertRecentProject(readRecentProjects(userId), { ...entry, lastAccessedAt: Date.now() });
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Quota / privacy-mode failures are non-fatal — the list is best-effort.
  }
};
