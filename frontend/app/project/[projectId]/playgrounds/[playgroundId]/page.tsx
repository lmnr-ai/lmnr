import { authOptions } from '@/lib/auth';
import { fetcherJSON } from '@/lib/utils';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';

import { Metadata } from 'next';
import Playground from '@/components/playground/playground';
import { eq } from 'drizzle-orm';
import { playgrounds } from '@/lib/db/migrations/schema';
import { db } from '@/lib/db/drizzle';
import { Playground as PlaygroundType } from '@/lib/playground/types';

export const metadata: Metadata = {
  title: 'Playground'
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;


export default async function PlaygroundPage({
  params
}: {
  params: { projectId: string; playgroundId: string };
}) {

  try {
    const playground = await db.query.playgrounds.findFirst({
      where: eq(playgrounds.id, params.playgroundId)
    });

    if (!playground) {
      return notFound();
    }

    return <Playground playground={playground as PlaygroundType} />;

  } catch (error) {
    return notFound();
  }
}
