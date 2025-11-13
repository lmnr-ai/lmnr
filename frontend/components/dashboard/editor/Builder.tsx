"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { useDashboardEditorStoreContext } from "@/components/dashboard/editor/dashboard-editor-store";
import { Form } from "@/components/dashboard/editor/Form.tsx";
import {
  getDefaultFormValues,
  VisualQueryBuilderForm,
  VisualQueryBuilderFormSchema,
} from "@/components/dashboard/editor/types";
import { QueryStructure } from "@/lib/actions/sql";

const convertSqlToJson = async (projectId: string, sql: string): Promise<QueryStructure> => {
  const response = await fetch(`/api/projects/${projectId}/sql/to-json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Failed to convert SQL to JSON");
  }

  return JSON.parse(data.jsonStructure);
};

const ChartBuilder = () => {
  const { projectId } = useParams();
  const { chart, executeQuery } = useDashboardEditorStoreContext((state) => ({
    chart: state.chart,
    executeQuery: state.executeQuery,
  }));
  const [isLoadingForm, setIsLoadingForm] = useState(false);

  const methods = useForm<VisualQueryBuilderForm>({
    resolver: zodResolver(VisualQueryBuilderFormSchema),
    defaultValues: getDefaultFormValues(),
    mode: "onChange",
    reValidateMode: "onChange",
  });

  useEffect(() => {
    if (chart.id && chart.query && projectId) {
      executeQuery(projectId as string);
    }
  }, [chart.id, projectId]);

  useEffect(() => {
    const loadChartIntoForm = async () => {
      if (chart.query && chart.id && projectId) {
        setIsLoadingForm(true);
        try {
          const queryStructure = await convertSqlToJson(projectId as string, chart.query);

          const filteredFilters = (queryStructure.filters || []).filter(
            (filter) => filter.field !== "start_time" && filter.field !== "end_time"
          );

          methods.reset({
            chartType: chart.settings.config.type || getDefaultFormValues().chartType,
            table: queryStructure.table,
            metrics: queryStructure.metrics,
            dimensions: queryStructure.dimensions || [],
            filters: filteredFilters,
            orderBy: queryStructure.orderBy || [],
            limit: queryStructure.limit,
          });
        } catch (error) {
          console.error("Failed to load chart into form:", error);
          methods.reset(getDefaultFormValues());
        } finally {
          setIsLoadingForm(false);
        }
      }
    };

    loadChartIntoForm();
  }, [chart.id, chart.query, projectId, methods, chart.settings.config.type]);

  return (
    <FormProvider {...methods}>
      <Form isLoading={isLoadingForm} />
    </FormProvider>
  );
};

export default ChartBuilder;
