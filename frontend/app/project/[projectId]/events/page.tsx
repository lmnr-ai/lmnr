import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import Events from '@/components/events/events';
import { authOptions } from '@/lib/auth';
import { EventTemplate } from '@/lib/events/types';
import { fetcherJSON } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Events'
};

export default async function EventTemplatesPage({
  params,
  searchParams
}: {
  params: { projectId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  const user = session.user;
  const pastHours = searchParams.pastHours
    ? Number(searchParams.pastHours)
    : 24;

  const events = (await fetcherJSON(
    `/projects/${params.projectId}/event-templates?pastHours=${pastHours}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${user.apiKey}`
      }
    }
  )) as EventTemplate[];

  return <Events events={events} />;
}
