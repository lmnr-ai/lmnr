import { authOptions } from '@/lib/auth';
import { Session, getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Header from '@/components/ui/header';
import Dashboard from '@/components/dashboard/dashboard';
import { fetcherJSON } from '@/lib/utils';
import { EventTemplate } from '@/lib/events/types';

export const metadata: Metadata = {
  title: 'Dashboard',
};

const getEventTemplates = async (session: Session, projectId: string): Promise<EventTemplate[]> => {
  const user = session.user;
  return await fetcherJSON(`/projects/${projectId}/event-templates`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.apiKey}`
    },
  });
};

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: { projectId: string },
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  return (
    <>
      <Dashboard />
    </>
  );
}
