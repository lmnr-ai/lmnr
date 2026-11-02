import { injectIdMetrics } from "@/components/dashboards/editor/utils";
import { type DashboardChart } from "@/components/dashboards/types";
import { type QueryStructure } from "@/lib/actions/sql/types";

export type SaveChartPayload = {
  name: string;
  query: string;
  config: DashboardChart["settings"]["config"];
  queryStructure: QueryStructure | null;
};

export const chartSavePayload = (
  chart: Pick<DashboardChart, "name" | "query" | "settings">,
  formValues: QueryStructure | null
): SaveChartPayload => ({
  name: chart.name,
  query: chart.query,
  config: chart.settings.config,
  // A freeform query has no visual structure. Never persist the form's default values in its place.
  queryStructure: formValues
    ? {
        ...formValues,
        metrics: injectIdMetrics(
          formValues.metrics,
          formValues.dimensions,
          formValues.table,
          chart.settings.config.type
        ),
      }
    : null,
});
