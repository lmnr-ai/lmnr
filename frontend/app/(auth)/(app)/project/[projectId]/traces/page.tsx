import { eq } from "drizzle-orm";
import { type Metadata } from "next";

import PageViewTracker from "@/components/common/page-view-tracker";
import TracesPagePlaceholder from "@/components/traces/placeholder";
import TracesDashboard from "@/components/traces/traces";
import Header from "@/components/ui/header";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { projects } from "@/lib/db/migrations/schema";

export const metadata: Metadata = {
  title: "Traces",
};

export default async function TracesPage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  // variable named "cache" not after valkey cache, but
  // because we cache a potentially heavy clickhouse query's
  // result in DB
  const cacheHasTraces = await db.query.projects
    .findFirst({
      where: eq(projects.id, projectId),
    })
    .then((project) => project?.hasTraces)
    .catch((e) => {
      console.error(e);
      return null;
    });

  let hasTraces = cacheHasTraces === true;

  if (cacheHasTraces !== true) {
    let result: { exists: number } | undefined;
    let queryFailed = false;

    try {
      [result] = await executeQuery<{ exists: number }>({
        query: `
            SELECT 1 as exists
            FROM traces
            WHERE trace_type = {traceType:String}
            LIMIT 1
        `,
        parameters: {
          traceType: "DEFAULT",
        },
        projectId,
      });
    } catch (e) {
      console.error(e);
      queryFailed = true;
    }

    if (queryFailed) {
      // Fail-open for rendering this request only — do NOT cache, a transient
      // ClickHouse error must not permanently mark an empty project as having traces.
      hasTraces = true;
    } else if (result) {
      hasTraces = true;
      await db
        .update(projects)
        .set({ hasTraces: true })
        .where(eq(projects.id, projectId))
        .catch((e) => console.error(e));
    }
  }

  if (!hasTraces) {
    return <TracesPagePlaceholder />;
  }

  return (
    <>
      <PageViewTracker feature="traces" />
      <Header path="traces" className="border-b-0" />
      <TracesDashboard />
    </>
  );
}
