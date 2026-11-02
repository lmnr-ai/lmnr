"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { resolveChartEditorMode } from "@/components/dashboards/editor/chart-editor-mode";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { Form } from "@/components/dashboards/editor/Form";
import { getDefaultFormValues, toFormValues } from "@/components/dashboards/editor/utils";
import { type QueryStructure, QueryStructureSchema } from "@/lib/actions/sql/types";

const ChartBuilder = () => {
  const { projectId } = useParams();
  const { chart, setEditorMode } = useDashboardEditorStoreContext((state) => ({
    chart: state.chart,
    setEditorMode: state.setEditorMode,
  }));
  const [isLoadingForm, setIsLoadingForm] = useState(true);

  const methods = useForm<QueryStructure>({
    resolver: zodResolver(QueryStructureSchema),
    defaultValues: getDefaultFormValues(),
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const { reset } = methods;

  useEffect(() => {
    if (!chart.id || !chart.query || !projectId) {
      setIsLoadingForm(false);
      return;
    }

    const loadChart = async () => {
      const editor = await resolveChartEditorMode(chart, projectId as string);
      if (editor.mode === "visual") reset(toFormValues(editor.structure, chart.settings.config.type));
      else setEditorMode("sql");
      setIsLoadingForm(false);
    };

    loadChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FormProvider {...methods}>
      <Form isLoadingChart={isLoadingForm} />
    </FormProvider>
  );
};

export default ChartBuilder;
