import { type Metadata } from "next";
import { notFound } from "next/navigation";

import EvalDatasetVersion from "@/components/eval-datasets/version";
import { getEvalDataset } from "@/lib/actions/eval-datasets";

export const metadata: Metadata = {
  title: "Eval dataset version",
};

export default async function EvalDatasetVersionPage(props: {
  params: Promise<{ projectId: string; datasetName: string; version: string }>;
}) {
  const { projectId, datasetName, version } = await props.params;
  const number = Number(version);
  if (!Number.isInteger(number) || number < 1) notFound();
  const dataset = await getEvalDataset({ projectId, datasetName });
  if (!dataset) notFound();
  return <EvalDatasetVersion dataset={dataset.name} version={number} />;
}
