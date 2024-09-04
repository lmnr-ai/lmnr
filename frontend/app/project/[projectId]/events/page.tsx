import { authOptions } from '@/lib/auth';
import { Session, getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import EventsDashboard from '@/components/events/events';
import { Suspense } from 'react';
import { Metadata } from 'next';
import { fetcherJSON } from '@/lib/utils';
import Header from '@/components/ui/header';


export const metadata: Metadata = {
  title: 'Events',
}

const getEvents = async (
  session: Session,
  projectId: string,
  pageNumber: number,
  pageSize: number,
  filter: string | string[] | undefined,
  pastHours: number | null  // if null, show traces for all time
) => {
  const user = session.user;
  let url = `/projects/${projectId}/events?pageNumber=${pageNumber}&pageSize=${pageSize}`;
  if (pastHours !== null) {
    url += `&pastHours=${pastHours}`;
  }
  if (typeof filter === 'string') {
    url += `&filter=${encodeURI(filter)}`;
  } else if (Array.isArray(filter)) {
    const filters = encodeURI(`[${filter.toString()}]`)
    url += `&filter=${filters}`;
  }
  return await fetcherJSON(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${user.apiKey}`
    },
  })
}


export default async function EventsPage({
  params,
  searchParams,
}: {
  params: { projectId: string },
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const parseNumericSearchParam = (key: string, defaultValue: number): number => {
    const param = searchParams?.[key];
    if (Array.isArray(param)) {
      return defaultValue;
    }
    const parsed = param ? parseInt(param as string) : defaultValue;
    return isNaN(parsed) ? defaultValue : parsed;
  }

  // For some numeric params, they can be absent in the query and we want to parse them as null
  const parseNullableNumericSearchParam = (key: string): number | null => {
    const param = searchParams?.[key];
    if (Array.isArray(param)) {
      return null;
    }
    const parsed = param ? parseInt(param as string) : null;
    if (typeof parsed === 'number' && isNaN(parsed)) {
      return null;
    }
    return parsed;
  }

  const projectId = params.projectId;
  const pageNumber = parseNumericSearchParam('pageNumber', 0);
  const pageSize = parseNumericSearchParam('pageSize', 50);
  const filter = searchParams?.filter;
  const pastHours = parseNullableNumericSearchParam('pastHours');

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  const res = await getEvents(session, projectId, pageNumber, pageSize, filter, pastHours);

  const pageCount = res?.totalEntries ? Math.ceil(res?.totalEntries / pageSize) : 1;

  return (
    <>
      <Header path={"events"} />
      <Suspense>
        <EventsDashboard
          defaultEvents={res?.events ?? []}
          totalEventsCount={res?.totalEntries ?? 0}
          pageCount={pageCount}
          pageSize={pageSize}
          totalInProject={res?.totalInProject}
          pageNumber={Math.min(pageNumber, pageCount - 1)}
        />
      </Suspense>
    </>
  );
}
