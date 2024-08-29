import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { fetcher } from "@/lib/utils";
import { redirect } from 'next/navigation';
import EventTemplateComponent from '@/components/event-template/event-template';
import { EventTemplate, Event } from '@/lib/events/types';

const getEventTemplate = async (userApiKey: string, projectId: string, templateId: string) => {

  const response = await fetcher(`/projects/${projectId}/event-templates/${templateId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userApiKey}`
      },
    }
  );
  return await response.json() as EventTemplate;
}

const getEvents = async (userApiKey: string, projectId: string, templateId: string, pastHours: number) => {
  const response = await fetcher(`/projects/${projectId}/event-templates/${templateId}/events?pastHours=${pastHours}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userApiKey}`
      },
    }
  );
  return await response.json() as Event[];
}

const getMetrics = async (userApiKey: string, projectId: string, templateId: string, pastHours: number, groupByInterval: string) => {
  const response = await fetcher(`/projects/${projectId}/event-templates/${templateId}/metrics?pastHours=${pastHours}&groupByInterval=${groupByInterval}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userApiKey}`
      },
    }
  );
  return await response.json() as any;
}

export default async function EventTemplatePage({
  params,
  searchParams,
}: {
  params: { projectId: string; eventId: string };
  searchParams: { pastHours?: string };
}) {

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  const pastHours = searchParams.pastHours ? parseInt(searchParams.pastHours) : 24;

  let groupByInterval = "minute";
  if (pastHours === 1) {
    groupByInterval = "minute";
  } else if (pastHours === 7) {
    groupByInterval = "minute";
  } else if (pastHours === 24) {
    groupByInterval = "hour";
  } else {
    groupByInterval = "day";
  }

  const eventTemplate = await getEventTemplate(session.user.apiKey, params.projectId, params.eventId);
  const events = await getEvents(session.user.apiKey, params.projectId, params.eventId, pastHours);
  const metrics = await getMetrics(session.user.apiKey, params.projectId, params.eventId, pastHours, groupByInterval);

  return (
    <EventTemplateComponent eventTemplate={eventTemplate} events={events} metrics={metrics} />
  );
}