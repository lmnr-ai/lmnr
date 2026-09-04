import { type Metadata } from "next";
import { notFound } from "next/navigation";

import Playground from "@/components/playground/playground";
import { getPlaygroundConfig } from "@/components/playground/utils";
import { createPlayground, getPlayground } from "@/lib/actions/playgrounds";
import { getSpan } from "@/lib/actions/span";
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

          const playground = await createPlayground({
            ...config,
            projectId: params.projectId,
            name: `${span.name} - ${parsedSpanId}`,
            promptMessages,
          });

          return <Playground playground={playground as PlaygroundType} />;
        }
      }
      return notFound();
    } catch {
      return notFound();
    }
  }

  const playground = await getPlayground({
    playgroundId: params.playgroundId,
    projectId: params.projectId,
  });

  if (!playground) {
    return notFound();
  }

  return <Playground playground={playground as PlaygroundType} />;
}
