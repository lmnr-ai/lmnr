import { eq } from 'drizzle-orm';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Playground from '@/components/playground/playground';
import { db } from '@/lib/db/drizzle';
import { playgrounds } from '@/lib/db/migrations/schema';
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
