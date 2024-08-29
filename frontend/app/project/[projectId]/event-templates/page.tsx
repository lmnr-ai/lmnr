import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import EventTemplates from '@/components/event-templates/event-templates';
import { fetcherJSON } from '@/lib/utils';
import { EventTemplate } from '@/lib/events/types';

export const metadata: Metadata = {
  title: 'Event Templates',
}

export default async function EventTemplatesPage({
  params,
  searchParams,
}: {
  params: { projectId: string },
  searchParams: { [key: string]: string | string[] | undefined },
}) {

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  const user = session.user;
  const pastHours = searchParams.pastHours ? Number(searchParams.pastHours) : 24;

  const events = await fetcherJSON(`/projects/${params.projectId}/event-templates?pastHours=${pastHours}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  }) as EventTemplate[];

  return (
    <EventTemplates events={events} />
  );
}