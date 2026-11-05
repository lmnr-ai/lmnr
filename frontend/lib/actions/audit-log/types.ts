/** Most rows one CSV export returns. */
export const AUDIT_EXPORT_MAX_ROWS = 100_000;

export interface AuditLogEvent {
  eventId: string;
  timestamp: string;
  projectId: string | null;
  projectName: string;
  actorType: "user" | "api_key";
  actorId: string;
  actorLabel: string;
  /** Workspace role when the event was recorded; empty for API keys. */
  actorRole: string;
  actorOwnerLabel: string;
  source: string;
  resourceType: string;
  action: string;
  resourceId: string;
  resourceLabel: string;
  outcome: "success" | "denied" | "error";
  ip: string;
  userAgent: string;
  /** JSON string; parsed only when an event is opened. */
  metadata: string;
}
