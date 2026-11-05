// Mirror of the app-server audit vocabulary (`app-server/src/audit/mod.rs`).
// Rows are immutable, so values are only ever added, never renamed.
// `tests/audit-events.test.ts` fails if the two lists drift.

export const AUDIT_RESOURCES = [
  "workspace",
  "member",
  "invitation",
  "api_key",
  "project",
  "dataset",
  "datapoint",
  "evaluation",
  "signal",
  "alert",
  "dashboard",
  "chart",
  "trace",
  "sql",
  "sql_template",
  "llm_profile",
  "slack_integration",
  "deployment",
  "license",
  "subscription",
  "report",
  "labeling_queue",
  "playground",
  "render_template",
  "custom_model_cost",
  "tag_class",
  "view",
  "debugger_session",
  "audit_log",
  "agent",
] as const;

export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "view",
  "list",
  "export",
  "query",
  "run",
  "backfill",
  "invite",
  "join",
  "remove",
  "role_update",
  "transfer_ownership",
  "share",
  "unshare",
] as const;

export const AUDIT_SOURCES = ["ui", "api", "cli", "mcp", "agent"] as const;

export const AUDIT_OUTCOMES = ["success", "denied", "error"] as const;

export type AuditResource = (typeof AUDIT_RESOURCES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditSource = (typeof AUDIT_SOURCES)[number];
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

// Same mapping as app-server's `AuditOutcome::from_status`.
export const outcomeFromStatus = (status: number): AuditOutcome => {
  if (status >= 200 && status < 400) return "success";
  if (status === 401 || status === 403) return "denied";
  return "error";
};
