"use client";

import { ColumnsMenu } from "@/components/ui/columns-menu";
import ViewsToolbar from "@/components/ui/infinite-datatable/views/views-toolbar";

const RESOURCE = "debugger-sessions";

interface DebuggerSessionsChromeProps {
  projectId: string;
  columnLabels: { id: string; label: string }[];
}

export function DebuggerSessionsChrome({ projectId, columnLabels }: DebuggerSessionsChromeProps) {
  return (
    <div className="flex flex-1 w-full space-x-2 pt-1">
      <ColumnsMenu columnLabels={columnLabels} />
      <ViewsToolbar projectId={projectId} resource={RESOURCE} />
    </div>
  );
}
