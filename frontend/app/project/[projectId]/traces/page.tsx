import TracesDashboard from '@/components/traces/traces';
import { Metadata } from 'next';
import Header from '@/components/ui/header';
import { spans, traces } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import TracesPagePlaceholder from '@/components/traces/page-placeholder';

export const metadata: Metadata = {
  title: 'Traces'
};

export default async function TracesPage({
  params
}: {
  params: { projectId: string };
}) {
  const projectId = params.projectId;
  const anyInProject = await db.$count(
    spans,
    inArray(
      spans.traceId,
      db.select({ traceId: traces.id })
        .from(traces)
        .where(eq(traces.projectId, projectId))
    )) > 0;
  if (!anyInProject) {
    return <TracesPagePlaceholder />;
  }
  return (
    <>
      <Header path={'traces'} className="border-b-0" />
      <TracesDashboard />
    </>
  );
}
