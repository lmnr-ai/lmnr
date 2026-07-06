"use client";

import { type ReactNode } from "react";

import MetricsChips from "@/components/evaluation/poc/metrics-chips";
import TraceView from "@/components/traces/trace-view";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { type EvaluationScoreStatistics } from "@/lib/evaluation/types";

interface BottomDockLayoutProps {
  scoreNames: string[];
  selectedScore?: string;
  onSelectScore: (name: string) => void;
  allStatistics?: Record<string, EvaluationScoreStatistics>;
  comparedAllStatistics?: Record<string, EvaluationScoreStatistics>;
  isComparison: boolean;
  traceId?: string;
  onCloseTrace: () => void;
  renderTable: () => ReactNode;
}

/**
 * Trace gets the top of the screen; the full datapoints table (every column,
 * no tiering) docks underneath, resizable. No trace open = full-height table.
 */
export default function BottomDockLayout(props: BottomDockLayoutProps) {
  const { traceId, onCloseTrace, renderTable } = props;

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden px-4 pb-4">
      <MetricsChips
        scoreNames={props.scoreNames}
        allStatistics={props.allStatistics}
        comparedAllStatistics={props.comparedAllStatistics}
        isComparison={props.isComparison}
        selectedScore={props.selectedScore}
        onSelectScore={props.onSelectScore}
        className="flex-none"
      />
      {traceId ? (
        <ResizablePanelGroup orientation="vertical" className="flex-1 overflow-hidden">
          <ResizablePanel id="dock-trace" minSize="40%" className="overflow-hidden">
            <div className="flex flex-col h-full overflow-hidden border rounded-md bg-background">
              <div className="flex-1 min-h-0 flex overflow-hidden">
                <TraceView key={traceId} traceId={traceId} onClose={onCloseTrace} />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="z-30 bg-transparent my-1.5" />
          <ResizablePanel id="dock-table" defaultSize="35%" minSize="20%" className="flex overflow-hidden">
            {renderTable()}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        renderTable()
      )}
    </div>
  );
}
