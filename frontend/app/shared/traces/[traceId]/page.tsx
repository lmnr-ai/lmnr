import { notFound } from "next/navigation";

import TraceView from "@/components/shared/traces/trace-view";
import { getSharedSpans } from "@/lib/actions/shared/spans";
import { getSharedTrace } from "@/lib/actions/shared/trace";

export default async function SharedTracePage(props: {
  params: Promise<{ traceId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { traceId } = await props.params;

  const trace = await getSharedTrace({ traceId });

  if (!trace || trace.visibility !== "public") {
    return notFound();
  }

  const spans = await getSharedSpans({ traceId });

  return <TraceView trace={trace} spans={spans} />;
}
