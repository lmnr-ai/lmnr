"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import ChartPreviewContent from "@/components/dashboards/editor/chart-preview-content";
import ChartPreviewPane from "@/components/dashboards/editor/chart-preview-pane";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import EditorSidebar from "@/components/dashboards/editor/editor-sidebar";
import FreeformFields from "@/components/dashboards/editor/freeform-fields";
import { toTimeParameters, useDashboardTimeRange } from "@/components/dashboards/time-range";
import { BUILT_IN_PARAMETERS, deriveParameters } from "@/components/sql/parameters";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function FreeformForm() {
  const { projectId } = useParams<{ projectId: string }>();
  const timeRange = useDashboardTimeRange();
  const { chart, executeQuery } = useDashboardEditorStoreContext((state) => ({
    chart: state.chart,
    executeQuery: state.executeQuery,
  }));
  const { parameters: queryParameters, conflicts } = useMemo(() => deriveParameters(chart.query, {}), [chart.query]);
  // A dashboard only binds its time range and interval, so any other parameter could never be filled.
  const unsupported = queryParameters.filter((p) => !Object.hasOwn(BUILT_IN_PARAMETERS, p.name));
  const hasConflicts = Object.keys(conflicts).length > 0;
  const issue = hasConflicts
    ? "Fix conflicting parameter types in SQL."
    : unsupported.length
      ? `Dashboards only bind start_time, end_time and interval_unit. Remove ${unsupported.map((p) => p.name).join(", ")}.`
      : null;
  const canRun = !!chart.query.trim() && !issue;

  const runQuery = useCallback(() => {
    if (canRun) void executeQuery(projectId, toTimeParameters(timeRange), false);
  }, [canRun, executeQuery, projectId, timeRange]);

  // Re-run on open and whenever the time range or interval changes. SQL edits run explicitly,
  // so typing cannot launch stale requests.
  useEffect(() => {
    if (canRun) void executeQuery(projectId, toTimeParameters(timeRange), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, executeQuery, projectId]);
  useHotkeys("meta+enter,ctrl+enter", runQuery, { enableOnFormTags: ["input"], enableOnContentEditable: true });

  return (
    <>
      <ScrollArea className="rounded border bg-secondary">
        <EditorSidebar saveDisabled={!chart.settings.config.type}>
          <FreeformFields onRun={runQuery} canRun={canRun} issue={issue} />
        </EditorSidebar>
      </ScrollArea>
      <ChartPreviewPane name={chart.name}>
        <ChartPreviewContent config={chart.settings.config} />
      </ChartPreviewPane>
    </>
  );
}
