import { Operator, OperatorLabelMap } from "@/components/ui/datatable-filter/utils.ts";
import {
  buildSelectQuery,
  ColumnFilterConfig,
  createCustomFilter,
  createNumberFilter,
  QueryParams,
  QueryResult,
  SelectQueryOptions,
} from "@/lib/actions/common/query-builder";
import { FilterDef } from "@/lib/db/modifiers";
import {
  EvaluationResultWithScores,
  EvaluationScoreDistributionBucket,
  EvaluationScoreStatistics,
} from "@/lib/evaluation/types";

// Constants for distribution calculation
const DEFAULT_LOWER_BOUND = 0.0;
const DEFAULT_BUCKET_COUNT = 10;

const evaluationDatapointsColumnFilterConfig: ColumnFilterConfig = {
  processors: new Map([
    ["index", createNumberFilter("Int64")],
    [
      "metadata",
      createCustomFilter(
        (filter, paramKey) => {
          const [key, val] = filter.value.split("=", 2);
          if (key && val) {
            return `simpleJSONExtractRaw(metadata, {${paramKey}_key:String}) = {${paramKey}_val:String}`;
          }
          return "";
        },
        (filter, paramKey) => {
          const [key, val] = filter.value.split("=", 2);
          if (key && val) {
            return {
              [`${paramKey}_key`]: key,
              [`${paramKey}_val`]: `"${val}"`,
            };
          }
          return {};
        }
      ),
    ],
  ]),
};

// Evaluation datapoints view column mapping
const evaluationDatapointsSelectColumns = [
  "id",
  "evaluation_id as evaluationId",
  "data",
  "target",
  "metadata",
  "executor_output as executorOutput",
  "index",
  "trace_id as traceId",
  "group_id as groupId",
  "scores",
  "formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') as createdAt",
  "dataset_id as datasetId",
  "dataset_datapoint_id as datasetDatapointId",
  "formatDateTime(dataset_datapoint_created_at, '%Y-%m-%dT%H:%i:%S.%fZ') as datasetDatapointCreatedAt",
];

export interface BuildEvaluationDatapointsQueryOptions {
  projectId: string;
  evaluationId: string;
  traceIds: string[];
  filters: FilterDef[];
}

export interface BuildTracesForEvaluationQueryOptions {
  projectId: string;
  evaluationId: string;
  traceIds: string[];
  filters: FilterDef[];
}

export const buildEvaluationDatapointsQueryWithParams = (
  options: BuildEvaluationDatapointsQueryOptions
): QueryResult => {
  const { evaluationId, traceIds, filters } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: `evaluation_id = {evaluationId:UUID}`,
      params: { evaluationId },
    },
  ];

  if (traceIds.length > 0) {
    customConditions.push({
      condition: `trace_id IN ({traceIds:Array(UUID)})`,
      params: { traceIds },
    });
  }

  // Handle score filters separately
  const scoreFilters = filters.filter((f) => f.column.startsWith("score:"));
  const nonScoreFilters = filters.filter((f) => !f.column.startsWith("score:"));


  // Add score filter conditions
  scoreFilters.forEach((filter, index) => {
    const scoreName = filter.column.split(":")[1];
    const numValue = parseFloat(filter.value);

    if (scoreName && !isNaN(numValue)) {
      const opSymbol = OperatorLabelMap[filter.operator as Operator];
      const paramKey = `score_${scoreName}_${index}`;

      customConditions.push({
        condition: `JSONExtractFloat(scores, {${paramKey}_name:String}) ${opSymbol} {${paramKey}_value:Float64}`,
        params: {
          [`${paramKey}_name`]: scoreName,
          [`${paramKey}_value`]: numValue,
        },
      });
    }
  });

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: evaluationDatapointsSelectColumns,
      table: "evaluation_datapoints",
    },
    filters: nonScoreFilters,
    columnFilterConfig: evaluationDatapointsColumnFilterConfig,
    customConditions,
    orderBy: [
      {
        column: "index",
        direction: "ASC",
      },
      {
        column: "created_at",
        direction: "ASC",
      },
    ],
  };

  return buildSelectQuery(queryOptions);
};

// Helper function to calculate score statistics
export function calculateScoreStatistics(
  results: EvaluationResultWithScores[],
  scoreName: string
): EvaluationScoreStatistics {
  const scores = results
    .map((result) => {
      const scoresObj = result.scores as Record<string, number> | null;
      return scoresObj?.[scoreName];
    })
    .filter((score): score is number => typeof score === "number" && !isNaN(score));

  if (scores.length === 0) {
    return { averageValue: 0 };
  }

  const sum = scores.reduce((acc, score) => acc + score, 0);
  const averageValue = sum / scores.length;

  return { averageValue };
}

// Helper function to calculate score distribution
export function calculateScoreDistribution(
  results: EvaluationResultWithScores[],
  scoreName: string
): EvaluationScoreDistributionBucket[] {
  const scores = results
    .map((result) => {
      const scoresObj = result.scores as Record<string, number> | null;
      return scoresObj?.[scoreName];
    })
    .filter((score): score is number => typeof score === "number" && !isNaN(score));

  if (scores.length === 0) {
    // Return empty buckets
    return Array.from({ length: DEFAULT_BUCKET_COUNT }, (_, i) => ({
      lowerBound: (i * 1) / DEFAULT_BUCKET_COUNT,
      upperBound: ((i + 1) * 1) / DEFAULT_BUCKET_COUNT,
      heights: [0],
    }));
  }

  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  // Use default lower bound if min is higher
  const lowerBound = Math.min(minScore, DEFAULT_LOWER_BOUND);
  const upperBound = maxScore;

  // If all scores are the same, put everything in the last bucket
  if (lowerBound === upperBound) {
    const buckets: EvaluationScoreDistributionBucket[] = Array.from({ length: DEFAULT_BUCKET_COUNT }, (_, i) => ({
      lowerBound,
      upperBound,
      heights: [0],
    }));
    buckets[DEFAULT_BUCKET_COUNT - 1].heights = [scores.length];
    return buckets;
  }

  const stepSize = (upperBound - lowerBound) / DEFAULT_BUCKET_COUNT;
  const buckets: EvaluationScoreDistributionBucket[] = [];

  for (let i = 0; i < DEFAULT_BUCKET_COUNT; i++) {
    const bucketLowerBound = lowerBound + i * stepSize;
    const bucketUpperBound = i === DEFAULT_BUCKET_COUNT - 1 ? upperBound : lowerBound + (i + 1) * stepSize;

    const count = scores.filter((score) => {
      if (i === DEFAULT_BUCKET_COUNT - 1) {
        // Last bucket includes upper bound
        return score >= bucketLowerBound && score <= bucketUpperBound;
      } else {
        // Other buckets exclude upper bound
        return score >= bucketLowerBound && score < bucketUpperBound;
      }
    }).length;

    buckets.push({
      lowerBound: bucketLowerBound,
      upperBound: bucketUpperBound,
      heights: [count],
    });
  }

  return buckets;
}

// Helper to separate filters into trace and datapoint filters
export function separateFilters(filters: FilterDef[]): {
  traceFilters: FilterDef[];
  datapointFilters: FilterDef[];
} {
  const traceFilterColumns = new Set(["traceId", "startTime", "duration", "cost"]);

  const traceFilters = filters.filter((f) => traceFilterColumns.has(f.column));
  const datapointFilters = filters.filter((f) => !traceFilterColumns.has(f.column));

  return { traceFilters, datapointFilters };
}

// Build query to get trace IDs from traces table with filters
export const buildTracesForEvaluationQueryWithParams = (
  options: BuildTracesForEvaluationQueryOptions
): QueryResult => {
  const { evaluationId, traceIds, filters } = options;

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [];

  // Filter by evaluation trace IDs first
  if (traceIds.length > 0) {
    customConditions.push({
      condition: `id IN ({evaluationTraceIds:Array(UUID)})`,
      params: { evaluationTraceIds: traceIds },
    });
  } else {
    // If no trace IDs provided, we need to get them from evaluation_datapoints first
    customConditions.push({
      condition: `id IN (SELECT trace_id FROM evaluation_datapoints WHERE evaluation_id = {evaluationId:UUID})`,
      params: { evaluationId },
    });
  }

  // Define trace-specific column filters
  const tracesColumnFilterConfig: ColumnFilterConfig = {
    processors: new Map([
      [
        "startTime",
        createCustomFilter(
          (filter, paramKey) => {
            const opSymbol = OperatorLabelMap[filter.operator as Operator];
            return `start_time ${opSymbol} {${paramKey}:DateTime64}`;
          },
          (filter, paramKey) => ({ [paramKey]: filter.value.replace("Z", "") })
        ),
      ],
      [
        "duration",
        createCustomFilter(
          (filter, paramKey) => {
            const opSymbol = OperatorLabelMap[filter.operator as Operator];
            return `(end_time - start_time) ${opSymbol} {${paramKey}:Float64}`;
          },
          (filter, paramKey) => ({ [paramKey]: parseFloat(filter.value) })
        ),
      ],
      [
        "cost",
        createCustomFilter(
          (filter, paramKey) => {
            const opSymbol = OperatorLabelMap[filter.operator as Operator];
            return `(input_cost + output_cost) ${opSymbol} {${paramKey}:Float64}`;
          },
          (filter, paramKey) => ({ [paramKey]: parseFloat(filter.value) })
        ),
      ],
      [
        "traceId",
        createCustomFilter(
          (filter, paramKey) => `id = {${paramKey}:UUID}`,
          (filter, paramKey) => ({ [paramKey]: filter.value })
        ),
      ]
    ]),
  };

  const queryOptions: SelectQueryOptions = {
    select: {
      columns: ["id"],
      table: "traces",
    },
    filters,
    columnFilterConfig: tracesColumnFilterConfig,
    customConditions,
  };

  return buildSelectQuery(queryOptions);
};
