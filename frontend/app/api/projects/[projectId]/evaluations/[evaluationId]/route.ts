import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { groupBy } from "lodash";
import { NextRequest } from "next/server";

import { DatatableFilter } from "@/components/ui/datatable-filter/utils";
import { searchSpans } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { db } from "@/lib/db/drizzle";
import { evaluationResults, evaluations, evaluationScores, traces } from "@/lib/db/migrations/schema";
import {
  EvaluationResultWithScores,
  EvaluationScoreDistributionBucket,
  EvaluationScoreStatistics,
} from "@/lib/evaluation/types";

// Constants for distribution calculation
const DEFAULT_LOWER_BOUND = 0.0;
const DEFAULT_BUCKET_COUNT = 10;

// Helper function to calculate score statistics
function calculateScoreStatistics(results: EvaluationResultWithScores[], scoreName: string): EvaluationScoreStatistics {
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
function calculateScoreDistribution(
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

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluationId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const evaluationId = params.evaluationId;

  // Get search params (removed scoreName)
  const search = req.nextUrl.searchParams.get("search");

  // Get filters
  let urlParamFilters: DatatableFilter[] = [];
  try {
    urlParamFilters = req.nextUrl.searchParams.getAll("filter").map((f) => JSON.parse(f) as DatatableFilter);
  } catch (e) {
    console.error("Error parsing filters:", e);
    return Response.json({ error: "Error parsing filters" }, { status: 400 });
  }

  // First, get the evaluation to extract its creation time
  const evaluation = await db.query.evaluations.findFirst({
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });

  if (!evaluation) {
    return Response.json({ error: "Evaluation not found" }, { status: 404 });
  }

  // Build all where conditions
  const whereConditions = [eq(evaluationResults.evaluationId, evaluationId)];

  // Extract metadata filters
  const metadataFilters = urlParamFilters
    .filter((filter) => filter.column === "metadata" && filter.operator === "eq")
    .map((filter) => {
      const [key, value] = filter.value.split(/=(.*)/);
      return sql`${evaluationResults.metadata} @> ${JSON.stringify({ [key]: value })}`;
    });

  whereConditions.push(...metadataFilters);

  // span search
  let searchTraceIds: string[] = [];
  if (search && search.trim() !== "") {
    try {
      // Always search in both span input and output
      const spanSearchTypes = [SpanSearchType.Input, SpanSearchType.Output];

      // Calculate time range based on evaluation creation time
      const startTime = new Date(evaluation.createdAt);
      const endTime = new Date(evaluation.createdAt);
      endTime.setHours(endTime.getHours() + 24); // Add 24 hours

      // Search in spans with proper time range
      const result = await searchSpans({
        projectId,
        searchQuery: search,
        timeRange: {
          start: startTime,
          end: endTime,
        },
        searchType: spanSearchTypes,
      });

      searchTraceIds = Array.from(result.traceIds);

      whereConditions.push(inArray(evaluationResults.traceId, searchTraceIds));
    } catch (error) {
      console.error("Error searching spans:", error);
    }
  }

  // Duration expression (in seconds)
  const durationExpr = sql`EXTRACT(EPOCH FROM (${traces.endTime} - ${traces.startTime}))`;

  // Total cost expression
  const costExpr = sql`(COALESCE(${traces.inputCost}, 0) + COALESCE(${traces.outputCost}, 0))`;

  // Add filter conditions
  urlParamFilters
    .filter((filter) => filter.column !== "metadata") // Skip metadata filters as they're handled separately
    .forEach((filter) => {
      const column = filter.column;
      const value = filter.value;
      const operator = filter.operator;

      // Operator mapping for numeric comparisons
      const opMap: Record<string, string> = {
        gt: ">",
        gte: ">=",
        lt: "<",
        lte: "<=",
        eq: "=",
        ne: "!=",
      };

      // Handle different column types
      if (column === "index") {
        whereConditions.push(eq(evaluationResults.index, parseInt(value)));
      } else if (column === "traceId") {
        whereConditions.push(eq(evaluationResults.traceId, value));
      } else if (column === "duration") {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          const opSymbol = opMap[operator] || "=";
          whereConditions.push(sql`${durationExpr} ${sql.raw(opSymbol)} ${numValue}`);
        }
      } else if (column === "cost") {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          const opSymbol = opMap[operator] || "=";
          whereConditions.push(sql`${costExpr} ${sql.raw(opSymbol)} ${numValue}`);
        }
      } else if (column.startsWith("score:")) {
        const scoreName = column.split(":")[1];
        const numValue = parseFloat(value);

        if (scoreName && !isNaN(numValue)) {
          const opSymbol = opMap[operator] || "=";

          whereConditions.push(
            sql`${evaluationResults.id} IN (
                  SELECT ${evaluationScores.resultId}
                  FROM   ${evaluationScores}
                  WHERE  ${evaluationScores.name} = ${scoreName}
                  AND    ${evaluationScores.score} ${sql.raw(opSymbol)} ${numValue}
                )`
          );
        }
      } else {
        // Default text search for ID
        whereConditions.push(sql`${evaluationResults.id}::text ILIKE ${"%" + value + "%"}`);
      }
    });

  const resultIdsQuery = db
    .select({ id: evaluationResults.id })
    .from(evaluationResults)
    .where(and(...whereConditions));

  const dbResultsPromise = db
    .select({
      id: evaluationResults.id,
      createdAt: evaluationResults.createdAt,
      evaluationId: evaluationResults.evaluationId,
      data: evaluationResults.data,
      target: evaluationResults.target,
      executorOutput: evaluationResults.executorOutput,
      index: evaluationResults.index,
      traceId: evaluationResults.traceId,
      startTime: traces.startTime,
      endTime: traces.endTime,
      inputCost: traces.inputCost,
      status: traces.status,
      outputCost: traces.outputCost,
      metadata: evaluationResults.metadata,
    })
    .from(evaluationResults)
    .leftJoin(traces, eq(evaluationResults.traceId, traces.id))
    .where(and(...whereConditions))
    .orderBy(asc(evaluationResults.index), asc(evaluationResults.createdAt));

  const scoresPromise = db
    .select({
      resultId: evaluationScores.resultId,
      name: evaluationScores.name,
      score: evaluationScores.score,
    })
    .from(evaluationScores)
    .where(inArray(evaluationScores.resultId, resultIdsQuery));

  const [dbResults, scores] = await Promise.all([
    dbResultsPromise,
    scoresPromise
  ]);

  const scoresMap = groupBy(scores, "resultId");

  const results = dbResults.map((result) => {
    const flatScores = scoresMap[result.id] || [];
    const scores = flatScores.reduce((acc, score) => {
      acc[score.name] = score.score;
      return acc;
    }, {} as Record<string, number | null>);
    return {
      ...result,
      scores,
    };
  });

  // Get all unique score names from the results
  const allScoreNames = [
    ...new Set(
      results.flatMap((result) => {
        const scoresObj = result.scores as Record<string, number> | null;
        return scoresObj ? Object.keys(scoresObj) : [];
      })
    ),
  ];

  // Calculate statistics and distributions for ALL scores
  const allStatistics: Record<string, EvaluationScoreStatistics> = {};
  const allDistributions: Record<string, EvaluationScoreDistributionBucket[]> = {};

  allScoreNames.forEach((scoreName) => {
    allStatistics[scoreName] = calculateScoreStatistics(results, scoreName);
    allDistributions[scoreName] = calculateScoreDistribution(results, scoreName);
  });

  const result = {
    evaluation,
    results,
    allStatistics,
    allDistributions,
  };

  return Response.json(result);
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; evaluationId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, evaluationId } = params;
  const { name } = await req.json();

  if (!name || typeof name !== "string" || name.trim() === "") {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const [updated] = await db
    .update(evaluations)
    .set({ name })
    .where(and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)))
    .returning();

  if (!updated) {
    return Response.json({ error: "Evaluation not found" }, { status: 404 });
  }

  return Response.json(updated);
}
