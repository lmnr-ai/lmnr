import { headers } from "next/headers";
import { after } from "next/server";

import { getServerSession } from "@/lib/auth-session";

import { type AuditOutcome } from "./events";
import { type AuditEventMeta, createHandlerWithAudit } from "./handler";
import { getResourceNames } from "./labels";
import { type AuditDetails, type AuditEventPayload, clientIp, postAuditEvent } from "./post";

export type { AuditDetails } from "./post";

export type { AuditAction, AuditResource } from "./events";

export type { AuditEventMeta, AuditHandle } from "./handler";

const getUserId = async () => (await getServerSession().catch(() => null))?.user?.id;

/**
 * Wraps a route handler so every call records an audit event. Every mutating
 * route export must be wrapped in `handlerWithAudit` or `handlerNoAudit`
 * (`tests/audit-coverage.test.ts`). Includes `apiHandler`: thrown errors become
 * their `{ error }` response, and the event's outcome is that response's status.
 */
export const handlerWithAudit = createHandlerWithAudit({
  getUserId,
  getNames: getResourceNames,
  post: postAuditEvent,
  after,
});

/** Marks a mutating route as deliberately not audited. */
export const handlerNoAudit = <H>(_reason: string, handler: H): H => handler;

/**
 * Records one event from code that isn't a route handler: server actions,
 * server components, auth hooks. Sent after the response.
 */
export const recordAuditEvent = async (
  meta: Omit<AuditEventMeta, "noTarget" | "read"> &
    AuditDetails & { resourceId?: string; resourceLabel?: string; userId?: string; outcome?: AuditOutcome }
): Promise<void> => {
  const { resource, action, userId, outcome, ...details } = meta;
  try {
    const resolvedUserId = userId ?? (await getUserId());
    if (!resolvedUserId) return;
    const h = await headers().catch(() => null);
    const event: AuditEventPayload = {
      ...details,
      userId: resolvedUserId,
      resource,
      action,
      outcome: outcome ?? "success",
      ip: h ? clientIp(h) : undefined,
      userAgent: h?.get("user-agent") ?? undefined,
    };
    after(() => postAuditEvent(event));
  } catch (e) {
    // `after` throws outside a request scope; the caller's work must go on.
    console.error(`Failed to record audit event ${resource}.${action}:`, e);
  }
};
