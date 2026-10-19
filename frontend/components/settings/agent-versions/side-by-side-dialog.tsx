"use client";

import { Maximize, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import SplitDiffView from "@/components/ui/diff/split-diff-view";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SideBySideDialogProps {
  title: string;
  oldLabel: string;
  newLabel: string;
  oldText: string;
  newText: string;
}

export default function SideBySideDialog({ title, oldLabel, newLabel, oldText, newText }: SideBySideDialogProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Dialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Side by side diff">
                <Maximize className="size-3.5" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>Side by side diff</TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="flex h-[90vh] w-[96vw] max-w-[96vw] flex-col gap-3 p-4">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription className="text-xs">
              {oldLabel} → {newLabel}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={expanded} onCheckedChange={setExpanded} />
              Show unchanged lines
            </label>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30">
          <SplitDiffView
            oldText={oldText}
            newText={newText}
            oldLabel={oldLabel}
            newLabel={newLabel}
            expanded={expanded}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
