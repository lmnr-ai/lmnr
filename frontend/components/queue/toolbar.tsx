"use client";

import { Database } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import NavigatorBar from "./navigator-bar";
import PushToDatasetDialog from "./push-to-dataset-dialog";
import { useQueueStore } from "./queue-store";

export default function Toolbar() {
  const total = useQueueStore((s) => s.idsList.length);

  const [pushOpen, setPushOpen] = useState(false);

  const triggerDisabled = total === 0;
  const triggerHint = triggerDisabled ? "Queue is empty" : undefined;

  return (
    <>
      <div className="flex items-center gap-3">
        <NavigatorBar />
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Span wrapper keeps the tooltip working when the button is disabled. */}
              <span className="inline-flex">
                <Button onClick={() => setPushOpen(true)} disabled={triggerDisabled}>
                  <Database className="size-3.5 mr-1" />
                  Push to dataset
                </Button>
              </span>
            </TooltipTrigger>
            {triggerHint && <TooltipContent>{triggerHint}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
      </div>

      <PushToDatasetDialog open={pushOpen} onOpenChange={setPushOpen} />
    </>
  );
}
