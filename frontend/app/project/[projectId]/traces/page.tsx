import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import TracesDashboard from '@/components/traces/traces';
import { Metadata } from 'next';
import Header from '@/components/ui/header';

export const metadata: Metadata = {
  title: 'Traces',
}


export default async function TracesPage() {

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  return (
    <>
      <Header path={"traces"} className="border-b-0" />
      <TracesDashboard />
    </>
  );
}


