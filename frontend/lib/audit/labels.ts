import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, type PgTable } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/drizzle";
import {
  alerts,
  customModelCosts,
  dashboardCharts,
  dashboards,
  datasets,
  debuggerSessions,
  evaluations,
  labelingQueues,
  llmProfiles,
  playgrounds,
  projectApiKeys,
  projects,
  renderTemplates,
  signals,
  sqlTemplates,
  tableViews,
  users,
  workspaceInvitations,
  workspaces,
} from "@/lib/db/migrations/schema";

import { type AuditResource } from "./events";

/** Email of the member an event is about, copied onto the event as its label. */
export const getUserEmail = async (userId: string): Promise<string | undefined> => {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.email;
};

/** Project name and workspace, read before a delete removes them. */
export const getProjectScope = async (
  projectId: string
): Promise<{ workspaceId: string; projectName: string } | undefined> => {
  const [row] = await db
    .select({ workspaceId: projects.workspaceId, projectName: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row;
};

type NameSource = {
  table: PgTable;
  id: AnyPgColumn;
  /** A column, or an expression for names with a fallback. */
  name: AnyPgColumn | SQL<string | null>;
  /** Rows are only read inside the request's own project or workspace. */
  scope: AnyPgColumn;
  scopeParam: "projectId" | "workspaceId";
};

const inProject = (
  table: PgTable & { id: AnyPgColumn; projectId: AnyPgColumn },
  name: NameSource["name"]
): NameSource => ({
  table,
  id: table.id,
  name,
  scope: table.projectId,
  scopeParam: "projectId",
});

// Where each resource keeps its display name.
const NAME_SOURCES: Partial<Record<AuditResource, NameSource>> = {
  alert: inProject(alerts, alerts.name),
  // Keys without a name are shown by their shorthand, as in the API keys table.
  api_key: inProject(
    projectApiKeys,
    sql<string>`coalesce(nullif(${projectApiKeys.name}, ''), ${projectApiKeys.shorthand})`
  ),
  chart: inProject(dashboardCharts, dashboardCharts.name),
  custom_model_cost: inProject(customModelCosts, customModelCosts.model),
  dashboard: inProject(dashboards, dashboards.name),
  dataset: inProject(datasets, datasets.name),
  debugger_session: inProject(debuggerSessions, debuggerSessions.name),
  evaluation: inProject(evaluations, evaluations.name),
  labeling_queue: inProject(labelingQueues, labelingQueues.name),
  playground: inProject(playgrounds, playgrounds.name),
  render_template: inProject(renderTemplates, renderTemplates.name),
  signal: inProject(signals, signals.name),
  sql_template: inProject(sqlTemplates, sqlTemplates.name),
  view: inProject(tableViews, tableViews.name),
  llm_profile: {
    table: llmProfiles,
    id: llmProfiles.id,
    name: llmProfiles.name,
    scope: llmProfiles.workspaceId,
    scopeParam: "workspaceId",
  },
  invitation: {
    table: workspaceInvitations,
    id: workspaceInvitations.id,
    name: workspaceInvitations.email,
    scope: workspaceInvitations.workspaceId,
    scopeParam: "workspaceId",
  },
  project: { table: projects, id: projects.id, name: projects.name, scope: projects.id, scopeParam: "projectId" },
  workspace: {
    table: workspaces,
    id: workspaces.id,
    name: workspaces.name,
    scope: workspaces.id,
    scopeParam: "workspaceId",
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Display names by id; empty for resources without a name source. */
export const getResourceNames = async (
  resource: AuditResource,
  ids: string[],
  scope: { projectId?: string; workspaceId?: string }
): Promise<Map<string, string>> => {
  const source = NAME_SOURCES[resource];
  const scopeId = source && scope[source.scopeParam];
  const valid = ids.filter((id) => UUID_RE.test(id));
  if (!source || !scopeId || valid.length === 0) return new Map();
  const rows = await db
    .select({ id: source.id, name: source.name })
    .from(source.table)
    .where(and(inArray(source.id, valid), eq(source.scope, scopeId)));
  return new Map(
    rows.flatMap((row) => (typeof row.name === "string" && row.name ? [[String(row.id), row.name] as const] : []))
  );
};
