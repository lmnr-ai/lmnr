import { authOptions } from '@/lib/auth';
import { Session, getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Header from '@/components/ui/header';
import Dashboard from '@/components/dashboard/dashboard';
import { fetcherJSON } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Dashboard',
}


export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: { projectId: string },
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }


  return (
    <>
      <Header path={"dashboard"} />
      <Dashboard />
    </>
  );
}
