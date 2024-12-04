import { Metadata } from 'next';

import Dashboard from '@/components/dashboard/dashboard';

export const metadata: Metadata = {
  title: 'Dashboard'
};

export default async function DashboardPage({
  params,
  searchParams
}: {
  params: { projectId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {

  return (
    <>
      <Dashboard />
    </>
  );
}
