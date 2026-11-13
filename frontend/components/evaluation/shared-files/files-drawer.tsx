"use client";

import { FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import SharedFiles from "./index";

interface FilesDrawerProps {
  projectId: string;
  evaluationId: string;
}

/** Header button opening the run's shared files in a wide drawer over the table. */
export default function FilesDrawer({ projectId, evaluationId }: FilesDrawerProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" className="h-7 gap-1.5 px-2 text-xs">
          <FolderOpen className="size-3.5" />
          Files
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-[min(1100px,90vw)] flex-col gap-0 p-0 sm:max-w-none">
        <div className="flex-none border-b px-4 py-3">
          <SheetTitle className="text-base">Shared files</SheetTitle>
          <p className="text-xs text-muted-foreground">What every trial of this evaluation runs with</p>
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <SharedFiles projectId={projectId} evaluationId={evaluationId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
