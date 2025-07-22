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

import { REPLACE_STATIC_FIELDS } from "./modifier-consts";
import { ALLOWED_TABLES_AND_SCHEMA, FromTable, TableName } from "./types";
import { WITH_EVALUATOR_SCORES_CTE_NAME } from "./with";

// Define valid columns for evaluation_results and traces tables
const EVALUATION_RESULTS_COLUMNS = new Set(
  ALLOWED_TABLES_AND_SCHEMA.evaluation_results
);
const TRACES_COLUMNS = new Set(
  ALLOWED_TABLES_AND_SCHEMA.traces
);

// Creates a dynamic column expression for accessing JSONB fields in evaluation_results.scores
const createDynamicScoreColumn = ({
  columnName,
  // addAlias = false,
  table = 'evaluation_results',
}: {
  columnName: string,
  addAlias?: boolean,
  table?: string,
}): ExpressionValue => ({
  type: "cast",
  symbol: "::",
  // as: addAlias ? columnName : undefined,
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
      table,
      column: {
        expr: {
          type: "default",
          value: 'scores'
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
  fromTables: FromTable[] = [],
  aliases: string[] = [],
  addAlias: boolean = false
): ExpressionValue | ExprList => {
  if (columnExpression.type === 'expr_list' && Array.isArray(columnExpression.value)) {
    return {
      ...columnExpression,
      value: columnExpression.value.map(
        item => replaceJsonbFields(item, fromTables, aliases, addAlias)
      )
    };
  }

  if (columnExpression.type === 'expr' && (columnExpression as unknown as ColumnRefExpr).expr?.type === 'column_ref') {
    const innerExpr = (columnExpression as unknown as ColumnRefExpr).expr;
    const tables = innerExpr.table
      ? [fromTables.find(table => table.as === innerExpr.table) ?? { table: innerExpr.table, as: innerExpr.table }]
      : fromTables;
    const column = innerExpr.column;
    const columnName = typeof column === 'string' ? column : column.expr.value as string;

    // Check for evaluation_scores table prefix to create dynamic score column
    if (innerExpr.table === 'evaluation_scores') {
      return createDynamicScoreColumn({
        columnName,
        addAlias,
        table: 'evaluation_results',
      });
    } else if (innerExpr.table === 'evaluator_scores') {
      return createDynamicScoreColumn({
        columnName,
        addAlias,
        table: WITH_EVALUATOR_SCORES_CTE_NAME,
      });
    }

    for (const table of tables) {
      if (table && columnName && REPLACE_STATIC_FIELDS[table.table as TableName]?.[columnName]) {
        const mapping = REPLACE_STATIC_FIELDS[table.table as TableName]?.[columnName]!;
        aliases.push(mapping.as ?? columnName);
        return mapping.replaceWith(table.as) as unknown as ExpressionValue;
      }
    }
    return columnExpression;
  }

  if (columnExpression.type === "column_ref") {
    const referredTable = (columnExpression as unknown as ColumnRefItem).table;
    const tables = referredTable
      ? [{ table: fromTables.find(table => table.as === referredTable)?.table ?? referredTable, as: referredTable }]
      : fromTables;
    const column = (columnExpression as unknown as ColumnRefItem).column;
    const columnName = typeof column === 'string' ? column : column.expr.value as string;

    if (referredTable === 'evaluation_scores') {
      return createDynamicScoreColumn({
        columnName,
        addAlias,
        table: 'evaluation_results',
      });
    } else if (referredTable === 'evaluator_scores') {
      return createDynamicScoreColumn({
        columnName,
        addAlias,
        table: WITH_EVALUATOR_SCORES_CTE_NAME,
      });
    }

    for (const table of tables) {
      if (table && columnName && REPLACE_STATIC_FIELDS[table.table as TableName]?.[columnName]) {
        const mapping = REPLACE_STATIC_FIELDS[table.table as TableName]?.[columnName]!;
        aliases.push(mapping.as ?? columnName);
        return mapping.replaceWith(table.as) as unknown as ExpressionValue;
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
          value: args.value.map(
            item => replaceJsonbFields(item, fromTables, aliases, addAlias)
          )
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
            cond: replaceJsonbFields(
              item.cond,
              fromTables,
              aliases,
              addAlias
            ) as ExpressionValue as Binary,
            result: replaceJsonbFields(item.result, fromTables, aliases, addAlias)
          };
        } else if (item.type === "else") {
          return {
            ...item,
            result: replaceJsonbFields(item.result, fromTables, aliases, addAlias)
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
      left: replaceJsonbFields(binaryExpression.left, fromTables, aliases, addAlias),
      right: replaceJsonbFields(binaryExpression.right, fromTables, aliases, addAlias)
    };
  }

  if (columnExpression.type === "aggr_func") {
    const aggrFunc = columnExpression as unknown as AggrFunc;
    return {
      ...aggrFunc,
      args: {
        ...aggrFunc.args,
        expr: replaceJsonbFields(aggrFunc.args.expr, fromTables, aliases, addAlias)
      }
    };
  }

  if (columnExpression.type === "cast") {
    const cast = columnExpression as unknown as Cast;
    return {
      ...cast,
      expr: replaceJsonbFields(cast.expr, fromTables, aliases, addAlias)
    };
  }

  return columnExpression;
};
