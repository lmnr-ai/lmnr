import { type Metadata } from "next";

import Evaluators from "@/components/evaluators/evaluators";
import Header from "@/components/ui/header";

export const metadata: Metadata = {
  title: "Evaluators",
};

export default async function EvaluatorsPage(props: { params: Promise<{ projectId: string }> }) {
  return (
    <div className="flex flex-col flex-1">
      <Header path="evaluators" />
      <Evaluators />
    </div>
  );
}
