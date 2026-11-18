import { type Metadata } from "next";
import { notFound } from "next/navigation";

import EvalDatasetVersions from "@/components/eval-datasets/versions";
import { getEvalDataset } from "@/lib/actions/eval-datasets";

export const metadata: Metadata = {
  title: "Eval dataset",
};

export default async function EvalDatasetPage(props: { params: Promise<{ projectId: string; datasetName: string }> }) {
  const { projectId, datasetName } = await props.params;
  const dataset = await getEvalDataset({ projectId, datasetName });
  if (!dataset) notFound();
  return <EvalDatasetVersions dataset={dataset.name} />;
}
