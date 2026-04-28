import { Check, Loader2, X } from "lucide-react";

import { type EvalRow } from "@/lib/evaluation/types";

export const StatusCell = ({ row }: { row: { original: EvalRow } }) => {
  const status = row.original["status"];

  if (status === "error") {
    return (
      <div className="flex h-full justify-center items-center w-10">
        <X className="self-center text-destructive" size={18} />
      </div>
    );
  }
  if (status === "success") {
    return (
      <div className="flex h-full justify-center items-center w-10">
        <Check className="text-success" size={18} />
      </div>
    );
  }
  return (
    <div className="flex h-full justify-center items-center w-10">
      <Loader2 className="text-muted-foreground animate-spin" size={18} />
    </div>
  );
};
