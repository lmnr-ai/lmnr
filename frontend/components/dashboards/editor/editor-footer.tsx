"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import SaveChartButton from "@/components/dashboards/editor/save-chart-button";
import TimeControls from "@/components/dashboards/editor/time-controls";
import { useWithTimeRange } from "@/components/dashboards/time-range";
import { Button } from "@/components/ui/button";

/** Spans both halves of the editor: the preview's time range on the left, leaving or saving on the right. */
export default function EditorFooter({ saveDisabled }: { saveDisabled: boolean }) {
  const { projectId, dashboardId } = useParams<{ projectId: string; dashboardId: string }>();
  const withTimeRange = useWithTimeRange();

  return (
    <div className="col-span-2 flex items-center justify-between gap-4 border-t bg-secondary px-4 py-2">
      <TimeControls />
      <div className="flex min-w-0 items-center gap-2">
        <Link href={withTimeRange(`/project/${projectId}/dashboards/${dashboardId}`)}>
          <Button variant="outline">Cancel</Button>
        </Link>
        <SaveChartButton disabled={saveDisabled} />
      </div>
    </div>
  );
}
