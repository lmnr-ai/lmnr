import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { SEVERITY_LEVEL } from "@/lib/actions/alerts/types";
import { deleteAllProjectsWorkspaceInfoFromCache } from "@/lib/actions/project";
import defaultCharts from "@/lib/db/default-charts.ts";
import { DEFAULT_SIGNAL, DEFAULT_SIGNAL_TRIGGER_VALUE } from "@/lib/db/default-signals.ts";
import { db } from "@/lib/db/drizzle";
import {
  alerts,
  alertTargets,
  dashboardCharts,
  projects,
  signals,
  signalTriggers,
  subscriptionTiers,
  workspaces,
} from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { type Project } from "@/lib/workspaces/types";

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  workspaceId: z.guid(),
  // Optional — when present, the auto-created Failure Detector signal gets
  // an EMAIL alert target for this address (same shape as a UI-created signal).
  subscriberEmail: z.email().optional(),
});

/**
 * Creates a project plus everything every project must have:
 * - default dashboard charts
 * - Failure Detector signal + SIGNAL_EVENT alert (+ optional NEW_CLUSTER alert
 *   when clustering is enabled) + default trigger
 * - EMAIL alert target for the creator when `subscriberEmail` is supplied
 *
 * Any "every project has X" default belongs here, NOT in caller code.
 * Callers (wizard, CLI setup, REST API) should rely on this contract instead
 * of re-seeding defaults themselves.
 */
export async function createProject(input: z.infer<typeof CreateProjectSchema>) {
  const { name, workspaceId, subscriberEmail } = CreateProjectSchema.parse(input);

  try {
    return await db.transaction(async (tx) => {
      const [workspace] = await tx
        .select({ tierName: subscriptionTiers.name })
        .from(workspaces)
        .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
        .where(eq(workspaces.id, workspaceId))
        .limit(1)
        .for("update");

      if (isFeatureEnabled(Feature.SUBSCRIPTION) && workspace?.tierName.trim().toLowerCase() === "free") {
        const existingProjects = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.workspaceId, workspaceId));

        if (existingProjects.length >= 1) {
          throw new Error("Free plan is limited to 1 project per workspace. Please upgrade to create more projects.");
        }
      }

      const [newProject] = await tx
        .insert(projects)
        .values({
          name,
          workspaceId,
        })
        .returning();

      if (!newProject) {
        throw new Error("Failed to create project");
      }

      const chartsToInsert = defaultCharts.map((chart) => ({
        name: chart.name,
        query: chart.query,
        settings: chart.settings,
        projectId: newProject.id,
      }));

      await tx.insert(dashboardCharts).values(chartsToInsert);

      // Failure Detector signal + alert + trigger. Mirrors what createSignal /
      // setTemplateSignals do for UI-created signals, inlined so the seed is
      // transactional with the project insert.
      const [signal] = await tx
        .insert(signals)
        .values({
          projectId: newProject.id,
          name: DEFAULT_SIGNAL.name,
          prompt: DEFAULT_SIGNAL.prompt,
          structuredOutputSchema: DEFAULT_SIGNAL.structuredOutputSchema as Record<string, unknown>,
        })
        .returning();

      const clusteringEnabled = isFeatureEnabled(Feature.CLUSTERING);

      const alertsToInsert: (typeof alerts.$inferInsert)[] = [
        {
          projectId: newProject.id,
          name: `${DEFAULT_SIGNAL.name} alert`,
          type: "SIGNAL_EVENT",
          sourceId: signal.id,
          metadata: {
            severities: [SEVERITY_LEVEL.CRITICAL],
            skipSimilar: clusteringEnabled,
          },
        },
      ];

      if (clusteringEnabled) {
        alertsToInsert.push({
          projectId: newProject.id,
          name: `${DEFAULT_SIGNAL.name} cluster alert`,
          type: "NEW_CLUSTER",
          sourceId: signal.id,
          metadata: {},
        });
      }

      const insertedAlerts = await tx.insert(alerts).values(alertsToInsert).returning({ id: alerts.id });

      if (subscriberEmail && insertedAlerts.length > 0) {
        await tx.insert(alertTargets).values(
          insertedAlerts.map((a) => ({
            alertId: a.id,
            projectId: newProject.id,
            type: "EMAIL" as const,
            email: subscriberEmail,
          }))
        );
      }

      await tx.insert(signalTriggers).values({
        projectId: newProject.id,
        signalId: signal.id,
        value: DEFAULT_SIGNAL_TRIGGER_VALUE,
      });

      return newProject;
    });
  } finally {
    await deleteAllProjectsWorkspaceInfoFromCache(workspaceId);
  }
}

export const getProjectsByWorkspace = async (workspaceId: string): Promise<Project[]> => {
  const results = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    columns: {
      id: true,
      name: true,
      workspaceId: true,
    },
  });

  return results;
};
