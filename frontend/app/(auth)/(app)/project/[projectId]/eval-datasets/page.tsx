import { type Metadata } from "next";

import EvalDatasets from "@/components/eval-datasets";

export const metadata: Metadata = {
  title: "Datasets",
};

export default async function EvalDatasetsPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  return <EvalDatasets projectId={projectId} />;
}
