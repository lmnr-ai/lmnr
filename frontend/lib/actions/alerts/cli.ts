import { and, asc, eq, inArray } from "drizzle-orm";
import { prettifyError, z, ZodError } from "zod/v4";

import { type Filter, FilterSchema } from "@/lib/actions/common/filter-schemas";
import { getSlackChannels, getSlackIntegration, type SlackChannel } from "@/lib/actions/slack";
import { ALERT_FILTERS_CACHE_KEY, cache } from "@/lib/cache.ts";
import { db } from "@/lib/db/drizzle";
import { alertFilters, alerts, alertTargets, projects, signals } from "@/lib/db/migrations/schema";

import { ALERT_TARGET_TYPE, ALERT_TYPE, type AlertMetadata, type AlertType } from "./types";

// The `lmnr-cli alert` write API (`/api/cli/projects/:projectId/alerts`, reached through
// app-server's `/v1/cli/alerts`). It writes the same rows as the settings form. Reads go through
// SQL (`alerts`, `alert_targets`, `alert_filters`).

export class AlertApiError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404
  ) {
    super(message);
    this.name = "AlertApiError";
  }
}

// A severity's index is its stored level (`metadata.severities`).
const SEVERITIES = ["info", "warning", "critical"] as const;
type Severity = (typeof SEVERITIES)[number];

const FilterGroupsSchema = z.array(z.array(FilterSchema));

const UpdateAlertBodySchema = z.object({
  name: z.string().nullish(),
  severities: z.array(z.enum(SEVERITIES)).nullish(),
  skipSimilar: z.boolean().nullish(),
  disabled: z.boolean().nullish(),
  notifyMe: z.boolean().nullish(),
  slackChannels: z.array(z.string()).nullish(),
  filters: FilterGroupsSchema.nullish(),
});

const CreateAlertBodySchema = UpdateAlertBodySchema.extend({
  signalId: z.guid(),
  type: z.enum([ALERT_TYPE.SIGNAL_EVENT, ALERT_TYPE.NEW_CLUSTER]).nullish(),
});

export interface CliAlert {
  id: string;
  name: string;
  type: string;
  signalId: string;
  signalName: string | null;
  /** Empty for NEW_CLUSTER alerts. */
  severities: Severity[];
  skipSimilar: boolean;
  disabled: boolean;
  /** Whether the caller's email is a target. */
  notifyMe: boolean;
  slackChannels: { channelId: string; channelName: string | null }[];
  filters: Filter[][];
  createdAt: string;
}

export interface CliAlertContext {
  projectId: string;
  userEmail: string | null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getCliAlert(ctx: CliAlertContext, alertId: string): Promise<CliAlert> {
  const [alert] = await queryAlerts(ctx, and(eq(alerts.projectId, ctx.projectId), eq(alerts.id, alertId)));
  if (!alert) throw new AlertApiError("Alert not found", 404);
  return alert;
}

export async function createCliAlert(ctx: CliAlertContext, input: unknown): Promise<CliAlert> {
  const body = CreateAlertBodySchema.parse(input);
  const type = body.type ?? ALERT_TYPE.SIGNAL_EVENT;
  const signal = await getSignal(ctx.projectId, body.signalId);
  if (!signal) throw new AlertApiError("Signal not found", 404);

  const name = body.name == null ? `${signal.name} alert` : validateName(body.name);
  const metadata = buildMetadata(
    type,
    {
      // A new SIGNAL_EVENT alert defaults to critical only. NEW_CLUSTER has no severities.
      severities: body.severities ?? (type === ALERT_TYPE.SIGNAL_EVENT ? ["critical"] : undefined),
      skipSimilar: body.skipSimilar ?? undefined,
      disabled: body.disabled ?? undefined,
    },
    {}
  );
  const filters = body.filters ? validateFilters(type, body.filters, signal.structuredOutputSchema) : [];
  const slack = await resolveSlackChannels(ctx.projectId, body.slackChannels ?? []);
  // Default on, but an account without an email simply gets no email target.
  const email = body.notifyMe === false ? null : body.notifyMe ? requireEmail(ctx.userEmail) : ctx.userEmail;

  const alertId = await db.transaction(async (tx) => {
    const [alert] = await tx
      .insert(alerts)
      .values({ projectId: ctx.projectId, name, type, sourceId: body.signalId, metadata })
      .returning({ id: alerts.id });
    await insertTargets(tx, ctx.projectId, alert.id, slack, email);
    await insertFilters(tx, ctx.projectId, alert.id, filters);
    return alert.id;
  });

  return getCliAlert(ctx, alertId);
}

/** A partial patch: omitted fields keep their stored value. `slackChannels` and `filters` replace the whole list. */
export async function updateCliAlert(ctx: CliAlertContext, alertId: string, input: unknown): Promise<CliAlert> {
  const body = UpdateAlertBodySchema.parse(input);
  if (Object.values(body).every((v) => v == null)) {
    throw new AlertApiError(
      "Nothing to update. Pass at least one of name, severities, skipSimilar, disabled, notifyMe, slackChannels, filters.",
      400
    );
  }
  const name = body.name == null ? undefined : validateName(body.name);
  // Slack lookups are network calls, so they run before the row lock is taken.
  const slack = body.slackChannels == null ? null : await resolveSlackChannels(ctx.projectId, body.slackChannels);
  const email = body.notifyMe == null ? null : body.notifyMe ? requireEmail(ctx.userEmail) : ctx.userEmail;

  await db.transaction(async (tx) => {
    const [stored] = await tx
      .select({ type: alerts.type, sourceId: alerts.sourceId, metadata: alerts.metadata })
      .from(alerts)
      .where(and(eq(alerts.id, alertId), eq(alerts.projectId, ctx.projectId)))
      .for("update");
    if (!stored) throw new AlertApiError("Alert not found", 404);
    const type = stored.type as AlertType;

    const metadata = buildMetadata(
      type,
      {
        severities: body.severities ?? undefined,
        skipSimilar: body.skipSimilar ?? undefined,
        disabled: body.disabled ?? undefined,
      },
      (stored.metadata as AlertMetadata) ?? {}
    );
    let filters: Filter[][] | null = null;
    if (body.filters != null) {
      const signal = await getSignal(ctx.projectId, stored.sourceId);
      if (!signal) {
        throw new AlertApiError("The alert's signal no longer exists, so its filters can't be checked", 400);
      }
      filters = validateFilters(type, body.filters, signal.structuredOutputSchema);
    }

    await tx
      .update(alerts)
      .set({ metadata, ...(name !== undefined && { name }) })
      .where(and(eq(alerts.id, alertId), eq(alerts.projectId, ctx.projectId)));
    if (slack) {
      await tx.delete(alertTargets).where(targetsOf(ctx.projectId, alertId, ALERT_TARGET_TYPE.SLACK));
    }
    if (email) {
      // Delete then re-insert so `notifyMe: true` is idempotent.
      await tx
        .delete(alertTargets)
        .where(and(targetsOf(ctx.projectId, alertId, ALERT_TARGET_TYPE.EMAIL), eq(alertTargets.email, email)));
    }
    await insertTargets(tx, ctx.projectId, alertId, slack ?? [], body.notifyMe ? email : null);
    if (filters) {
      await tx
        .delete(alertFilters)
        .where(and(eq(alertFilters.projectId, ctx.projectId), eq(alertFilters.alertId, alertId)));
      await insertFilters(tx, ctx.projectId, alertId, filters);
    }
  });

  await cache.remove(`${ALERT_FILTERS_CACHE_KEY}:${ctx.projectId}:${alertId}`);
  return getCliAlert(ctx, alertId);
}

export async function deleteCliAlert(ctx: CliAlertContext, alertId: string): Promise<void> {
  const deleted = await db
    .delete(alerts)
    .where(and(eq(alerts.id, alertId), eq(alerts.projectId, ctx.projectId)))
    .returning({ id: alerts.id });
  if (deleted.length === 0) throw new AlertApiError("Alert not found", 404);
  await cache.remove(`${ALERT_FILTERS_CACHE_KEY}:${ctx.projectId}:${alertId}`);
}

async function queryAlerts(ctx: CliAlertContext, where: ReturnType<typeof and>): Promise<CliAlert[]> {
  const rows = await db
    .select({
      id: alerts.id,
      name: alerts.name,
      type: alerts.type,
      signalId: alerts.sourceId,
      signalName: signals.name,
      metadata: alerts.metadata,
      createdAt: alerts.createdAt,
    })
    .from(alerts)
    .leftJoin(signals, eq(alerts.sourceId, signals.id))
    .where(where)
    .orderBy(asc(alerts.createdAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [targets, filters] = await Promise.all([
    db
      .select()
      .from(alertTargets)
      .where(and(eq(alertTargets.projectId, ctx.projectId), inArray(alertTargets.alertId, ids))),
    db
      .select({ alertId: alertFilters.alertId, value: alertFilters.value })
      .from(alertFilters)
      .where(and(eq(alertFilters.projectId, ctx.projectId), inArray(alertFilters.alertId, ids)))
      .orderBy(asc(alertFilters.createdAt)),
  ]);

  return rows.map((row) => {
    const metadata = (row.metadata as AlertMetadata) ?? {};
    const own = targets.filter((t) => t.alertId === row.id);
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      signalId: row.signalId,
      signalName: row.signalName,
      severities: row.type === ALERT_TYPE.SIGNAL_EVENT ? storedSeverities(metadata) : [],
      skipSimilar: metadata.skipSimilar === true,
      disabled: metadata.disabled === true,
      notifyMe:
        ctx.userEmail !== null && own.some((t) => t.type === ALERT_TARGET_TYPE.EMAIL && t.email === ctx.userEmail),
      slackChannels: own
        .filter((t) => t.type === ALERT_TARGET_TYPE.SLACK && t.channelId)
        .map((t) => ({ channelId: t.channelId!, channelName: t.channelName })),
      filters: filters.filter((f) => f.alertId === row.id).map((f) => f.value as Filter[]),
      createdAt: row.createdAt,
    };
  });
}

async function getSignal(projectId: string, signalId: string) {
  const [signal] = await db
    .select({ name: signals.name, structuredOutputSchema: signals.structuredOutputSchema })
    .from(signals)
    .where(and(eq(signals.id, signalId), eq(signals.projectId, projectId)))
    .limit(1);
  return signal;
}

function targetsOf(projectId: string, alertId: string, type: string) {
  return and(eq(alertTargets.projectId, projectId), eq(alertTargets.alertId, alertId), eq(alertTargets.type, type));
}

async function insertTargets(
  tx: Tx,
  projectId: string,
  alertId: string,
  slack: ResolvedSlackChannel[],
  email: string | null
) {
  const rows: (typeof alertTargets.$inferInsert)[] = slack.map(({ integrationId, channel }) => ({
    alertId,
    projectId,
    type: ALERT_TARGET_TYPE.SLACK,
    integrationId,
    channelId: channel.id,
    channelName: channel.name,
  }));
  if (email) rows.push({ alertId, projectId, type: ALERT_TARGET_TYPE.EMAIL, email });
  if (rows.length > 0) await tx.insert(alertTargets).values(rows);
}

async function insertFilters(tx: Tx, projectId: string, alertId: string, groups: Filter[][]) {
  if (groups.length > 0) {
    await tx.insert(alertFilters).values(groups.map((value) => ({ projectId, alertId, value })));
  }
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new AlertApiError("name must not be blank", 400);
  return trimmed;
}

function requireEmail(email: string | null): string {
  if (!email) throw new AlertApiError("Your account has no email, so notifyMe can't be set", 400);
  return email;
}

interface MetadataPatch {
  severities?: Severity[];
  skipSimilar?: boolean;
  disabled?: boolean;
}

/** Merges the patch over the stored metadata. `skipSimilar` / `disabled` are only stored when true. */
function buildMetadata(type: AlertType, patch: MetadataPatch, stored: AlertMetadata): AlertMetadata {
  const metadata: AlertMetadata = { ...stored };
  if (type === ALERT_TYPE.SIGNAL_EVENT) {
    if (patch.severities) {
      const levels = [...new Set(patch.severities.map((s) => SEVERITIES.indexOf(s)))].sort((a, b) => a - b);
      if (levels.length === 0) {
        throw new AlertApiError("severities must list at least one of info, warning, critical", 400);
      }
      metadata.severities = levels;
    }
    if (patch.skipSimilar !== undefined) setFlag(metadata, "skipSimilar", patch.skipSimilar);
  } else if (patch.severities || patch.skipSimilar !== undefined) {
    throw new AlertApiError("severities and skipSimilar only apply to SIGNAL_EVENT alerts", 400);
  }
  if (patch.disabled !== undefined) setFlag(metadata, "disabled", patch.disabled);
  return metadata;
}

function setFlag(metadata: AlertMetadata, key: string, value: boolean) {
  if (value) metadata[key] = true;
  else delete metadata[key];
}

/** Absent means critical only, as the event pipeline reads it. */
function storedSeverities(metadata: AlertMetadata): Severity[] {
  const levels: unknown = metadata.severities;
  if (!Array.isArray(levels)) return ["critical"];
  return levels.flatMap((l) => (typeof l === "number" && SEVERITIES[l] ? [SEVERITIES[l]] : []));
}

/** Filters run against the signal's extracted payload, so each column must be one of its output fields. */
function validateFilters(type: AlertType, groups: Filter[][], schema: unknown): Filter[][] {
  if (type !== ALERT_TYPE.SIGNAL_EVENT && groups.length > 0) {
    throw new AlertApiError("filters only apply to SIGNAL_EVENT alerts", 400);
  }
  const properties = (schema as { properties?: Record<string, unknown> } | null)?.properties ?? {};
  const fields = Object.keys(properties).sort();
  groups.forEach((group, i) => {
    if (group.length === 0) throw new AlertApiError(`filters[${i}] must have at least one condition`, 400);
    const bad = group.find((f) => !fields.includes(f.column));
    if (bad) {
      throw new AlertApiError(
        `filters[${i}]: column "${bad.column}" is not a field of the signal's output; fields: ${fields.join(", ")}`,
        400
      );
    }
  });
  return groups;
}

interface ResolvedSlackChannel {
  integrationId: string;
  channel: SlackChannel;
}

/** Resolves each channel id or `#name` against the workspace's Slack, deduplicated by channel id. */
async function resolveSlackChannels(projectId: string, refs: string[]): Promise<ResolvedSlackChannel[]> {
  if (refs.length === 0) return [];
  const [project] = await db
    .select({ workspaceId: projects.workspaceId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const integration = project ? await getSlackIntegration(project.workspaceId) : null;
  if (!project || !integration) {
    throw new AlertApiError(
      "Slack isn't connected to this workspace. Connect it in Settings → Integrations first.",
      400
    );
  }
  const { channels, rateLimited } = await getSlackChannels(project.workspaceId);

  const resolved: ResolvedSlackChannel[] = [];
  for (const ref of refs) {
    const name = ref.replace(/^#/, "");
    const channel = channels.find((c) => c.id === ref || c.name === name);
    if (!channel) {
      throw new AlertApiError(
        rateLimited
          ? `Slack rate-limited the channel lookup before "${ref}" was found; retry in a minute or pass the channel id`
          : `No Slack channel "${ref}" in the connected workspace (archived channels and private channels the Laminar app isn't in are not listed)`,
        400
      );
    }
    if (!resolved.some((r) => r.channel.id === channel.id)) {
      resolved.push({ integrationId: integration.id, channel });
    }
  }
  return resolved;
}

/** Maps a CLI alert failure to the `{ error }` JSON the CLI prints. */
export function cliAlertErrorResponse(error: unknown): Response {
  if (error instanceof AlertApiError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return Response.json({ error: prettifyError(error) }, { status: 400 });
  console.error("cli alerts error:", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
