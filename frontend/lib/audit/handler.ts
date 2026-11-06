// No session or DB imports: `index.ts` injects them, so tests can drive the wrapper.
import { type NextRequest } from "next/server";

import { apiHandler } from "@/lib/api/api-handler";

import { type AuditAction, type AuditResource, outcomeFromStatus } from "./events";
import { type AuditDetails, type AuditEventPayload, clientIp } from "./post";
import { type Params, paramString, type Target, targetFields } from "./target";

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
   * taken from the path on its own. Never throws, whatever the request body held.
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

export type RouteContext<P> = { params: Promise<P> };

export interface AuditDeps {
  getUserId: () => Promise<string | undefined>;
  getNames: (
    resource: AuditResource,
    ids: string[],
    scope: { projectId?: string; workspaceId?: string }
  ) => Promise<Map<string, string>>;
  post: (event: AuditEventPayload) => Promise<void>;
  after: (task: () => Promise<void>) => void;
}

const logAuditError = (meta: AuditEventMeta, e: unknown) =>
  console.error(`Failed to record audit event ${meta.resource}.${meta.action}:`, e);

// Ids come from request bodies, so anything but non-empty strings is dropped.
const idList = (ids: unknown): string[] =>
  (typeof ids === "string" ? [ids] : Array.isArray(ids) ? ids : []).filter(
    (id): id is string => typeof id === "string" && id !== ""
  );

/**
 * Builds `handlerWithAudit`. The audit side never changes the handler's response: every
 * failure in it (a missing `ctx.params`, a session or DB error, a malformed id) is logged.
 */
export const createHandlerWithAudit =
  (deps: AuditDeps) =>
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
      // Routes without dynamic segments get no `ctx.params`.
      const params: Params = (await ctx?.params) ?? {};
      return {
        projectId: details.projectId ?? paramString(params.projectId),
        workspaceId: details.workspaceId ?? paramString(params.workspaceId),
      };
    };
    // Reads look names up after the response, with the event.
    const lookupNames = async (fresh: Target[]) => {
      try {
        const names = await deps.getNames(
          meta.resource,
          fresh.map((t) => t.id),
          await scope()
        );
        for (const t of fresh) t.name = names.get(t.id);
      } catch (e) {
        logAuditError(meta, e);
      }
    };

    const audit: AuditHandle = {
      target: async (ids, opts) => {
        try {
          for (const [key, value] of Object.entries(opts?.parent ?? {})) {
            if (typeof value === "string" && value) parents[key] = value;
          }
          const list = idList(ids).filter((id) => !targets.some((t) => t.id === id));
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
        } catch (e) {
          logAuditError(meta, e);
        }
      },
      set: (d) => {
        if (d && typeof d === "object") Object.assign(details, d);
      },
      skip: () => {
        skipped = true;
      },
    };

    // Runs after the response is settled; anything thrown here would replace it.
    const record = async (status: number) => {
      const userId = await deps.getUserId();
      const { workspaceId, projectId } = await scope();
      // Without a user or a workspace/project (e.g. a request rejected before
      // its project was resolved) there is no log to attribute the event to.
      if (!userId || !(workspaceId || projectId)) return;
      const ip = clientIp(req.headers);
      const userAgent = req.headers.get("user-agent") ?? undefined;
      const send = async () => {
        try {
          await Promise.all(lookups);
          const fields = targetFields(targets, label, parents);
          await deps.post({
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
        } catch (e) {
          logAuditError(meta, e);
        }
      };
      if (meta.read) deps.after(send);
      else await send();
    };

    let status = 500;
    try {
      const res = await apiHandler<P>((r, c) => handler(r, c, audit))(req, ctx);
      status = res.status;
      return res;
    } finally {
      if (!skipped) await record(status).catch((e) => logAuditError(meta, e));
    }
  };
