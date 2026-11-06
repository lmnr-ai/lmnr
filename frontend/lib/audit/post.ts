// No session imports here: `lib/auth.ts` records member joins through this
// module, and `@/lib/auth-session` imports `lib/auth`.
import type { AuditAction, AuditOutcome, AuditResource, AuditSource } from "./events";

/** What the handler knows about the event besides its target. The wrapper fills in everything else. */
export interface AuditDetails {
  /** Overrides the route param; required when the project may already be deleted. */
  workspaceId?: string;
  projectId?: string;
  projectName?: string;
  /** For routes whose body decides what happened (e.g. share vs unshare). */
  action?: AuditAction;
  /** Defaults to `ui`; `cli` for routes the CLI calls with a session bearer. */
  source?: AuditSource;
  metadata?: Record<string, unknown>;
}

export interface AuditEventPayload extends AuditDetails {
  resourceId?: string;
  resourceLabel?: string;
  userId: string;
  resource: AuditResource;
  action: AuditAction;
  outcome: AuditOutcome;
  ip?: string;
  userAgent?: string;
}

export const clientIp = (h: Headers) =>
  h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;

// app-server enriches ids into labels (workspace, project name, email) and
// replies after the broker confirmed the publish.
export const postAuditEvent = async (event: AuditEventPayload): Promise<void> => {
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/v1/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        actor: { type: "user", userId: event.userId },
        source: event.source ?? "ui",
        workspaceId: event.workspaceId,
        projectId: event.projectId,
        projectName: event.projectName,
        resourceType: event.resource,
        action: event.action,
        resourceId: event.resourceId,
        resourceLabel: event.resourceLabel,
        outcome: event.outcome,
        ip: event.ip,
        userAgent: event.userAgent,
        metadata: event.metadata,
      }),
    });
    if (!res.ok) {
      console.error(`Failed to record audit event ${event.resource}.${event.action}: ${await res.text()}`);
    }
  } catch (e) {
    console.error(`Failed to record audit event ${event.resource}.${event.action}:`, e);
  }
};
