"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { ChartType } from "@/components/chart-builder/types";
import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import { Form } from "@/components/dashboards/editor/Form";
import { getTimeColumn } from "@/components/dashboards/editor/table-schemas";
import { convertSqlToJson, getDefaultFormValues } from "@/components/dashboards/editor/utils";
import { type QueryStructure, QueryStructureSchema } from "@/lib/actions/sql/types";
import { useToast } from "@/lib/hooks/use-toast";

const ChartBuilder = () => {
  const { projectId } = useParams();
  const { chart, setLoadError } = useDashboardEditorStoreContext((state) => ({
    chart: state.chart,
    setLoadError: state.setLoadError,
  }));
  const { toast } = useToast();
  const [isLoadingForm, setIsLoadingForm] = useState(true); // Start as true!

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

    const applyQueryStructure = (queryStructure: QueryStructure) => {
      // Strip auto-added time-range filters. The editor re-appends them at
      // execute time for Table/HorizontalBar charts (see Form.tsx), so if they
      // were already in the stored queryStructure we'd end up with duplicates
      // every edit cycle. The new save path never writes these filters —
      // this strip is only load-bearing for legacy charts loaded via
      // convertSqlToJson, where the parsed SQL still carries them. Derive the
      // column from the table so signal_events ("timestamp") is handled too.
      const timeColumn = getTimeColumn(queryStructure.table);
      const filteredFilters = (queryStructure.filters || []).filter((filter) => filter.field !== timeColumn);
      // Table charts never carry a LIMIT — pagination is applied at fetch time
      // in the executor. A legacy chart's SQL might have a LIMIT though, so
      // normalize on load to keep the invariant consistent with transformFormForChartType.
      const isTable = chart.settings.config.type === ChartType.Table;
      reset({
        table: queryStructure.table,
        metrics: queryStructure.metrics,
        dimensions: queryStructure.dimensions,
        filters: filteredFilters,
        timeRange: queryStructure.timeRange,
        orderBy: queryStructure.orderBy,
        limit: isTable ? undefined : queryStructure.limit,
      });
    };

    const loadChart = async () => {
      // Prefer the persisted queryStructure on the chart's settings. Falls back
      // to reverse-parsing the SQL for legacy charts saved before queryStructure
      // was persisted.
      //
      // NOTE: The convertSqlToJson fallback below can be removed once a one-off
      // data migration backfills queryStructure for every existing dashboard_charts
      // row. Until then it's the only way to open legacy charts in the editor.
      if (chart.settings.queryStructure) {
        applyQueryStructure(chart.settings.queryStructure);
        setIsLoadingForm(false);
        return;
      }

      try {
        const queryStructure = await convertSqlToJson(projectId as string, chart.query);
        applyQueryStructure(queryStructure);
      } catch (error) {
        // Saved SQL failed to round-trip through /sql/to-json. Don't silently
        // overwrite the user's form with defaults — that would let them Save
        // and clobber the real query in the DB. Surface the error and block
        // save via the store's loadError flag.
        //
        // loadError is distinct from the store's `error` field on purpose:
        // `error` is for query-execution failures (reset every execute cycle),
        // while `loadError` means "this chart fundamentally can't be edited"
        // and persists until a fresh load succeeds. Different lifecycles,
        // different UI consequences — `loadError` disables Save.
        console.error("Failed to load chart:", error);
        const message = error instanceof Error ? error.message : "Failed to load chart";
        setLoadError(message);
        toast({
          variant: "destructive",
          title: "Couldn't load chart",
          description: "This chart's saved query couldn't be parsed. Saving is disabled to prevent overwriting it.",
        });
      } finally {
        setIsLoadingForm(false);
      }
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
