import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { createProject } from "@/lib/actions/projects";
import { REPORT_TARGET_TYPE } from "@/lib/actions/reports/types";
import { createSignalTriggerOnAppServer } from "@/lib/actions/signal-triggers";
import { createSignalOnAppServer } from "@/lib/actions/signals";
import { getServerSession } from "@/lib/auth-session";
import { defaultReports } from "@/lib/db/default-charts.ts";
import { DEFAULT_SIGNAL, DEFAULT_SIGNAL_TRIGGER_VALUE } from "@/lib/db/default-signals.ts";
import { db } from "@/lib/db/drizzle";
import {
  membersOfWorkspaces,
  reports,
  reportTargets,
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
  const session = await getServerSession();

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
      // Seed the default Failure Detector signal + trigger via app-server — the
      // single owner of signal creation (same SIGNAL_EVENT alert + creator email
      // target + trigger as a UI/CLI-created signal). No shared DB transaction
      // here, so these are plain awaited HTTP calls like the rest of the flow.
      const signalRes = await createSignalOnAppServer(projectId, {
        name: DEFAULT_SIGNAL.name,
        prompt: DEFAULT_SIGNAL.prompt,
        structuredOutput: DEFAULT_SIGNAL.structuredOutputSchema,
        subscriberEmail: userEmail ?? undefined,
      });
      if (!signalRes.ok) {
        throw new Error(`Failed to seed default signal (HTTP ${signalRes.status})`);
      }
      const signal = (await signalRes.json()) as { id: string };

      const triggerRes = await createSignalTriggerOnAppServer(projectId, signal.id, {
        filters: DEFAULT_SIGNAL_TRIGGER_VALUE as Filter[],
      });
      if (!triggerRes.ok) {
        throw new Error(`Failed to seed default signal trigger (HTTP ${triggerRes.status})`);
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
  const session = await getServerSession();

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
