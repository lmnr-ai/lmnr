import { Metadata } from 'next';

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
