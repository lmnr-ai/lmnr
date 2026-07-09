import * as os from "node:os";
import * as path from "node:path";

// ----------------- Configuration -----------------
/** Read a plugin userConfig value (CLAUDE_PLUGIN_OPTION_<NAME>) with a fallback to a plain env var. */
export function opt(name: string): string {
  return process.env[`CLAUDE_PLUGIN_OPTION_${name}`] || process.env[name] || "";
}

// ----------------- Paths -----------------
// Resolved at call time (not module load) so CC_LMNR_STATE_DIR can relocate the
// state directory and tests can point it at a temp dir.
export function stateDir(): string {
  return opt("CC_LMNR_STATE_DIR") || path.join(os.homedir(), ".claude", "state");
}
export function logFile(): string {
  return path.join(stateDir(), "lmnr_hook.log");
}
export function stateFile(): string {
  return path.join(stateDir(), "lmnr_state.json");
}
export function lockFile(): string {
  return path.join(stateDir(), "lmnr_state.lock");
}

export const DEBUG = opt("CC_LMNR_DEBUG").toLowerCase() === "true";
export const SKILL_TAGS = (opt("CC_LMNR_SKILL_TAGS") || "true").toLowerCase() === "true";
export const CAPTURE_SKILL_CONTENT = opt("CC_LMNR_CAPTURE_SKILL_CONTENT").toLowerCase() === "true";

function parseMaxChars(): number {
  const raw = opt("CC_LMNR_MAX_CHARS") || "20000";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 20000;
}
export const MAX_CHARS = parseMaxChars();

// Bound for unresolved task notifications kept in the state file between runs.
export const MAX_PENDING_TASK_NOTIFICATIONS = 50;

// Cap for a single OTLP export request (connect + response), in seconds.
export const EXPORT_TIMEOUT_S = 5.0;

export interface LaminarConfig {
  apiKey: string;
  baseUrl: string;
  userId: string | null;
}

export function getLaminarConfig(): LaminarConfig | null {
  const apiKey = opt("LMNR_PROJECT_API_KEY") || opt("CC_LMNR_PROJECT_API_KEY");
  const baseUrl = (opt("LMNR_BASE_URL") || opt("CC_LMNR_BASE_URL") || "https://api.lmnr.ai").replace(/\/+$/, "");
  const userId = opt("LMNR_USER_ID") || opt("CC_LMNR_USER_ID") || null;

  if (!apiKey) {
    return null;
  }
  return { apiKey, baseUrl, userId };
}
