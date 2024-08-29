import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Env from '@/components/env/env';

export const metadata: Metadata = {
  title: 'Env Variables',
}

export default async function EnvPage() {

  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/sign-in');
  }

  return (
    <Env />
  )
}
