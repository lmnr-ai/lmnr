import { type Metadata } from "next";

import PageViewTracker from "@/components/common/page-view-tracker";
import TracesPagePlaceholder from "@/components/traces/placeholder";
import TracesDashboard from "@/components/traces/traces";
import Header from "@/components/ui/header";
import { projectHasTraces } from "@/lib/actions/project/has-traces";

export const metadata: Metadata = {
  title: "Traces",
};

export default async function TracesPage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  if (!(await projectHasTraces(projectId))) {
    return <TracesPagePlaceholder />;
  }

  return (
    <>
      <PageViewTracker feature="traces" />
      <Header path="traces" className="border-b-0" />
      <TracesDashboard />
    </>
  );
}
