import { and, eq } from "drizzle-orm";
import { type Metadata } from "next";
import { notFound } from "next/navigation";

import Queue from "@/components/queue/queue";
import { db } from "@/lib/db/drizzle";
import { labelingQueues } from "@/lib/db/migrations/schema";

export const metadata: Metadata = {
  title: "Labeling Queue",
};

export default async function DatasetPage(props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const params = await props.params;

  const queue = await db.query.labelingQueues
    .findFirst({
      where: and(eq(labelingQueues.projectId, params.projectId), eq(labelingQueues.id, params.queueId)),
    })
    .catch((e) => {
      console.error("Failed to load labeling queue:", e);
      throw new Error("Failed to load labeling queue");
    });

  if (!queue) {
    return notFound();
  }

  return <Queue queue={queue} />;
}
