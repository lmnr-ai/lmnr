import { headers } from "next/headers";
import { after, type NextRequest } from "next/server";

import { apiHandler } from "@/lib/api/api-handler";
import { getServerSession } from "@/lib/auth-session";

import { type AuditAction, type AuditOutcome, type AuditResource, outcomeFromStatus } from "./events";
import { getResourceNames } from "./labels";
import { type AuditDetails, type AuditEventPayload, clientIp, postAuditEvent } from "./post";
import { type Params, paramString, type Target, targetFields } from "./target";

export type { AuditDetails } from "./post";

export type { AuditAction, AuditResource } from "./events";

export interface AuditEventMeta {
  resource: AuditResource;
  action: AuditAction;
  /** Read events are sent after the response; writes are awaited before it. */
  read?: boolean;
  /**
   * The request acts on no single resource (a workspace-level setting, a search). Every other
   * handler must call `audit.target` or `audit.skip` (`tests/audit-coverage.test.ts`).
   */
  noTarget?: boolean;
}

/** Handle passed to audited handlers to name the resource or suppress the event. */
export interface AuditHandle {
  /**
   * Names what the request acted on. Display names come from `NAME_SOURCES` and are read when
   * this is called, so a delete must await it before deleting. Pass `name` when the handler
   * already has it, or for resources without a name column (members). `parent` names what contains
   * the target (`{ dashboardId }` for a chart), recorded in metadata under its keys; nothing is
   * taken from the path on its own.
   */
  target: (
    ids: string | readonly string[] | null | undefined,
    opts?: { name?: string; parent?: Record<string, string | null | undefined> }
  ) => Promise<void>;
  /** Metadata, a body-dependent action, or a scope other than the route params. */
  set: (details: AuditDetails) => void;
  /** The request changed nothing worth recording (e.g. a no-op update). */
  skip: () => void;
}

type RouteContext<P> = { params: Promise<P> };

/**
 * Wraps a route handler so every call records an audit event. Every mutating
 * route export must be wrapped in `handlerWithAudit` or `handlerNoAudit`
 * (`tests/audit-coverage.test.ts`). Includes `apiHandler`: thrown errors become
 * their `{ error }` response, and the event's outcome is that response's status.
 */
export const handlerWithAudit =
  <P extends Record<string, string> = Record<string, string>>(
    meta: AuditEventMeta,
    handler: (req: NextRequest, ctx: RouteContext<P>, audit: AuditHandle) => Promise<Response>
  ) =>
  async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    const details: AuditDetails = {};
    const targets: Target[] = [];
    // Label of a target without an id (an invited email).
    let label: string | undefined;
    const parents: Record<string, string> = {};
    const lookups: Promise<void>[] = [];
    let skipped = false;

    const scope = async () => {
      const params: Params = await ctx.params;
      return {
        projectId: details.projectId ?? paramString(params.projectId),
        workspaceId: details.workspaceId ?? paramString(params.workspaceId),
      };
    };
    // Reads look names up after the response, with the event.
    const lookupNames = async (fresh: Target[]) => {
      const names = await getResourceNames(
        meta.resource,
        fresh.map((t) => t.id),
        await scope()
      ).catch(() => new Map<string, string>());
      for (const t of fresh) t.name = names.get(t.id);
    };

    const audit: AuditHandle = {
      target: async (ids, opts) => {
        for (const [key, value] of Object.entries(opts?.parent ?? {})) if (value) parents[key] = value;
        const list = (typeof ids === "string" ? [ids] : (ids ?? [])).filter(
          (id) => id !== "" && !targets.some((t) => t.id === id)
        );
        if (list.length === 0) {
          label = opts?.name ?? label;
          return;
        }
        const fresh = list.map((id) => ({ id, name: list.length === 1 ? opts?.name : undefined }));
        targets.push(...fresh);
        const unnamed = fresh.filter((t) => !t.name);
        if (unnamed.length === 0) return;
        const lookup = lookupNames(unnamed);
        lookups.push(lookup);
        if (!meta.read) await lookup;
      },
      set: (d) => Object.assign(details, d),
      skip: () => {
        skipped = true;
      },
    };

    let status = 500;
    try {
      const res = await apiHandler<P>((r, c) => handler(r, c, audit))(req, ctx);
      status = res.status;
      return res;
    } finally {
      if (!skipped) {
        const session = await getServerSession().catch(() => null);
        const { workspaceId, projectId } = await scope();
        // Without a session or a workspace/project (e.g. a request rejected before
        // its project was resolved) there is no log to attribute the event to.
        if (session?.user && (workspaceId || projectId)) {
          const userId = session.user.id;
          const ip = clientIp(req.headers);
          const userAgent = req.headers.get("user-agent") ?? undefined;
          const send = async () => {
            await Promise.all(lookups);
            const fields = targetFields(targets, label, parents);
            await postAuditEvent({
              ...details,
              ...fields,
              metadata: fields.metadata || details.metadata ? { ...fields.metadata, ...details.metadata } : undefined,
              userId,
              resource: meta.resource,
              action: details.action ?? meta.action,
              workspaceId,
              projectId,
              outcome: outcomeFromStatus(status),
              ip,
              userAgent,
            });
          };
          if (meta.read) after(send);
          else await send();
        }
      }
    }
  };

/** Marks a mutating route as deliberately not audited. */
export const handlerNoAudit = <H>(_reason: string, handler: H): H => handler;

/**
 * Records one event from code that isn't a route handler: server actions,
 * server components, auth hooks. Awaited unless `read` is set.
 */
export const recordAuditEvent = async (
  meta: Omit<AuditEventMeta, "noTarget"> &
    AuditDetails & { resourceId?: string; resourceLabel?: string; userId?: string; outcome?: AuditOutcome }
): Promise<void> => {
  const { resource, action, read, userId, outcome, ...details } = meta;
  const resolvedUserId = userId ?? (await getServerSession().catch(() => null))?.user?.id;
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
  if (read) after(() => postAuditEvent(event));
  else await postAuditEvent(event);
};
