import Dashboard from '@/components/dashboard/dashboard';
import { Metadata } from 'next';

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
