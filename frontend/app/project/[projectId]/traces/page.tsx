import { and, eq } from 'drizzle-orm';
import { Metadata } from 'next';

import TracesPagePlaceholder from '@/components/traces/page-placeholder';
import TracesDashboard from '@/components/traces/traces';
import Header from '@/components/ui/header';
import { db } from '@/lib/db/drizzle';
import { traces } from '@/lib/db/migrations/schema';

export const metadata: Metadata = {
  title: 'Traces'
};

export default async function TracesPage(
  props: {
    params: Promise<{ projectId: string }>;
  }
) {
  const params = await props.params;
  const projectId = params.projectId;
  const anyInProject = await db.query.traces.findFirst({
    where: and(
      eq(traces.projectId, projectId),
      eq(traces.traceType, "DEFAULT")
    )
  });
  if (anyInProject === undefined) {
    return <TracesPagePlaceholder />;
  }
  return (
    <>
      <Header path={'traces'} className="border-b-0" />
      <TracesDashboard />
    </>
  );
}
