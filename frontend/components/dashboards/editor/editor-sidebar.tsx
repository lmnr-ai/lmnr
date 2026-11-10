import { Loader2 } from "lucide-react";
import { type PropsWithChildren, type ReactNode } from "react";

import { ChartType } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import EditorModeTabs from "@/components/dashboards/editor/editor-mode-tabs";
import ChartNameField from "@/components/dashboards/editor/fields/ChartNameField";
import ChartTypeField from "@/components/dashboards/editor/fields/ChartTypeField";
import DisplayValueField from "@/components/dashboards/editor/fields/DisplayValueField";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EditorSidebarProps {
  isLoading?: boolean;
  /** The mode's own fields that depend on the chart type, shown after its query fields. */
  display?: ReactNode;
}

/**
 * Left half of the editor: fields shared by both modes; `children` are the mode's own query fields.
 * The mode comes first because it decides how the query is written. The chart type is pinned below
 * the scrolling fields: which fields show depends on the type, so inline it would move on every switch.
 */
export default function EditorSidebar({ isLoading, display, children }: PropsWithChildren<EditorSidebarProps>) {
  const chartType = useDashboardEditorStoreContext((state) => state.chart.settings.config.type);
  const showDisplayValue = chartType !== ChartType.Table && chartType !== ChartType.Value;

  return (
    <div className="relative flex min-h-0 flex-col border-r bg-secondary">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          <EditorModeTabs />
          <ChartNameField />
          {children}
          {(display || showDisplayValue) && (
            <div className="flex flex-col gap-4 border-t pt-4">
              {display}
              {showDisplayValue && <DisplayValueField />}
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="border-t p-4">
        <ChartTypeField />
      </div>
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/40 backdrop-blur-xs">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
