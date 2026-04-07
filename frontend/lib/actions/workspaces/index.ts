import { desc, eq, inArray } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { z } from "zod/v4";

import { createProject } from "@/lib/actions/projects";
import { REPORT_TARGET_TYPE } from "@/lib/actions/reports/types";
import { authOptions } from "@/lib/auth";
import { defaultReports } from "@/lib/db/default-charts.ts";
import { DEFAULT_SIGNAL, DEFAULT_SIGNAL_TRIGGER_VALUE } from "@/lib/db/default-signals.ts";
import { db } from "@/lib/db/drizzle";
import {
  membersOfWorkspaces,
  reports,
  reportTargets,
  signals,
  signalTriggers,
  subscriptionTiers,
  workspaceAddons,
  workspaces,
} from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { type Workspace, WorkspaceTier } from "@/lib/workspaces/types";

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required"),
  projectName: z.string().optional(),
  isFirstProject: z.boolean().optional(),
});

type CreateWorkspaceResult = {
  id: string;
  name: string;
  tierName: WorkspaceTier;
  projectId?: string;
};

export const createWorkspace = async (input: z.infer<typeof CreateWorkspaceSchema>): Promise<CreateWorkspaceResult> => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  const { name, projectName, isFirstProject } = CreateWorkspaceSchema.parse(input);
  const userId = session.user.id;
  const userEmail = session.user.email;

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name,
      tierId: 1,
    })
    .returning({
      id: workspaces.id,
      name: workspaces.name,
    });

  if (!workspace) {
    throw new Error("Failed to create workspace");
  }

  await db.insert(membersOfWorkspaces).values({
    userId,
    workspaceId: workspace.id,
    memberRole: "owner",
  });

  const insertedReports = await db
    .insert(reports)
    .values(
      defaultReports.map((r) => ({
        workspaceId: workspace.id,
        type: r.type,
        weekdays: r.weekdays,
        hour: r.hour,
      }))
    )
    .returning({ id: reports.id });

  let projectId: string | undefined;

  if (projectName) {
    const project = await createProject({
      name: projectName,
      workspaceId: workspace.id,
    });
    projectId = project.id;

    if (isFirstProject && projectId) {
      const [signal] = await db
        .insert(signals)
        .values({
          projectId,
          ...DEFAULT_SIGNAL,
        })
        .returning({ id: signals.id });

      if (signal) {
        await db.insert(signalTriggers).values({
          projectId,
          signalId: signal.id,
          value: DEFAULT_SIGNAL_TRIGGER_VALUE,
        });
      }

      if (userEmail && insertedReports.length > 0) {
        await db.insert(reportTargets).values(
          insertedReports.map((r) => ({
            workspaceId: workspace.id,
            reportId: r.id,
            type: REPORT_TARGET_TYPE.EMAIL,
            email: userEmail,
          }))
        );
      }
    }
  }

  return {
    id: workspace.id,
    name: workspace.name,
    tierName: WorkspaceTier.FREE,
    projectId,
  };
};

export const getWorkspaces = async (): Promise<Workspace[]> => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const results = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      tierName: subscriptionTiers.name,
    })
    .from(workspaces)
    .innerJoin(membersOfWorkspaces, eq(workspaces.id, membersOfWorkspaces.workspaceId))
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(membersOfWorkspaces.userId, session?.user?.id))
    .orderBy(desc(workspaces.createdAt));

  if (results.length === 0) {
    return [];
  }

  let addons: { workspaceId: string; addonSlug: string }[] = [];

  if (isFeatureEnabled(Feature.SUBSCRIPTION)) {
    addons = await db
      .select({ workspaceId: workspaceAddons.workspaceId, addonSlug: workspaceAddons.addonSlug })
      .from(workspaceAddons)
      .where(
        inArray(
          workspaceAddons.workspaceId,
          results.map((r) => r.id)
        )
      );
  }

  const addonsByWorkspace = new Map<string, string[]>();
  for (const addon of addons) {
    const existing = addonsByWorkspace.get(addon.workspaceId) ?? [];
    existing.push(addon.addonSlug);
    addonsByWorkspace.set(addon.workspaceId, existing);
  }

  return results.map((r) => ({
    id: r.id,
    name: r.name,
    tierName: r.tierName as WorkspaceTier,
    addons: addonsByWorkspace.get(r.id) ?? [],
  }));
};
