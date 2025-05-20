import { TableColumnAst } from "node-sql-parser";

export type Arg = {
  name: string,
  value: any
}

export type TranspiledQuery = {
  valid: boolean;
  sql: string | null;
  args: Arg[];
  error: string | null;
  warning?: string;
};

export type TableName = 'spans' | 'traces' | 'evaluations' | 'evaluation_results' | 'evaluation_scores';

export type JsonbFieldMapping = {
  replaceWith: TableColumnAst;
  as?: string;
}
