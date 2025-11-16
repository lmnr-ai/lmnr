"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Row } from "@tanstack/react-table";
import { get } from "lodash";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

import EvaluatorsTable from "@/components/evaluators/evaluators-table";
import ManageEvaluatorSheet from "@/components/evaluators/manage-evaluator-sheet";
import { Button } from "@/components/ui/button";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store";
import { Evaluator } from "@/lib/evaluators/types";

import { defaultEvaluatorsColumnOrder } from "./lib/consts";

const manageEvaluatorSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  evaluatorType: z.string().min(1, "Evaluator type is required"),
  code: z.string().min(1, "Code is required"),
  testInput: z.string(),
});

export type ManageEvaluatorForm = z.infer<typeof manageEvaluatorSchema>;

export const defaultValues: ManageEvaluatorForm = {
  name: "",
  evaluatorType: "python",
  code: `def evaluate(input):
    if not input:
        return 0
    
    keywords = ["relevant", "accurate", "helpful"]
    score = sum(1 for keyword in keywords if keyword.lower() in str(input).lower())
    
    return min(score * 33, 100)`,
  testInput: "",
};

const Evaluators = () => {
  const { projectId } = useParams();
  const [open, setOpen] = useState(false);
  const methods = useForm<ManageEvaluatorForm>({
    resolver: zodResolver(manageEvaluatorSchema),
    defaultValues,
  });

  const { reset } = methods;
  const handleRowClick = useCallback(
    (row: Row<Evaluator>) => {
      reset({
        id: row.original.id,
        name: row.original.name,
        evaluatorType: row.original.evaluatorType,
        code: get(row.original.definition, "function_code", defaultValues.code) as string,
        testInput: "",
      });
      setOpen(true);
    },
    [reset]
  );

  return (
    <FormProvider {...methods}>
      <div className="flex flex-col gap-4 px-4 pb-4">
        <ManageEvaluatorSheet open={open} setOpen={setOpen}>
          <Button className="w-fit" icon="plus">
            Evaluator
          </Button>
        </ManageEvaluatorSheet>
        <DataTableStateProvider storageKey="evaluators-table" defaultColumnOrder={defaultEvaluatorsColumnOrder}>
          <EvaluatorsTable onRowClick={handleRowClick} projectId={projectId as string} />
        </DataTableStateProvider>
      </div>
    </FormProvider>
  );
};

export default Evaluators;
