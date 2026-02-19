import { Check, X } from "lucide-react";

import { type EvalRow } from "@/lib/evaluation/types";

export const StatusCell = ({ row }: { row: { original: EvalRow } }) => (
  <div className="flex h-full justify-center items-center w-10">
    {row.original["status"] === "error" ? (
      <X className="self-center text-destructive" size={18} />
    ) : (
      <Check className="text-success" size={18} />
    )}
  </div>
);
