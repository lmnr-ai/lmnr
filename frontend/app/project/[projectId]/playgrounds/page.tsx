import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import Events from '@/components/events/events';
import { fetcherJSON } from '@/lib/utils';
import { EventTemplate } from '@/lib/events/types';
import Playgrounds from '@/components/playgrounds/playgrounds';

export const metadata: Metadata = {
  title: 'Playgrounds'
};

export default async function PlaygroundsPage({
  params,
  searchParams
}: {
  params: { projectId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  return <Playgrounds />;
}
