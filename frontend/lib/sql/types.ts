import { BaseFrom, Binary, Cast, ExpressionValue as BaseExpressionValue } from "node-sql-parser";

import { datasetDatapoints, datasets, evaluationResults, evaluations, evaluationScores, spans, traces } from "../db/migrations/schema";
import { AllowedTableNameForJoin } from "./with";

export type Arg = {
  name: string,
  value: unknown
}

export type TranspiledQuery = {
  valid: boolean;
  sql: string | null;
  args: Arg[];
  error: string | null;
  warnings?: string[];
};

export type TableName =
  | 'spans'
  | 'traces'
  | 'evaluations'
  | 'evaluation_results'
  | 'evaluation_scores'
  | 'datasets'
  | 'dataset_datapoints';

export interface JsonbFieldMapping {
  replaceWith: unknown;
  as?: string;
}

// New types for auto-join functionality
export interface JoinCondition {
  leftTable: TableName;
  leftColumn: string;
  rightTable: AllowedTableNameForJoin;
  rightColumn: string;
  additionalConditions?: Binary[];
  lateral?: boolean;
}

// types.d.ts in the library are slightly outdated, so we need to extend the types here
export interface Extract {
  type: 'extract';
  args: {
    field: string;
    cast_type: null;
    source: ExpressionValue;
  };
}

// Extend the Cast interface to allow for both 'as' and '::' symbols
// types.d.ts in the library are slightly outdated, so we need to extend the types here
export interface ExtendedCast extends Omit<Cast, 'symbol' | 'expr'> {
  symbol: 'as' | '::';
  expr: BaseExpressionValue | Extract;
  target: {
    dataType: string;
    length?: number;
    suffix?: unknown[];
  }[];
}

export interface AutoJoinRule {
  // Tables that trigger this join rule
  triggerTables: TableName[];
  // Column references that trigger this join rule
  triggerColumns: string[];
  // The join chain to add (in order)
  joinChain: JoinCondition[];
  // Column replacements to apply after joining
  columnReplacements?: {
    original: string;
    replacement: {
      table: AllowedTableNameForJoin;
      column: string;
      as?: string;
    } | Binary | ExpressionValue | ExtendedCast;
  }[];
}

export interface JoinASTNode extends BaseFrom {
  join: string;
  on: Binary;
}

// Extend the base ExpressionValue type to include our custom types
export type ExpressionValue = BaseExpressionValue | Extract;

const camelCaseToSnakeCase = (str: string) =>
  str.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

export const ALLOWED_TABLES_AND_SCHEMA: Record<TableName, string[]> = {
  spans: Object.keys(spans).filter(key => key !== 'enableRLS').map(camelCaseToSnakeCase),
  traces: Object.keys(traces).filter(key => key !== 'enableRLS').map(camelCaseToSnakeCase),
  evaluations: Object.keys(evaluations).filter(key => key !== 'enableRLS').map(camelCaseToSnakeCase),
  evaluation_results: Object.keys(evaluationResults).filter(key => key !== 'enableRLS').map(camelCaseToSnakeCase),
  evaluation_scores: Object.keys(evaluationScores).filter(key => key !== 'enableRLS').map(camelCaseToSnakeCase),
  datasets: Object.keys(datasets).filter(key => key !== 'enableRLS').map(camelCaseToSnakeCase),
  dataset_datapoints: Object.keys(datasetDatapoints).filter(key => key !== 'enableRLS').map(camelCaseToSnakeCase)
};

export const ALLOWED_TABLES: Set<TableName> = new Set(Object.keys(ALLOWED_TABLES_AND_SCHEMA) as TableName[]);
