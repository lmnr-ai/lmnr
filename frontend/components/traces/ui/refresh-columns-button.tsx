import { ListRestart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useColumnsStore } from "@/components/ui/infinite-datatable/model/columns-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function RefreshColumnsButton() {
  const { resetColumns } = useColumnsStore();

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
