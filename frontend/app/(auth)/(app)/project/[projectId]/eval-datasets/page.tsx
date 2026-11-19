import { type Metadata } from "next";

import EvalDatasets from "@/components/eval-datasets";
import { getEvalDatasets } from "@/lib/actions/eval-datasets";

export const metadata: Metadata = {
  title: "Eval datasets",
};

export default async function EvalDatasetsPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  const datasets = await getEvalDatasets(projectId);
  return <EvalDatasets projectId={projectId} datasets={datasets} />;
}
