import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { callAppServer } from "@/lib/api/backend";
import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { alerts, metricAlertIncidents, metricAlertStates } from "@/lib/db/migrations/schema";

import {
  METRIC_ALERT_TYPE,
  type MetricAlert,
  type MetricAlertDetail,
  type MetricAlertLevel,
  type MetricRule,
  type MetricRulePreview,
  MetricRuleSchema,
  type RuleCadence,
} from "./metric-rule";
import { getTargetsByAlert } from "./targets";

const INCIDENT_HISTORY_LIMIT = 50;
const LEVEL_ORDER: Record<MetricAlertLevel, number> = { ok: 0, warning: 1, critical: 2 };

/** Checks a rule with the engine that will run it and says how often it is checked. */
export const validateMetricRule = async (projectId: string, rule: unknown): Promise<RuleCadence> =>
  callAppServer<RuleCadence>(`/projects/${projectId}/metric-alerts/validate`, { method: "POST", body: { rule } });

/**
 * The one place a metric rule is accepted before it is stored: the settings
 * form and the CLI both save through here. Mute and snooze are kept from the
 * stored rule unless the caller sets them.
 */
export const parseMetricRule = async (
  projectId: string,
  metadata: unknown,
  stored?: Record<string, unknown> | null
): Promise<MetricRule> => {
  const kept = { snoozedUntil: stored?.snoozedUntil, disabled: stored?.disabled };
  const rule = MetricRuleSchema.parse({ ...kept, ...(metadata as Record<string, unknown> | null) });
  await validateMetricRule(projectId, rule);
  return rule;
};

const PreviewSchema = z.object({
  rule: z.unknown(),
  alertId: z.guid().optional(),
  hours: z.number().int().positive().optional(),
});

/** Replays a rule over recent history. The rule does not have to be saved. */
export const previewMetricRule = async (projectId: string, input: unknown): Promise<MetricRulePreview> =>
  callAppServer<MetricRulePreview>(`/projects/${projectId}/metric-alerts/preview`, {
    method: "POST",
    body: PreviewSchema.parse(input),
  });

const worstLevel = (levels: MetricAlertLevel[]): MetricAlertLevel =>
  levels.reduce<MetricAlertLevel>((worst, level) => (LEVEL_ORDER[level] > LEVEL_ORDER[worst] ? level : worst), "ok");

export const getMetricAlerts = async (
  projectId: string,
  userEmail?: string,
  alertId?: string
): Promise<MetricAlert[]> => {
  const rows = await db
    .select({ id: alerts.id, name: alerts.name, createdAt: alerts.createdAt, metadata: alerts.metadata })
    .from(alerts)
    .where(
      and(
        eq(alerts.projectId, projectId),
        eq(alerts.type, METRIC_ALERT_TYPE),
        alertId ? eq(alerts.id, alertId) : undefined
      )
    )
    .orderBy(alerts.createdAt);
  if (rows.length === 0) return [];

  const alertIds = rows.map((row) => row.id);
  const [targetsByAlert, states] = await Promise.all([
    getTargetsByAlert(alertIds, userEmail),
    db
      .select({ alertId: metricAlertStates.alertId, group: metricAlertStates.groupKey, level: metricAlertStates.level })
      .from(metricAlertStates)
      .where(and(eq(metricAlertStates.projectId, projectId), inArray(metricAlertStates.alertId, alertIds))),
  ]);

  return rows.flatMap((row) => {
    // A row the form could not have written is left out instead of breaking the list.
    const rule = MetricRuleSchema.safeParse(row.metadata);
    if (!rule.success) return [];
    const firing = states.filter((state) => state.alertId === row.id && state.level !== "ok");
    return [
      {
        id: row.id,
        name: row.name,
        projectId,
        createdAt: row.createdAt,
        rule: rule.data,
        targets: targetsByAlert.get(row.id) ?? [],
        level: worstLevel(firing.map((state) => state.level as MetricAlertLevel)),
        firingGroups: firing.map((state) => state.group).filter(Boolean),
      },
    ];
  });
};

export const getMetricAlert = async (
  projectId: string,
  alertId: string,
  userEmail?: string
): Promise<MetricAlertDetail> => {
  const [alert] = await getMetricAlerts(projectId, userEmail, alertId);
  if (!alert) throw new NotFoundError("Alert not found");

  const incidents = await db
    .select({
      id: metricAlertIncidents.id,
      group: metricAlertIncidents.groupKey,
      level: metricAlertIncidents.level,
      peakLevel: metricAlertIncidents.peakLevel,
      peakValue: metricAlertIncidents.peakValue,
      openedAt: metricAlertIncidents.openedAt,
      escalatedAt: metricAlertIncidents.escalatedAt,
      reopenedAt: metricAlertIncidents.reopenedAt,
      resolvedAt: metricAlertIncidents.resolvedAt,
    })
    .from(metricAlertIncidents)
    .where(and(eq(metricAlertIncidents.projectId, projectId), eq(metricAlertIncidents.alertId, alertId)))
    .orderBy(desc(metricAlertIncidents.openedAt))
    .limit(INCIDENT_HISTORY_LIMIT);

  return { ...alert, incidents: incidents as MetricAlertDetail["incidents"] };
};

const SnoozeSchema = z.object({
  projectId: z.guid(),
  alertId: z.guid(),
  /** When notifications resume; `null` ends the snooze. */
  until: z.iso.datetime({ offset: true }).nullable(),
});

/** Stops a rule's messages until a time. The rule keeps being checked, so its incident can still resolve. */
export const snoozeMetricAlert = async (input: z.input<typeof SnoozeSchema>) => {
  const { projectId, alertId, until } = SnoozeSchema.parse(input);
  const where = and(eq(alerts.id, alertId), eq(alerts.projectId, projectId), eq(alerts.type, METRIC_ALERT_TYPE));

  // One statement, so a mute or an edit saved at the same moment is not overwritten.
  const [updated] = await db
    .update(alerts)
    .set({ metadata: sql`jsonb_set(${alerts.metadata}, '{snoozedUntil}', ${JSON.stringify(until)}::jsonb)` })
    .where(where)
    .returning({ id: alerts.id });
  if (!updated) throw new NotFoundError("Alert not found");
  return { id: alertId, snoozedUntil: until };
};
