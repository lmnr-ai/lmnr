import { redirect } from 'next/navigation';

import { Metadata } from 'next';
import Queue from '@/components/queue/queue';
import { isCurrentUserMemberOfProject } from '@/lib/db/utils';

export const metadata: Metadata = {
  title: 'Labeling Queue'
};

export default async function DatasetPage({
  params
}: {
  params: { projectId: string; queueId: string };
}) {
  if (!(await isCurrentUserMemberOfProject(params.projectId))) {
    redirect('/404');
  }

  return <Queue queueId={params.queueId} />;
}
