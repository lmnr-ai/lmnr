import { eq } from "drizzle-orm";
import { type Metadata } from "next";
import { notFound } from "next/navigation";

import Playground from "@/components/playground/playground";
import { getPlaygroundConfig } from "@/components/playground/utils";
import { getSpan } from "@/lib/actions/span";
import { db } from "@/lib/db/drizzle";
import { playgrounds } from "@/lib/db/migrations/schema";
import { type Playground as PlaygroundType } from "@/lib/playground/types";
import { convertSpanToPlayground } from "@/lib/spans/utils";
import { type Span } from "@/lib/traces/types";

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
        const span = (await getSpan({
          spanId,
          projectId: params.projectId,
        })) as unknown as Span;

        if (span) {
          const parsedSpanId = spanId.replace(/[0-]+/g, "");

          const config = getPlaygroundConfig(span);
          const promptMessages = await convertSpanToPlayground(span.input);

          const result = await db
            .insert(playgrounds)
            .values({
              ...config,
              projectId: params.projectId,
              name: `${span.name} - ${parsedSpanId}`,
              promptMessages,
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
