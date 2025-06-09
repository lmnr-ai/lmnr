import { TooltipPortal } from "@radix-ui/react-tooltip";
import React, { memo } from "react";

import { Button } from "@/components/ui/button";
import { IconLangGraph } from "@/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const LangGraphViewTrigger = ({ open, setOpen }: { open: boolean; setOpen: (b: boolean) => void }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        className="hover:bg-secondary px-1.5"
        variant="ghost"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <IconLangGraph className={cn("w-5 h-5 fill-white", { "fill-primary": open })} />
      </Button>
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent>{open ? "Hide LangGraph" : "Show LangGraph"}</TooltipContent>
    </TooltipPortal>
  </Tooltip>
);

export default memo(LangGraphViewTrigger);
