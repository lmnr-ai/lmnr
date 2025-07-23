import { Parser, Select, With } from "node-sql-parser";

import { TableName } from "./types";

const parser = new Parser();
const sqlToWithArray = (s: string): With[] => {
  const parseResult = parser.parse(s, {
    database: 'Postgresql'
  });
  const ast = Array.isArray(parseResult.ast) ? parseResult.ast[0] : parseResult.ast;
  if (ast.type !== 'select') {
    throw new Error('SQL must be a SELECT statement');
  }
  return ((ast as Select).with ?? []) as With[];
};

const WITH_AGG_SCORES_CTE_NAME = '__ql_cte_agg_json_scores';
export const WITH_EVALUATOR_SCORES_CTE_NAME = 'evaluator_scores';
export const WITH_EVAL_DP_DATA_CTE_NAME = '__ql_cte_eval_dp_data';
export const WITH_EVAL_DP_TARGET_CTE_NAME = '__ql_cte_eval_dp_target';
export const WITH_SPAN_TAGS_CTE_NAME = '__ql_cte_span_tags';
export type AllowedTableNameForJoin =
  | TableName
  | typeof WITH_EVAL_DP_DATA_CTE_NAME
  | typeof WITH_EVAL_DP_TARGET_CTE_NAME
  | typeof WITH_EVALUATOR_SCORES_CTE_NAME
  | typeof WITH_SPAN_TAGS_CTE_NAME;

const WITH_AGG_SCORES_CTE = `
  WITH ${WITH_AGG_SCORES_CTE_NAME}(result_id, scores) AS (
    SELECT
      result_id,
      jsonb_object_agg(name, score) as scores
    FROM evaluation_scores
    GROUP BY result_id
  ),
  evaluation_results AS (
    SELECT
      evaluation_results.id,
      evaluation_results.created_at,
      evaluation_results.evaluation_id,
      evaluation_results.data,
      evaluation_results.target,
      evaluation_results.executor_output,
      evaluation_results.trace_id,
      evaluation_results.index,
      ${WITH_AGG_SCORES_CTE_NAME}.scores
    FROM evaluation_results
    JOIN ${WITH_AGG_SCORES_CTE_NAME}
    ON evaluation_results.id = ${WITH_AGG_SCORES_CTE_NAME}.result_id
  )
  SELECT * from evaluation_results
`;

const WITH_EVALUATOR_SCORES_CTE = `
  WITH ${WITH_EVALUATOR_SCORES_CTE_NAME}(__span_id, scores) AS (
    SELECT
      evaluator_scores.span_id,
      jsonb_object_agg(evaluators.name, evaluator_scores.score) as evaluator_scores
    FROM evaluator_scores
    JOIN evaluators ON evaluator_scores.evaluator_id = evaluators.id
    GROUP BY evaluator_scores.span_id
  )
  SELECT * FROM ${WITH_EVALUATOR_SCORES_CTE_NAME}
`;

const WITH_EVAL_DP_DATA_CTE = `
  WITH ${WITH_EVAL_DP_DATA_CTE_NAME}(id, full_data) AS (
    SELECT DISTINCT ON (spans.project_id, spans.span_id)
      evaluation_results.id,
      COALESCE(spans.input -> 'data', spans.input) as full_data
    FROM spans
    JOIN evaluation_results ON spans.trace_id = evaluation_results.trace_id
    WHERE spans.span_type = 'EXECUTOR'
    AND spans.start_time BETWEEN 
      evaluation_results.created_at - interval '10 minutes'
      AND evaluation_results.created_at + interval '24 hour'
    ORDER BY spans.project_id, spans.span_id, spans.start_time
  )
  SELECT * FROM ${WITH_EVAL_DP_DATA_CTE_NAME}
`;

const WITH_EVAL_DP_TARGET_CTE = `
  WITH ${WITH_EVAL_DP_TARGET_CTE_NAME}(id, target) AS (
    SELECT DISTINCT ON (spans.project_id, spans.span_id)
      evaluation_results.id,
      COALESCE(spans.input -> 'target', spans.input -> 0, spans.input) as target
    FROM spans
    JOIN evaluation_results ON spans.trace_id = evaluation_results.trace_id
    WHERE spans.span_type = 'EVALUATOR'
    AND spans.start_time BETWEEN 
      evaluation_results.created_at - interval '10 minutes'
      AND evaluation_results.created_at + interval '24 hour'
    ORDER BY spans.project_id, spans.span_id, spans.start_time
  )
  SELECT * FROM ${WITH_EVAL_DP_TARGET_CTE_NAME}
`;

// Hide most columns from label_classes table
const WITH_SPAN_TAGS_CTE = `
  WITH ${WITH_SPAN_TAGS_CTE_NAME}(__span_id, tags) AS (
    SELECT
      labels.span_id,
      ARRAY_AGG(label_classes.name) as tags
    FROM spans
    JOIN labels ON spans.span_id = labels.span_id
    JOIN label_classes ON labels.class_id = label_classes.id
    GROUP BY labels.span_id
  )
  SELECT * FROM ${WITH_SPAN_TAGS_CTE_NAME}
`;

const AGG_SCORE_CTE_WITH: With[] = sqlToWithArray(WITH_AGG_SCORES_CTE);
const EVAL_DP_DATA_CTE_WITH: With[] = sqlToWithArray(WITH_EVAL_DP_DATA_CTE);
const EVAL_DP_TARGET_CTE_WITH: With[] = sqlToWithArray(WITH_EVAL_DP_TARGET_CTE);
const EVALUATOR_SCORES_CTE_WITH: With[] = sqlToWithArray(WITH_EVALUATOR_SCORES_CTE);
const SPAN_TAGS_CTE_WITH: With[] = sqlToWithArray(WITH_SPAN_TAGS_CTE);

export const ADDITIONAL_WITH_CTES = [
  ...AGG_SCORE_CTE_WITH,
  ...EVAL_DP_DATA_CTE_WITH,
  ...EVAL_DP_TARGET_CTE_WITH,
  ...EVALUATOR_SCORES_CTE_WITH,
  ...SPAN_TAGS_CTE_WITH,
];
