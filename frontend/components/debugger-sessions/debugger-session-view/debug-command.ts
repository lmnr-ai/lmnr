// The debug run is driven entirely by the SDK reading LMNR_DEBUG* env vars; the
// frontend only assembles the command a human can paste to kick one off. The
// launch command (e.g. `uv run my_agent.py`) is the user's own, persisted in
// sessionStorage so it survives navigation within the tab.
export const LAUNCH_COMMAND_STORAGE_KEY = "lmnr-debug-launch-command";
export const DEFAULT_LAUNCH_COMMAND = "uv run my_agent.py";

export interface DebugCommandParts {
  sessionId: string;
  replayTraceId?: string | null;
  cacheUntil?: number | null;
  launchCommand?: string;
}

export const buildDebugCommand = ({
  sessionId,
  replayTraceId,
  cacheUntil,
  launchCommand,
}: DebugCommandParts): string => {
  const parts = ["LMNR_DEBUG=1", `LMNR_DEBUG_SESSION_ID=${sessionId}`];

  if (replayTraceId) {
    parts.push(`LMNR_DEBUG_REPLAY_TRACE_ID=${replayTraceId}`);
    if (cacheUntil !== null && cacheUntil !== undefined) {
      parts.push(`LMNR_DEBUG_CACHE_UNTIL=${cacheUntil}`);
    }
  }

  const prefix = parts.join(" ");
  const cmd = launchCommand?.trim();
  return cmd ? `${prefix} ${cmd}` : prefix;
};
