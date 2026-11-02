import { and, eq, isNull, or } from "drizzle-orm";

import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { projects } from "@/lib/db/migrations/schema";
import { sendProjectHasTracesEvent } from "@/lib/emails/automations";

// `projects.has_traces` caches a potentially heavy ClickHouse lookup. It is only ever set to
// true, so once a project has traces we never query ClickHouse for it again.
// Returns null when the lookup failed, so each caller picks its own fallback.
export const projectHasTraces = async (projectId: string): Promise<boolean | null> => {
  const cached = await db.query.projects
    .findFirst({ where: eq(projects.id, projectId) })
    .then((project) => project?.hasTraces)
    .catch((e) => {
      console.error(e);
      return null;
    });
  if (cached === true) return true;

  let result: { exists: number } | undefined;
  try {
    [result] = await executeQuery<{ exists: number }>({
      query: `
          SELECT 1 as exists
          FROM traces
          WHERE trace_type = {traceType:String}
          LIMIT 1
      `,
      parameters: { traceType: "DEFAULT" },
      projectId,
    });
  } catch (e) {
    // Never cache a failure — a transient ClickHouse error must not permanently mark an
    // empty project as having traces.
    console.error(e);
    return null;
  }
  if (!result) return false;

  // The conditional update lets exactly one concurrent caller observe the flip.
  const flipped = await db
    .update(projects)
    .set({ hasTraces: true })
    .where(and(eq(projects.id, projectId), or(isNull(projects.hasTraces), eq(projects.hasTraces, false))))
    .returning({ id: projects.id })
    .catch((e) => {
      console.error(e);
      return [];
    });
  if (flipped.length > 0) await sendProjectHasTracesEvent(projectId);

  return true;
};
