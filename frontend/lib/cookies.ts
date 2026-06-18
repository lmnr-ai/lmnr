// Client-safe cookie keys + max-age. Single source of truth shared by the server
// actions that write these cookies (project/workspace `cookies.ts`) AND client
// components that write them directly via `document.cookie` (e.g. the project
// picker) — avoids magic-string drift between the two write paths.
//
// These cookies are NOT httpOnly (the server setters omit the flag), so client-side
// `document.cookie` writes are equivalent to the server-action writes and are read
// back the same way by the /projects and /settings resolvers.
export const LAST_PROJECT_ID = "last-project-id";
export const LAST_WORKSPACE_ID = "last-workspace-id";
export const LAST_ID_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
