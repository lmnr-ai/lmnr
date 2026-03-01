import { type Metadata } from "next";

import TraceDiffView from "@/components/traces/trace-diff/trace-diff-view";

export const metadata: Metadata = {
  title: "Compare Traces",
};

export default async function TraceDiffPage(props: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ left?: string; right?: string }>;
}) {
  const searchParams = await props.searchParams;

  const leftTraceId = searchParams.left;
  const rightTraceId = searchParams.right;

  if (!leftTraceId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Missing left trace ID. Use ?left=TRACE_ID to start a comparison.
      </div>
    );
  }

  return <TraceDiffView leftTraceId={leftTraceId} rightTraceId={rightTraceId} />;
}
