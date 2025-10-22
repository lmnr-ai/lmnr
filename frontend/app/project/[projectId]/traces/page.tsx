import { Metadata } from "next";
import { cookies } from "next/headers";

import TracesPagePlaceholder from "@/components/traces/page-placeholder";
import TracesDashboard from "@/components/traces/traces";
import Header from "@/components/ui/header";
import { executeQuery } from "@/lib/actions/sql";
import { TRACES_TRACE_VIEW_WIDTH } from "@/lib/actions/traces";

export const metadata: Metadata = {
  title: "Traces",
};

export default async function TracesPage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  const [result] = await executeQuery<{ exists: number }>({
    query: `
        SELECT 1 as exists
        FROM traces
        WHERE trace_type = {traceType:String}
        LIMIT 1
    `,
    parameters: {
      traceType: "DEFAULT",
    },
    projectId,
  }).catch((e) => {
    console.error(e);
    return [{ exists: 1 }];
  });

  const cookieStore = await cookies();
  const traceViewWidthCookie = cookieStore.get(TRACES_TRACE_VIEW_WIDTH);
  const initialTraceViewWidth = traceViewWidthCookie ? parseInt(traceViewWidthCookie.value, 10) : undefined;

  if (!result) {
    return <TracesPagePlaceholder />;
  }

  return (
    <>
      <Header path="traces" className="border-b-0" />
      <TracesDashboard initialTraceViewWidth={initialTraceViewWidth} />
    </>
  );
}
