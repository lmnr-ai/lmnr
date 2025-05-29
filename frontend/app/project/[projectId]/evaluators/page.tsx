import { Plus } from "lucide-react";
import { Metadata } from "next";

import CreateEvaluatorDialog from "@/components/evaluators/create-evaluator-dialog";
import EvaluatorsTable from "@/components/evaluators/evaluators-table";
import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header";

export const metadata: Metadata = {
  title: "Evaluators",
};

export default async function EvaluatorsPage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;

  return (
    <div className="flex flex-col flex-1">
      <Header path="evaluators" />
      <div className="flex flex-col flex-1">
        <div className="flex justify-between items-center p-4">
          <h1 className="text-2xl font-semibold">Evaluators</h1>
          <CreateEvaluatorDialog>
            <Button variant="outline">
              <Plus size={16} className="mr-2" />
              New evaluator
            </Button>
          </CreateEvaluatorDialog>
        </div>
        <EvaluatorsTable projectId={projectId} />
      </div>
    </div>
  );
}
