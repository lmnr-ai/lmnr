import { type Metadata } from "next";

import EvalDatasetView from "@/components/eval-datasets/dataset";

export const metadata: Metadata = {
  title: "Eval dataset",
};

export default async function EvalDatasetPage(props: {
  params: Promise<{ projectId: string; org: string; name: string }>;
}) {
  const { projectId, org, name } = await props.params;
  return <EvalDatasetView projectId={projectId} datasetId={`${org}/${name}`} />;
}
