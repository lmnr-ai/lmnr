import { type PropsWithChildren } from "react";

import { ChartType } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import EditorModeTabs from "@/components/dashboards/editor/editor-mode-tabs";
import ChartNameField from "@/components/dashboards/editor/fields/ChartNameField";
import ChartTypeField from "@/components/dashboards/editor/fields/ChartTypeField";
import DisplayValueField from "@/components/dashboards/editor/fields/DisplayValueField";
import SaveChartButton from "@/components/dashboards/editor/save-chart-button";

/** Fields shared by both editor modes; `children` are the mode's own query fields. */
export default function EditorSidebar({ saveDisabled, children }: PropsWithChildren<{ saveDisabled: boolean }>) {
  const chartType = useDashboardEditorStoreContext((state) => state.chart.settings.config.type);

  return (
    <div className="flex flex-col gap-4 p-3">
      <ChartNameField />
      <ChartTypeField />
      <EditorModeTabs />
      {children}
      {chartType !== ChartType.Table && <DisplayValueField />}
      <SaveChartButton disabled={saveDisabled} />
    </div>
  );
}
