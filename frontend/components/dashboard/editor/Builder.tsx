"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { useDashboardEditorStoreContext } from "@/components/dashboard/editor/dashboard-editor-store";
import { Form } from "@/components/dashboard/editor/Form.tsx";
import { getDefaultFormValues } from "@/components/dashboard/editor/types";
import { QueryStructure, QueryStructureSchema } from "@/lib/actions/sql/types";

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

  const methods = useForm<QueryStructure>({
    resolver: zodResolver(QueryStructureSchema),
    defaultValues: getDefaultFormValues(),
    mode: "onChange",
    reValidateMode: "onChange",
  });

  const { reset } = methods;

  // Load existing chart into form ONCE
  useEffect(() => {
    if (!chart.id || !chart.query || !projectId) {
      return;
    }

    const loadChart = async () => {
      try {
        setIsLoadingForm(true);
        const queryStructure = await convertSqlToJson(projectId as string, chart.query);
        const filteredFilters = (queryStructure.filters || []).filter(
          (filter) => filter.field !== "start_time" && filter.field !== "end_time"
        );

        reset({
          table: queryStructure.table,
          metrics: queryStructure.metrics,
          dimensions: queryStructure.dimensions,
          filters: filteredFilters,
          timeRange: queryStructure.timeRange,
          orderBy: queryStructure.orderBy,
          limit: queryStructure.limit,
        });

        // Execute the existing query to show data
        await executeQuery(projectId as string);

        // Small delay to ensure form has settled before we start reacting to changes
      } catch (error) {
        console.error("Failed to load chart:", error);
        reset(getDefaultFormValues());
      } finally {
        setIsLoadingForm(false);
      }
    };

    loadChart();
  }, [chart.id, chart.query, projectId, reset, executeQuery]);

  return (
    <FormProvider {...methods}>
      <Form isLoadingChart={isLoadingForm} />
    </FormProvider>
  );
};

export default ChartBuilder;
