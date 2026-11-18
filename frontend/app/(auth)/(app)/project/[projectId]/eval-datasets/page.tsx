import { type Metadata } from "next";

import EvalDatasets from "@/components/eval-datasets/list";

export const metadata: Metadata = {
  title: "Eval datasets",
};

export default function EvalDatasetsPage() {
  return <EvalDatasets />;
}
