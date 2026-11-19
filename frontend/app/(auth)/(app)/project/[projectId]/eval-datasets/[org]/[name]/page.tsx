import { type Metadata } from "next";
import { notFound } from "next/navigation";

import EvalDatasetView from "@/components/eval-datasets/dataset";
import { getEvalDataset } from "@/lib/actions/eval-datasets";

export const metadata: Metadata = {
  title: "Eval dataset",
};

export default async function EvalDatasetPage(props: {
  params: Promise<{ projectId: string; org: string; name: string }>;
}) {
  const { projectId, org, name } = await props.params;
  const dataset = await getEvalDataset(projectId, `${org}/${name}`);
  if (!dataset) {
    return notFound();
  }
  return <EvalDatasetView projectId={projectId} dataset={dataset} />;
}
