import * as os from "node:os";
import * as path from "node:path";

// ----------------- Configuration -----------------
/** Read a plain env var option. */
export function opt(name: string): string {
  return process.env[name] || "";
}

// ----------------- Paths -----------------
/** Codex home directory (rollouts live under <home>/sessions). */
export function codexHome(): string {
  return opt("CODEX_HOME") || path.join(os.homedir(), ".codex");
}

// Resolved at call time (not module load) so CODEX_LMNR_STATE_DIR can relocate
// the state directory and tests can point it at a temp dir.
export function stateDir(): string {
  return opt("CODEX_LMNR_STATE_DIR") || path.join(codexHome(), "lmnr");
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

export const DEBUG = opt("CODEX_LMNR_DEBUG").toLowerCase() === "true";

function parseMaxChars(): number {
  const raw = opt("CODEX_LMNR_MAX_CHARS") || "20000";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 20000;
}
export const MAX_CHARS = parseMaxChars();

// Cap for a single OTLP export request (connect + response), in seconds.
export const EXPORT_TIMEOUT_S = 5.0;

export interface LaminarConfig {
  apiKey: string;
  baseUrl: string;
  userId: string | null;
}

export function getLaminarConfig(): LaminarConfig | null {
  const apiKey = opt("LMNR_PROJECT_API_KEY") || opt("CODEX_LMNR_PROJECT_API_KEY");
  const baseUrl = (opt("LMNR_BASE_URL") || opt("CODEX_LMNR_BASE_URL") || "https://api.lmnr.ai").replace(/\/+$/, "");
  const userId = opt("LMNR_USER_ID") || opt("CODEX_LMNR_USER_ID") || null;

  if (!apiKey) {
    return null;
  }
  return { apiKey, baseUrl, userId };
}
