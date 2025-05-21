import { Parser, Select, With } from "node-sql-parser";

export const WITH_AGG_SCORES_CTE_NAME = 'ql_cte_agg_json_scores';

const WITH_AGG_SCORES_CTE = `
  WITH ${WITH_AGG_SCORES_CTE_NAME} AS (
    SELECT result_id, jsonb_object_agg(name, score) as scores FROM evaluation_scores GROUP BY result_id
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

const parser = new Parser();
const parseResult = parser.parse(WITH_AGG_SCORES_CTE);
const ast = Array.isArray(parseResult.ast) ? parseResult.ast[0] : parseResult.ast;

export const AGG_SCORE_CTE_WITH: With[] = (ast as Select).with as With[];
