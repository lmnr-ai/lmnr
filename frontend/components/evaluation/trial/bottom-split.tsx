import { type ReactNode } from "react";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

interface BottomSplitProps {
  trace: ReactNode;
  /** Null hides the panel; the trace stays mounted either way. */
  panel: ReactNode | null;
}

/** The trace with the trial's Task / Logs panel resizable under it, like the trace view's Media panel. */
export default function BottomSplit({ trace, panel }: BottomSplitProps) {
  return (
    <ResizablePanelGroup id="evaluation-trial-split" orientation="vertical">
      <ResizablePanel id="evaluation-trial-split-trace" defaultSize={60} minSize={30} className="flex min-h-0">
        {trace}
      </ResizablePanel>
      {panel && (
        <>
          <ResizableHandle withHandle className="z-10 transition-colors hover:bg-blue-400" />
          <ResizablePanel id="evaluation-trial-split-panel" defaultSize={40} minSize={15} className="flex min-h-0">
            {panel}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
