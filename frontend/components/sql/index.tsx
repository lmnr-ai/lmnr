"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { SquareTerminal } from "lucide-react";
import { memo } from "react";

import { useSQLEditorContext } from "@/components/sql/context";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SQLEditorButton = ({ className }: { className?: string }) => {
  const { setOpen, open } = useSQLEditorContext();
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button onClick={() => setOpen((prev) => !prev)} variant="ghost" className={cn("p-1 h-fit", className)}>
            <SquareTerminal
              className={cn("w-5 h-5", {
                "text-primary": open,
              })}
            />
          </Button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>SQL Editor</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
};

export default memo(SQLEditorButton);
