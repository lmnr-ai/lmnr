import { Loader2 } from "lucide-react";
import { type PropsWithChildren, type ReactNode } from "react";

import { ChartType } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import EditorFooter from "@/components/dashboards/editor/editor-footer";
import EditorModeTabs from "@/components/dashboards/editor/editor-mode-tabs";
import ChartNameField from "@/components/dashboards/editor/fields/ChartNameField";
import ChartTypeField from "@/components/dashboards/editor/fields/ChartTypeField";
import DisplayValueField from "@/components/dashboards/editor/fields/DisplayValueField";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EditorSidebarProps {
  isLoading?: boolean;
  saveDisabled: boolean;
  /** The mode's own fields that depend on the chart type, shown after its query fields. */
  display?: ReactNode;
}

/**
 * Settings pane of the editor: fields shared by both modes; `children` are the mode's own query fields.
 * The chart type sits above everything that depends on it, so switching types never moves it.
 */
export default function EditorSidebar({
  isLoading,
  saveDisabled,
  display,
  children,
}: PropsWithChildren<EditorSidebarProps>) {
  const chartType = useDashboardEditorStoreContext((state) => state.chart.settings.config.type);
  const showDisplayValue = chartType !== ChartType.Table && chartType !== ChartType.Value;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 p-4 xl:p-6">
          <EditorModeTabs />
          <ChartNameField />
          <ChartTypeField />
          {children}
          {(display || showDisplayValue) && (
            <div className="flex flex-col gap-5 border-t pt-5">
              {display}
              {showDisplayValue && <DisplayValueField />}
            </div>
          )}
        </div>
      </ScrollArea>
      <EditorFooter saveDisabled={saveDisabled} />
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/40 backdrop-blur-xs">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
