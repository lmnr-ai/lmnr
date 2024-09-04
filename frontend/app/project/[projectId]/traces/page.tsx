import { authOptions } from '@/lib/auth';
import { Session, getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import TracesDashboard from '@/components/traces/traces';
import { Suspense } from 'react';
import { Metadata } from 'next';
import { fetcherJSON } from '@/lib/utils';
import Header from '@/components/ui/header';


export const metadata: Metadata = {
  title: 'Traces',
}

const getTraces = async (
  session: Session,
  projectId: string,
  pageNumber: number,
  pageSize: number,
  filter: string | string[] | undefined,
  pastHours: string | null | undefined   // if null, show traces for all time
) => {
  const user = session.user;
  let url = `/projects/${projectId}/traces?pageNumber=${pageNumber}&pageSize=${pageSize}`;
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


export default async function TracesPage({
  params,
  searchParams,
}: {
  params: { projectId: string },
  searchParams: { [key: string]: string | string[] | undefined }
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

  let pastHours = searchParams?.pastHours as string;

  if (!pastHours) {

    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key !== 'pastHours') {
        sp.set(key, value as string);
      }
    }
    sp.set('pastHours', '24');
    redirect(`?${sp.toString()}`);
  }


  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  const res = await getTraces(session, projectId, pageNumber, pageSize, filter, pastHours);

  const pageCount = res?.totalEntries ? Math.ceil(res?.totalEntries / pageSize) : 1;

  return (
    <>
      <Header path={"traces"} />
      <Suspense>
        <TracesDashboard
          defaultTraces={res?.traces ?? []}
          totalTracesCount={res?.totalEntries ?? 0}
          pageCount={pageCount}
          pageSize={pageSize}
          totalInProject={res?.totalInProject}
          pastHours={pastHours?.toString() ?? "720"}
          pageNumber={Math.min(pageNumber, pageCount - 1)}
        />
      </Suspense>
    </>
  );
}
