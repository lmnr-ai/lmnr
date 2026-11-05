// Pure: no session or DB imports, so tests can load it.

export type Params = Record<string, string | string[] | undefined>;

export const paramString = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

const ID_PARAM = /^(id|.+Id|.+Key)$/;
const SCOPE_PARAMS = new Set(["projectId", "workspaceId"]);
// Bulk requests keep the first ids and names, plus `count`.
const MAX_LISTED = 100;

/** Path ids that aren't the request's targets, recorded as its parents (`/dashboards/[dashboardId]/charts`). */
const parentParams = (params: Params, targets: string[]) =>
  Object.fromEntries(
    Object.entries(params).flatMap(([key, value]) => {
      const id = paramString(value);
      return id && ID_PARAM.test(key) && !SCOPE_PARAMS.has(key) && !targets.includes(id) ? [[key, id]] : [];
    })
  );

export type Target = { id: string; name?: string };

/** Resource fields of the event: one target is its resource, several go to metadata. */
export const targetFields = (targets: Target[], label: string | undefined, params: Params) => {
  const ids = targets.map((t) => t.id);
  const many = ids.length > 1;
  const names = targets.flatMap((t) => (t.name ? [t.name] : []));
  const metadata: Record<string, unknown> = {
    ...parentParams(params, ids),
    ...(many && {
      ids: ids.slice(0, MAX_LISTED),
      count: ids.length,
    }),
    ...(many && names.length > 0 && { names: names.slice(0, MAX_LISTED) }),
  };
  return {
    resourceId: many ? undefined : ids[0],
    resourceLabel: many ? undefined : (targets[0]?.name ?? label),
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
};
