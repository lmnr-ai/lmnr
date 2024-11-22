import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { labelingQueues } from '@/lib/db/migrations/schema';
import { Metadata } from 'next';
import Queue from '@/components/queue/queue';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Labeling Queue'
};

export default async function DatasetPage({
  params
}: {
  params: { projectId: string; queueId: string };
}) {

  const queue = await db.query.labelingQueues.findFirst({
    where: and(
      eq(labelingQueues.projectId, params.projectId),
      eq(labelingQueues.id, params.queueId)
    )
  });

  if (!queue) {
    redirect('/404');
  }

  return <Queue queue={queue} />;
}
