import { eq } from 'drizzle-orm';
import { Metadata } from 'next';

import TracesPagePlaceholder from '@/components/traces/page-placeholder';
import TracesDashboard from '@/components/traces/traces';
import Header from '@/components/ui/header';
import { db } from '@/lib/db/drizzle';
import { spans } from '@/lib/db/migrations/schema';
import { Feature, isFeatureEnabled } from '@/lib/features/features';

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
  const isSupabaseEnabled = isFeatureEnabled(Feature.SUPABASE);
  const anyInProject = await db.query.spans.findFirst({
    where: eq(spans.projectId, projectId)
  });
  if (anyInProject === undefined) {
    return <TracesPagePlaceholder />;
  }
  return (
    <>
      <Header path={'traces'} className="border-b-0" />
      <TracesDashboard isSupabaseEnabled={isSupabaseEnabled} />
    </>
  );
}
