import { ListRestart } from "lucide-react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import { useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function RefreshColumnsButton() {
  const store = useDataTableStore();
  const { resetColumns } = useStore(store, (state) => ({
    resetColumns: state.resetColumns,
  }));

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="p-1 text-xs text-secondary-foreground"
            onClick={resetColumns}
          >
            <ListRestart className="w-3.5 h-3.5 text-secondary-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reset columns</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
