import { and, eq } from "drizzle-orm";
import { Metadata } from "next";
import { notFound } from "next/navigation";

import Playground from "@/components/playground/playground";
import { db } from "@/lib/db/drizzle";
import { playgrounds, spans } from "@/lib/db/migrations/schema";
import { Playground as PlaygroundType } from "@/lib/playground/types";

export const metadata: Metadata = {
  title: "Playground",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PlaygroundPage(props: {
  searchParams: Promise<{ spanId?: string }>;
  params: Promise<{ projectId: string; playgroundId: string }>;
}) {
  const params = await props.params;

  if (params.playgroundId === "create") {
    const searchParams = await props.searchParams;
    const spanId = searchParams?.spanId;
    try {
      if (spanId) {
        const span = await db.query.spans.findFirst({
          where: and(eq(spans.spanId, spanId), eq(spans.projectId, params.projectId)),
        });

        if (span) {
          const parsedSpanId = span.spanId.replace(/[0-]+/g, "");

          const result = await db
            .insert(playgrounds)
            .values({
              projectId: params.projectId,
              name: `${span.name} - ${parsedSpanId}`,
              promptMessages: span.input,
            })
            .returning();

          const playground = result?.[0];

          if (playground) {
            return <Playground playground={playground as PlaygroundType} />;
          }
        }
      }
      return notFound();
    } catch (e) {
      return notFound();
    }
  }

  try {
    // db.query.playgrounds
    const playground = await db.query.playgrounds.findFirst({
      where: eq(playgrounds.id, params.playgroundId),
    });

    if (!playground) {
      return notFound();
    }

    return <Playground playground={playground as PlaygroundType} />;
  } catch (error) {
    return notFound();
  }
}
