import { type Metadata } from "next";

import TracesPagePlaceholder from "@/components/traces/placeholder";
import TracesDashboard from "@/components/traces/traces";
import Header from "@/components/ui/header";
import { executeQuery } from "@/lib/actions/sql";

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

  if (!result) {
    return <TracesPagePlaceholder />;
  }

  return (
    <>
      <Header path="traces" className="border-b-0" />
      <TracesDashboard />
    </>
  );
}
