import { and, eq } from 'drizzle-orm';
import { z } from 'zod/v4';

import { cache, PROJECT_CACHE_KEY } from '@/lib/cache';
import { db } from '@/lib/db/drizzle';
import { projects, projectSettings } from '@/lib/db/migrations/schema';

const CheckTraceEligibilitySchema = z.object({
  projectId: z.uuid(),
});

export interface TraceEligibilityResult {
  isEligible: boolean;
  reason?: string;
  tierName?: string;
  hasTraceAnalysis?: boolean;
}

/**
 * Check if a project is eligible for trace summary generation.
 * Checks both workspace tier (must not be "free") and project settings (enable_trace_analysis).
 */
export async function checkTraceEligibility(
  input: z.infer<typeof CheckTraceEligibilitySchema>
): Promise<TraceEligibilityResult> {
  const { projectId } = CheckTraceEligibilitySchema.parse(input);

  // Check workspace tier using cache (like in app-server)
  const cacheKey = `${PROJECT_CACHE_KEY}:${projectId}`;
  let projectInfo = await cache.get<any>(cacheKey);

  if (!projectInfo) {
    // Fallback: query database if not in cache
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      with: {
        workspace: {
          with: {
            subscriptionTier: true
          }
        }
      }
    });

    if (!project) {
      return {
        isEligible: false,
        reason: "project not found"
      };
    }

    projectInfo = {
      tier_name: project.workspace.subscriptionTier.name,
      tierId: project.workspace.tierId
    };
  }

  // Check if workspace is on paid tier (similar to app-server logic)
  const isPaidTier = projectInfo.tier_name?.trim().toLowerCase() !== "free";

  if (!isPaidTier) {
    return {
      isEligible: false,
      reason: "workspace is on free tier",
      tierName: projectInfo.tier_name,
      hasTraceAnalysis: false
    };
  }

  // Check project settings for trace analysis enablement
  const traceAnalysisSetting = await db.query.projectSettings.findFirst({
    where: and(
      eq(projectSettings.projectId, projectId),
      eq(projectSettings.name, 'enable_trace_analysis')
    )
  });

  const isTraceAnalysisEnabled = traceAnalysisSetting?.value === 'true';

  if (!isTraceAnalysisEnabled) {
    return {
      isEligible: false,
      reason: "trace analysis not enabled in project settings",
      tierName: projectInfo.tier_name,
      hasTraceAnalysis: false
    };
  }

  return {
    isEligible: true,
    tierName: projectInfo.tier_name,
    hasTraceAnalysis: true
  };
}

/**
 * Get workspace tier information for a project using cache.
 * Similar to the app-server implementation.
 */
export async function getProjectWorkspaceTier(projectId: string): Promise<{
  tierName: string;
  tierId: number;
  isPaidTier: boolean;
} | null> {
  const cacheKey = `${PROJECT_CACHE_KEY}:${projectId}`;
  let projectInfo = await cache.get<any>(cacheKey);

  if (!projectInfo) {
    // Fallback: query database if not in cache
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      with: {
        workspace: {
          with: {
            subscriptionTier: true
          }
        }
      }
    });

    if (!project) {
      return null;
    }

    projectInfo = {
      tier_name: project.workspace.subscriptionTier.name,
      tierId: project.workspace.tierId
    };
  }

  return {
    tierName: projectInfo.tier_name,
    tierId: projectInfo.tierId,
    isPaidTier: projectInfo.tier_name?.trim().toLowerCase() !== "free"
  };
}

/**
 * Check if trace analysis is enabled for a project.
 */
export async function isTraceAnalysisEnabled(projectId: string): Promise<boolean> {
  const traceAnalysisSetting = await db.query.projectSettings.findFirst({
    where: and(
      eq(projectSettings.projectId, projectId),
      eq(projectSettings.name, 'enable_trace_analysis')
    )
  });

  return traceAnalysisSetting?.value === 'true';
}
