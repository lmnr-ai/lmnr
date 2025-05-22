import {
  AggrFunc,
  Binary,
  Case,
  Cast,
  ColumnRefExpr,
  ColumnRefItem,
  ExpressionValue,
  ExprList,
  Function as NodeSqlFunction
} from "node-sql-parser";

import { REPLACE_JSONB_FIELDS } from "./modifier-consts";
import { ALLOWED_TABLES_AND_SCHEMA, TableName } from "./types";

// Define valid columns for evaluation_results and traces tables
const EVALUATION_RESULTS_COLUMNS = new Set(
  ALLOWED_TABLES_AND_SCHEMA.evaluation_results
);
const TRACES_COLUMNS = new Set(
  ALLOWED_TABLES_AND_SCHEMA.traces
);

// Creates a dynamic column expression for accessing JSONB fields in evaluation_results.scores
const createDynamicScoreColumn = (columnName: string): ExpressionValue => ({
  type: "cast",
  symbol: "::",
  as: columnName,
  target: [
    {
      dataType: "FLOAT",
      length: 8,
      suffix: []
    }
  ],
  keyword: "cast",
  expr: {
    type: "binary_expr",
    operator: "->>",
    left: {
      type: "column_ref",
      table: "evaluation_results",
      column: {
        expr: {
          type: "default",
          value: "scores"
        }
      },
      collate: null
    },
    right: {
      type: "single_quote_string",
      value: columnName
    },
    parentheses: true
  }
} as unknown as ExpressionValue);

export const replaceJsonbFields = (
  columnExpression: ExpressionValue | ExprList,
  fromTables: string[] = [],
  aliases: string[] = [],
): ExpressionValue | ExprList => {
  if (columnExpression.type === 'expr_list' && Array.isArray(columnExpression.value)) {
    return {
      ...columnExpression,
      value: columnExpression.value.map(item => replaceJsonbFields(item, fromTables, aliases))
    };
  }

  if (columnExpression.type === 'expr' && (columnExpression as unknown as ColumnRefExpr).expr?.type === 'column_ref') {
    const innerExpr = (columnExpression as unknown as ColumnRefExpr).expr;
    const tables = innerExpr.table ? [innerExpr.table] : fromTables;
    const column = innerExpr.column;
    const columnName = typeof column === 'string' ? column : column.expr.value as string;

    // Check for dynamic scores column in evaluation_results
    if (tables.includes('evaluation_results') &&
      !EVALUATION_RESULTS_COLUMNS.has(columnName) &&
      !TRACES_COLUMNS.has(columnName) &&
      !aliases.includes(columnName)) {
      return createDynamicScoreColumn(columnName);
    }

    for (const table of tables) {
      if (table && columnName && REPLACE_JSONB_FIELDS[table as TableName]?.[columnName]) {
        const mapping = REPLACE_JSONB_FIELDS[table as TableName]?.[columnName]!;
        aliases.push(mapping.as ?? columnName);
        return mapping.replaceWith as unknown as ExpressionValue;
      }
    }
    return columnExpression;
  }

  if (columnExpression.type === "column_ref") {
    const tables = (columnExpression as unknown as ColumnRefItem).table ? [
      (columnExpression as unknown as ColumnRefItem).table
    ] : fromTables;
    const column = (columnExpression as unknown as ColumnRefItem).column;
    const columnName = typeof column === 'string' ? column : column.expr.value as string;

    // Check for dynamic scores column in evaluation_results
    if (tables.includes('evaluation_results') &&
      !EVALUATION_RESULTS_COLUMNS.has(columnName) &&
      !TRACES_COLUMNS.has(columnName) &&
      !aliases.includes(columnName) &&
      !['scores'].includes(columnName)
    ) {
      return createDynamicScoreColumn(columnName);
    }

    for (const table of tables) {
      if (table && columnName && REPLACE_JSONB_FIELDS[table as TableName]?.[columnName]) {
        const mapping = REPLACE_JSONB_FIELDS[table as TableName]?.[columnName]!;
        aliases.push(mapping.as ?? columnName);
        return mapping.replaceWith as unknown as ExpressionValue;
      }
    }
    return columnExpression;
  }

  if (columnExpression.type === "function") {
    const functionExpression = columnExpression as unknown as NodeSqlFunction;
    const args = functionExpression.args;
    if (args !== undefined) {
      return {
        ...functionExpression,
        args: {
          ...args,
          value: args.value.map(item => replaceJsonbFields(item, fromTables, aliases))
        }
      };
    }
    return columnExpression;
  }

  if (columnExpression.type === "case") {
    const caseExpression = columnExpression as unknown as Case;
    const args = caseExpression.args;
    return {
      ...caseExpression,
      args: args.map(item => {
        if (item.type === "when") {
          return {
            ...item,
            cond: replaceJsonbFields(item.cond, fromTables, aliases) as ExpressionValue as Binary,
            result: replaceJsonbFields(item.result, fromTables, aliases)
          };
        } else if (item.type === "else") {
          return {
            ...item,
            result: replaceJsonbFields(item.result, fromTables, aliases)
          };
        }
        return item;
      })
    };
  }

  if (columnExpression.type === "binary_expr") {
    const binaryExpression = columnExpression as unknown as Binary;
    return {
      ...binaryExpression,
      left: replaceJsonbFields(binaryExpression.left, fromTables, aliases),
      right: replaceJsonbFields(binaryExpression.right, fromTables, aliases)
    };
  }

  if (columnExpression.type === "aggr_func") {
    const aggrFunc = columnExpression as unknown as AggrFunc;
    return {
      ...aggrFunc,
      args: {
        ...aggrFunc.args,
        expr: replaceJsonbFields(aggrFunc.args.expr, fromTables, aliases)
      }
    };
  }

  if (columnExpression.type === "cast") {
    const cast = columnExpression as unknown as Cast;
    return {
      ...cast,
      expr: replaceJsonbFields(cast.expr, fromTables, aliases)
    };
  }

  return columnExpression;
};
