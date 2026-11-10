import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { AUDIT_ACTIONS, AUDIT_OUTCOMES, AUDIT_RESOURCES, AUDIT_SOURCES, type AuditSource } from "@/lib/audit/events";

export const FETCH_SIZE = 50;

/** Range applied when the URL names none. */
export const DEFAULT_PAST_HOURS = "168";

const SOURCE_LABELS: Record<AuditSource, string> = {
  ui: "UI",
  api: "API",
  cli: "CLI",
  mcp: "MCP",
  agent: "Agent",
};

export const sourceLabel = (source: string) => SOURCE_LABELS[source as AuditSource] ?? source;

const humanize = (value: string) => value.replaceAll("_", " ");
const options = (values: readonly string[], label: (value: string) => string = humanize) =>
  values.map((value) => ({ label: label(value), value }));

export const auditLogFilters: ColumnFilter[] = [
  { name: "Project", key: "project_name", dataType: "string" },
  { name: "Actor", key: "actor_label", dataType: "string" },
  { name: "Actor type", key: "actor_type", dataType: "enum", options: options(["user", "api_key"]) },
  { name: "Actor role", key: "actor_role", dataType: "enum", options: options(["owner", "admin", "member"]) },
  { name: "Resource", key: "resource_type", dataType: "enum", options: options(AUDIT_RESOURCES) },
  { name: "Action", key: "action", dataType: "enum", options: options(AUDIT_ACTIONS) },
  { name: "Resource name", key: "resource_label", dataType: "string" },
  { name: "Resource ID", key: "resource_id", dataType: "string" },
  { name: "Source", key: "source", dataType: "enum", options: options(AUDIT_SOURCES, sourceLabel) },
  { name: "Outcome", key: "outcome", dataType: "enum", options: options(AUDIT_OUTCOMES) },
];

export const eventName = (resourceType: string, action: string) => `${resourceType}.${action}`;
