import { headers } from "next/headers";
import { after, type NextRequest } from "next/server";

import { apiHandler } from "@/lib/api/api-handler";
import { getServerSession } from "@/lib/auth-session";

import { type AuditAction, type AuditOutcome, type AuditResource, outcomeFromStatus } from "./events";
import { getResourceNames } from "./labels";
import { type AuditDetails, type AuditEventPayload, clientIp, postAuditEvent } from "./post";

export type { AuditDetails } from "./post";

export type { AuditAction, AuditResource } from "./events";

export interface AuditEventMeta {
  resource: AuditResource;
  action: AuditAction;
  /** Read events are sent after the response; writes are awaited before it. */
  read?: boolean;
}

const dispatch = async (event: AuditEventPayload, read: boolean | undefined) => {
  if (read) {
    after(() => postAuditEvent(event));
    return;
  }
  await postAuditEvent(event);
};

/** Handle passed to audited handlers to describe the resource or suppress the event. */
export interface AuditHandle {
  set: (details: AuditDetails) => void;
  /** The request changed nothing worth recording (e.g. a no-op update). */
  skip: () => void;
}

type RouteContext<P> = { params: Promise<P> };

const paramString = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

// The innermost path param naming a resource (`/datasets/[datasetId]/datapoints/[datapointId]`
// → datapointId), used when the handler doesn't set `resourceId` itself.
const pathResource = (params: Record<string, string | string[] | undefined>) =>
  Object.entries(params)
    .filter(([key]) => key !== "workspaceId" && key !== "projectId" && /^(id|.+Id|.+Key)$/.test(key))
    .map(([key, value]) => [key, paramString(value)] as const)
    .findLast(([, value]) => value !== undefined);

const pathResourceId = (params: Record<string, string | string[] | undefined>) => pathResource(params)?.[1];

const ID_LIST_KEY = /^(id|ids|.+Id|.+Ids)$/;

const idValues = (value: unknown): string[] => {
  if (typeof value === "string") return value.split(",").filter(Boolean);
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
};

// Bulk deletes name their targets in the query string (`?datasetIds=a,b`,
// `?id=a&id=b`) or the JSON body (`{ datapointIds: [...] }`); record them so a
// delete is never just "something was deleted".
const deletedIds = async (url: string, body: Request | null): Promise<string[]> => {
  const fromQuery = [...new URL(url).searchParams.entries()]
    .filter(([key]) => ID_LIST_KEY.test(key))
    .flatMap(([, value]) => idValues(value));
  const json = body ? await body.json().catch(() => null) : null;
  const fromBody =
    json && typeof json === "object"
      ? Object.entries(json as Record<string, unknown>)
          .filter(([key]) => ID_LIST_KEY.test(key))
          .flatMap(([, value]) => idValues(value))
      : [];
  return [...new Set([...fromQuery, ...fromBody])];
};

const deleteTargets = async (
  resource: AuditResource,
  url: string,
  body: Request,
  params: Record<string, string | string[] | undefined>
) => {
  const bodyIds = await deletedIds(url, body);
  const pathId = pathResourceId(params);
  const lookup = bodyIds.length > 0 ? bodyIds : pathId ? [pathId] : [];
  const names = await getResourceNames(resource, lookup, {
    projectId: paramString(params.projectId),
    workspaceId: paramString(params.workspaceId),
  }).catch(() => new Map<string, string>());
  return { bodyIds, names };
};

// Creates have no id in the path; most return the created object, which names it.
const responseResource = async (res: Response): Promise<{ id?: string; label?: string }> => {
  if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return {};
  const body = await res
    .clone()
    .json()
    .catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const { id, name, title } = body as Record<string, unknown>;
  const label = typeof name === "string" ? name : typeof title === "string" ? title : undefined;
  return { id: typeof id === "string" || typeof id === "number" ? String(id) : undefined, label };
};

/**
 * Wraps a route handler so every call records an audit event. Every mutating
 * route export must be wrapped in `withAudit` or `noAudit`
 * (`tests/audit-coverage.test.ts`). Includes `apiHandler`: thrown errors become
 * their `{ error }` response, and the event's outcome is that response's status.
 */
export const withAudit =
  <P extends Record<string, string> = Record<string, string>>(
    meta: AuditEventMeta,
    handler: (req: NextRequest, ctx: RouteContext<P>, audit: AuditHandle) => Promise<Response>
  ) =>
  async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    const details: AuditDetails = {};
    // Cloned before the handler consumes the body.
    const deleteBody = meta.action === "delete" ? req.clone() : null;
    let skipped = false;
    // A create's path names the parent (`/dashboards/[dashboardId]/charts`), never what was created.
    const isCreate = meta.action === "create";
    let handlerNamedResource = false;
    const audit: AuditHandle = {
      set: (d) => Object.assign(details, d),
      skip: () => {
        skipped = true;
      },
    };

    // Read before the handler removes the rows: their ids from the query or body, else the path,
    // and their names.
    const deleted = deleteBody ? await deleteTargets(meta.resource, req.url, deleteBody, await ctx.params) : undefined;

    let status = 500;
    try {
      const res = await apiHandler<P>((r, c) => handler(r, c, audit))(req, ctx);
      status = res.status;
      // Setting `resourceId`, even to undefined (several targets), opts out of the path fallback.
      handlerNamedResource = "resourceId" in details;
      if (!meta.read && !skipped && (!details.resourceId || !details.resourceLabel)) {
        const fromResponse = await responseResource(res);
        // A response id only describes this event's resource when the path named none.
        const pathId = isCreate ? undefined : pathResourceId(await ctx.params);
        if (!details.resourceId && !pathId) details.resourceId = fromResponse.id;
        if (!details.resourceLabel && (!pathId || fromResponse.id === pathId)) {
          details.resourceLabel = fromResponse.label;
        }
      }
      return res;
    } finally {
      if (!skipped) {
        const session = await getServerSession().catch(() => null);
        const params = await ctx.params;
        const workspaceId = details.workspaceId ?? paramString(params.workspaceId);
        const projectId = details.projectId ?? paramString(params.projectId);
        // Without a session or a workspace/project (e.g. a request rejected before
        // its project was resolved) there is no log to attribute the event to.
        if (session?.user && (workspaceId || projectId)) {
          const ids = deleted && !details.resourceId ? deleted.bodyIds : [];
          if (ids.length > 0) {
            details.metadata = { ...details.metadata, ids };
            if (ids.length === 1) details.resourceId = ids[0];
          }
          if (deleted && deleted.names.size > 0) {
            const id = details.resourceId ?? pathResourceId(params);
            if (!details.resourceLabel && id) details.resourceLabel = deleted.names.get(id);
            if (ids.length > 1) {
              details.metadata = { ...details.metadata, names: ids.flatMap((i) => deleted.names.get(i) ?? []) };
            }
          }
          // The path id is a parent when the request names its own targets: a create, ids in the
          // query/body (`/datasets/[datasetId]/datapoints`), or a handler-set resource.
          const pathIsParent = isCreate || ids.length > 0 || handlerNamedResource;
          const pathParam = pathResource(params);
          const parent =
            pathIsParent && !handlerNamedResource && pathParam && !ids.includes(pathParam[1] ?? "")
              ? pathParam
              : undefined;
          if (parent) details.metadata = { [parent[0]]: parent[1], ...details.metadata };
          await dispatch(
            {
              ...details,
              userId: session.user.id,
              resource: meta.resource,
              action: details.action ?? meta.action,
              workspaceId,
              projectId,
              resourceId: details.resourceId ?? (pathIsParent ? undefined : pathResourceId(params)),
              outcome: outcomeFromStatus(status),
              ip: clientIp(req.headers),
              userAgent: req.headers.get("user-agent") ?? undefined,
            },
            meta.read
          );
        }
      }
    }
  };

/** Marks a mutating route as deliberately not audited. */
export const noAudit = <H>(_reason: string, handler: H): H => handler;

/**
 * Records one event from code that isn't a route handler: server actions,
 * server components, auth hooks. Awaited unless `read` is set.
 */
export const recordAuditEvent = async (
  meta: AuditEventMeta & AuditDetails & { userId?: string; outcome?: AuditOutcome }
): Promise<void> => {
  const { resource, action, read, userId, outcome, ...details } = meta;
  const resolvedUserId = userId ?? (await getServerSession().catch(() => null))?.user?.id;
  if (!resolvedUserId) return;
  const h = await headers().catch(() => null);
  await dispatch(
    {
      ...details,
      userId: resolvedUserId,
      resource,
      action,
      outcome: outcome ?? "success",
      ip: h ? clientIp(h) : undefined,
      userAgent: h?.get("user-agent") ?? undefined,
    },
    read
  );
};
