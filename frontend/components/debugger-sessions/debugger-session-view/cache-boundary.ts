import { tryParseJson } from "@/lib/utils";

// Trace-metadata keys the SDK writes on a debug run so the frontend can render the
// replay/cache boundary read-only (shared spec §9). The frontend never derives the
// spine itself — it only reads what the SDK recorded.
// NOTE: exact key names depend on the SDK plan (plan 1); align before merge.
export const REPLAY_TRACE_ID_KEY = "rollout.replay_trace_id";
export const CACHE_UNTIL_KEY = "rollout.cache_until";
export const SPINE_PATH_KEY = "rollout.spine_path";

export interface CacheBoundary {
  replayTraceId: string | null;
  cacheUntil: number | null;
  spinePath: string | null;
}

export const parseCacheBoundary = (metadata: string | undefined): CacheBoundary | null => {
  if (!metadata) return null;

  const parsed = tryParseJson(metadata) as Record<string, unknown> | null;
  if (!parsed) return null;

  const replayTraceId =
    typeof parsed[REPLAY_TRACE_ID_KEY] === "string" ? (parsed[REPLAY_TRACE_ID_KEY] as string) : null;
  if (!replayTraceId) return null;

  const rawCacheUntil = parsed[CACHE_UNTIL_KEY];
  const cacheUntil =
    typeof rawCacheUntil === "number"
      ? rawCacheUntil
      : typeof rawCacheUntil === "string" && rawCacheUntil.trim() !== "" && !isNaN(Number(rawCacheUntil))
        ? Number(rawCacheUntil)
        : null;

  const spinePath = typeof parsed[SPINE_PATH_KEY] === "string" ? (parsed[SPINE_PATH_KEY] as string) : null;

  return { replayTraceId, cacheUntil, spinePath };
};
