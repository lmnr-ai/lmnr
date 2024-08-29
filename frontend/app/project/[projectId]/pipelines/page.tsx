import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import Pipelines from '@/components/pipelines/pipelines';

import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pipelines',
}

// required to force reload on each pipeline page visit however apparently this is not working
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PipelinesPage() {

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }

  return (
    <Pipelines />
  )
}
