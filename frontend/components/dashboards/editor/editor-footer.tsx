"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import SaveChartButton from "@/components/dashboards/editor/save-chart-button";
import { useWithTimeRange } from "@/components/dashboards/time-range";
import { Button } from "@/components/ui/button";

export default function EditorFooter({ saveDisabled }: { saveDisabled: boolean }) {
  const { projectId, dashboardId } = useParams<{ projectId: string; dashboardId: string }>();
  const withTimeRange = useWithTimeRange();

  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t bg-background px-4 py-3 xl:px-6">
      <Link href={withTimeRange(`/project/${projectId}/dashboards/${dashboardId}`)}>
        <Button variant="outline">Cancel</Button>
      </Link>
      <SaveChartButton disabled={saveDisabled} />
    </div>
  );
}
