import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { fetcher } from '@/lib/utils';
import { redirect } from 'next/navigation';
import EventComponent from '@/components/event/event';
import { EventTemplate, Event } from '@/lib/events/types';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Event'
};

const getEventTemplate = async (
  userApiKey: string,
  projectId: string,
  templateId: string
) => {
  const response = await fetcher(
    `/projects/${projectId}/event-templates/${templateId}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userApiKey}`
      }
    }
  );
  return (await response.json()) as EventTemplate;
};

const getMetrics = async (
  userApiKey: string,
  projectId: string,
  templateId: string,
  pastHours: string,
  groupByInterval: string
) => {
  const response = await fetcher(
    `/projects/${projectId}/event-templates/${templateId}/metrics?pastHours=${pastHours}&groupByInterval=${groupByInterval}&aggregation=Total&metric=eventCount`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userApiKey}`
      }
    }
  );
  return (await response.json()) as any;
};

export default async function EventTemplatePage({
  params,
  searchParams
}: {
  params: { projectId: string; eventId: string };
  searchParams: { pastHours?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  const pastHours = searchParams.pastHours ?? '24';

  let groupByInterval = 'minute';
  if (pastHours === '1') {
    groupByInterval = 'minute';
  } else if (pastHours === '7') {
    groupByInterval = 'minute';
  } else if (pastHours === '24') {
    groupByInterval = 'hour';
  } else {
    groupByInterval = 'day';
  }

  const eventTemplate = await getEventTemplate(
    session.user.apiKey,
    params.projectId,
    params.eventId
  );
  const metrics = await getMetrics(
    session.user.apiKey,
    params.projectId,
    params.eventId,
    pastHours,
    groupByInterval
  );

  return <EventComponent eventTemplate={eventTemplate} metrics={metrics} />;
}
