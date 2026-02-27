import { OperatorLabelMap } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { Operator } from "@/lib/actions/common/operators";
import { type Metric } from "@/lib/actions/sql/types";

export type MetricFunctionOption = {
  value: string;
  label: string;
  createMetric: (column: string) => Partial<Metric>;
};

export const METRIC_FUNCTION_OPTIONS: MetricFunctionOption[] = [
  {
    value: "count",
    label: "count",
    createMetric: () => ({ fn: "count", column: "*", alias: "count", args: [] }),
  },
  {
    value: "sum",
    label: "sum",
    createMetric: (column) => ({ fn: "sum", column, args: [] }),
  },
  {
    value: "avg",
    label: "average",
    createMetric: (column) => ({ fn: "avg", column, args: [] }),
  },
  {
    value: "min",
    label: "min",
    createMetric: (column) => ({ fn: "min", column, args: [] }),
  },
  {
    value: "max",
    label: "max",
    createMetric: (column) => ({ fn: "max", column, args: [] }),
  },
  {
    value: "p90",
    label: "P90",
    createMetric: (column) => ({ fn: "quantile", column, args: [0.9], alias: `p90_${column}` }),
  },
  {
    value: "p95",
    label: "P95",
    createMetric: (column) => ({ fn: "quantile", column, args: [0.95], alias: `p95_${column}` }),
  },
  {
    value: "p99",
    label: "P99",
    createMetric: (column) => ({ fn: "quantile", column, args: [0.99], alias: `p99_${column}` }),
  },
  {
    value: "raw",
    label: "Custom SQL",
    createMetric: () => ({ fn: "raw", column: "", args: [], rawSql: "", alias: "" }),
  },
];

export const getMetricFunctionValue = (metric: Metric): string => {
  if (metric.fn === "quantile") {
    if (metric.args?.[0] === 0.9) return "p90";
    if (metric.args?.[0] === 0.95) return "p95";
    if (metric.args?.[0] === 0.99) return "p99";
    return "quantile"; // fallback for custom quantiles
  }
  if (metric.fn === "raw") return "raw";
  return metric.fn;
};

export const createMetricFromOption = (functionValue: string, column: string, alias?: string): Metric => {
  const option = METRIC_FUNCTION_OPTIONS.find((opt) => opt.value === functionValue);
  if (!option) {
    return { fn: "count", column: "*", alias: alias || "count", args: [] };
  }
  if (functionValue === "raw") {
    return { fn: "raw", column: "", args: [], rawSql: "", alias: alias || "" } as Metric;
  }
  return { ...option.createMetric(column), column, alias } as Metric;
};

export const FILTER_OPERATOR_OPTIONS = [
  { value: Operator.Eq, label: OperatorLabelMap[Operator.Eq] },
  { value: Operator.Ne, label: OperatorLabelMap[Operator.Ne] },
  { value: Operator.Gt, label: OperatorLabelMap[Operator.Gt] },
  { value: Operator.Gte, label: OperatorLabelMap[Operator.Gte] },
  { value: Operator.Lt, label: OperatorLabelMap[Operator.Lt] },
  { value: Operator.Lte, label: OperatorLabelMap[Operator.Lte] },
] as const;
