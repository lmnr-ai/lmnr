import { Loader2 } from "lucide-react";
import { type PropsWithChildren } from "react";

import { ChartType } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import EditorModeTabs from "@/components/dashboards/editor/editor-mode-tabs";
import ChartNameField from "@/components/dashboards/editor/fields/ChartNameField";
import ChartTypeField from "@/components/dashboards/editor/fields/ChartTypeField";
import DisplayValueField from "@/components/dashboards/editor/fields/DisplayValueField";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Left half of the editor: fields shared by both modes; `children` are the mode's own query fields. */
export default function EditorSidebar({ isLoading, children }: PropsWithChildren<{ isLoading?: boolean }>) {
  const chartType = useDashboardEditorStoreContext((state) => state.chart.settings.config.type);

  return (
    <ScrollArea className="relative border-r bg-secondary">
      <div className="flex flex-col gap-4 p-4">
        <ChartNameField />
        <ChartTypeField />
        <EditorModeTabs />
        {children}
        {chartType !== ChartType.Table && chartType !== ChartType.Value && <DisplayValueField />}
      </div>
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/40 backdrop-blur-xs">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </ScrollArea>
  );
}
