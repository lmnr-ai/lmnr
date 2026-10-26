"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { ChartType } from "@/components/chart-builder/types";
import { type EditorMode, parseVisualStructure } from "@/components/dashboards/editor/chart-editor-mode";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { getDefaultFormValues, toFormValues, transformFormForChartType } from "@/components/dashboards/editor/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type QueryStructure } from "@/lib/actions/sql/types";

export default function EditorModeTabs() {
  const { projectId } = useParams<{ projectId: string }>();
  const { reset } = useFormContext<QueryStructure>();
  const { editorMode, setEditorMode, query, chartType, setQuery } = useDashboardEditorStoreContext((state) => ({
    editorMode: state.editorMode,
    setEditorMode: state.setEditorMode,
    query: state.chart.query,
    chartType: state.chart.settings.config.type,
    setQuery: state.setQuery,
  }));
  const [isParsing, setIsParsing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const startFresh = () => {
    reset(transformFormForChartType(getDefaultFormValues(), chartType ?? ChartType.LineChart, ChartType.LineChart));
    setQuery("");
    setEditorMode("visual");
  };

  const switchToStandard = async () => {
    if (!query.trim()) return startFresh();
    setIsParsing(true);
    const structure = await parseVisualStructure(query, projectId);
    setIsParsing(false);
    if (!structure) return setConfirmOpen(true);
    reset(toFormValues(structure, chartType));
    setEditorMode("visual");
  };

  // Standard → Advanced keeps the generated SQL, so it never loses anything.
  const handleChange = (value: string) => {
    if (value === editorMode || isParsing) return;
    if ((value as EditorMode) === "sql") setEditorMode("sql");
    else void switchToStandard();
  };

  return (
    <>
      <Tabs value={editorMode} onValueChange={handleChange}>
        <TabsList className="w-full h-8">
          <TabsTrigger value="visual" className="text-xs" disabled={isParsing}>
            Standard
          </TabsTrigger>
          <TabsTrigger value="sql" className="text-xs">
            Advanced
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Couldn't convert this SQL"
        description="The standard chart builder can't represent this query. Switching will clear your SQL. Continue?"
        confirmText="Proceed"
        onConfirm={startFresh}
      />
    </>
  );
}
