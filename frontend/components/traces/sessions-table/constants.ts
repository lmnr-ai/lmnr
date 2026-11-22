export const FETCH_SIZE = 50;
export const RESOURCE = "sessions";
export const REALTIME_STORAGE_KEY = "sessions-table:realtime";

/** Base URL of the sessions chart; its SWR keys start with this. */
export const sessionsStatsUrl = (projectId: string) => `/api/projects/${projectId}/sessions/stats`;
