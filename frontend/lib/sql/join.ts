import {
  AggrFunc,
  Binary,
  Case,
  Cast,
  Column,
  ColumnRef,
  ColumnRefExpr,
  ColumnRefItem,
  ExpressionValue,
  ExprList,
  Function as NodeSqlFunction,
  Join,
  Select,
} from "node-sql-parser";

import { AUTO_JOIN_RULES } from "./modifier-consts";
import {
  ALLOWED_TABLES_AND_SCHEMA,
  AutoJoinRule,
  JoinCondition,
  TableName
} from "./types";

/**
* Apply automatic join rules to the query based on configured rules
* @param {Select} node - The SELECT node to modify
* @param {string[]} fromTables - Tables in the FROM clause
*/
export const applyAutoJoinRules = (node: Select, fromTables: string[]): void => {
  // Skip if no FROM tables
  if (fromTables.length === 0) return;

  // Check each rule
  for (const rule of AUTO_JOIN_RULES) {
    // Check if any trigger table is in the FROM clause
    const hasTriggerTable = rule.triggerTables.some(table =>
      fromTables.includes(table)
    );

    if (!hasTriggerTable) continue;

    // Check if any trigger column is referenced
    let hasTriggerColumn = false;

    // Check columns in SELECT clause
    for (const column of node.columns) {
      if (hasColumnReference(column.expr, rule.triggerColumns)) {
        hasTriggerColumn = true;
        break;
      }
    }

    // Check columns in WHERE clause
    if (!hasTriggerColumn && node.where) {
      hasTriggerColumn = hasColumnReference(node.where, rule.triggerColumns);
    }

    if (!hasTriggerColumn) continue;

    // Rule matched, apply joins
    applyJoins(node, rule);
  }
};

/**
 * Qualifies column references in an expression by adding table names
 *
 * @param expression - The expression to process
 * @param fromTables - Tables in the FROM clause, with primary table first
 * @returns The modified expression with qualified column references
 */
export function qualifyColumnReferences<T extends ExpressionValue>(
  expression: T,
  fromTables: string[]
): T {
  if (!expression) return expression;

  // Handle column references
  if (expression.type === 'column_ref') {
    const columnRef = expression as ColumnRefItem;
    const column = columnRef.column;

    // Only process unqualified column references (no table specified)
    if (!columnRef.table) {
      const columnName = typeof column === 'string' ? column : column.expr?.value as string;
      const tableName = resolveColumnToTable(columnName, fromTables);
      // If we found a table that has this column, qualify the reference
      if (tableName) {
        return {
          ...columnRef,
          table: tableName
        } as ColumnRefItem as T;
      }
    }
    return expression;
  }

  // Handle binary expressions (recursively process both sides)
  if (expression.type === 'binary_expr') {
    const binaryExpr = expression as Binary;
    return {
      ...binaryExpr,
      left: qualifyColumnReferences(binaryExpr.left as ExpressionValue, fromTables),
      right: qualifyColumnReferences(binaryExpr.right as ExpressionValue, fromTables)
    } as Binary as T;
  }

  // Handle expressions with nested expr property
  if (expression.type === 'expr' && (expression as unknown as ColumnRefExpr).expr) {
    const innerExpr = (expression as unknown as ColumnRefExpr);
    if (innerExpr) {
      return {
        ...innerExpr,
        expr: qualifyColumnReferences(innerExpr.expr, fromTables)
      } as ColumnRefExpr as T;
    }
  }

  // Handle function calls with arguments
  if (expression.type === 'function') {
    const funcExpr = expression as NodeSqlFunction;
    if (funcExpr.args && Array.isArray(funcExpr.args.value)) {
      return {
        ...funcExpr,
        args: {
          ...funcExpr.args,
          value: funcExpr.args.value.map((arg: ExpressionValue) =>
            qualifyColumnReferences(arg, fromTables)
          )
        }
      } as NodeSqlFunction as T;
    }
  }

  // Handle expression lists
  if (expression.type === 'expr_list' && Array.isArray((expression as ExprList).value)) {
    // Use type assertion to avoid TypeScript errors
    return {
      ...expression,
      value: (expression as ExprList).value.map((item: ExpressionValue) =>
        qualifyColumnReferences(item, fromTables)
      )
    } as ExprList as T;
  }

  return expression;
};


/**
 * Creates a JOIN AST node
 * @param condition - Join condition
 * @returns JOIN AST node
 */
const createJoinNode = (condition: JoinCondition): Join => {
  // Create the main equality condition
  const mainCondition: Binary = {
    type: 'binary_expr',
    operator: '=',
    left: {
      type: 'column_ref',
      table: condition.leftTable,
      column: condition.leftColumn
    },
    right: {
      type: 'column_ref',
      table: condition.rightTable,
      column: condition.rightColumn
    }
  };

  // If there are no additional conditions, just use the main condition
  if (!condition.additionalConditions || condition.additionalConditions.length === 0) {
    return {
      db: null,
      table: condition.rightTable,
      as: null,
      join: 'INNER JOIN',
      // join: condition.lateral ? 'INNER JOIN' : 'INNER JOIN',
      on: mainCondition
    };
  }

  // Combine all conditions with AND operators
  const combinedCondition = [mainCondition, ...condition.additionalConditions].reduce(
    (acc: Binary, curr: Binary): Binary => {
      if (!acc) return curr;
      return {
        type: 'binary_expr',
        operator: 'AND',
        left: acc,
        right: curr
      };
    }
  );

  return {
    db: null,
    table: condition.rightTable,
    as: null,
    join: 'INNER JOIN',
    on: combinedCondition
  };
};


/**
 * Replace column references based on the replacements defined in a join rule
 * @param expression - Expression to replace column references in
 * @param rule - Join rule with replacements
 * @returns Modified expression
 */
const replaceColumnReferences = (
  expression: ExpressionValue,
  rule: AutoJoinRule
): ExpressionValue => {
  if (!expression || !rule.columnReplacements) return expression;

  if (expression.type === 'column_ref') {
    const columnRef = expression as ColumnRefItem;
    const column = columnRef.column;
    // Handle both string columns and object columns
    const columnName = typeof column === 'string' ? column : column.expr?.value as string;

    // Only replace unqualified column references (no table specified)
    if (!columnRef.table) {
      for (const replacement of rule.columnReplacements) {
        if (columnName === replacement.original) {
          // Handle different types of replacements
          if (typeof replacement.replacement === 'object' && 'table' in replacement.replacement) {
            return {
              type: 'column_ref',
              table: replacement.replacement.table,
              column: replacement.replacement.column,
              as: (replacement.replacement as { as?: string }).as
            } as ColumnRefItem;
          } else {
            return replacement.replacement as ExpressionValue;
          }
        }
      }
    }
    return expression;
  }

  if (expression.type === 'binary_expr') {
    const binaryExpr = expression as Binary;
    return {
      ...binaryExpr,
      left: replaceColumnReferences(binaryExpr.left as ExpressionValue, rule),
      right: replaceColumnReferences(binaryExpr.right as ExpressionValue, rule)
    } as Binary;
  }

  // Handle other expression types that might contain nested expressions
  if (expression.type === 'function' && (expression as NodeSqlFunction).args) {
    const funcExpr = expression as NodeSqlFunction;
    if (funcExpr.args && Array.isArray(funcExpr.args.value)) {
      return {
        ...funcExpr,
        args: {
          ...funcExpr.args,
          value: funcExpr.args.value.map((arg: ExpressionValue) =>
            replaceColumnReferences(arg, rule)
          )
        }
      } as NodeSqlFunction;
    }
  }

  if (expression.type === 'cast') {
    const castExpr = expression as Cast;
    return {
      ...castExpr,
      expr: replaceColumnReferences(castExpr.expr, rule),
      target: castExpr.target
    };
  }

  if (expression.type === 'case') {
    const caseExpr = expression as Case;
    return {
      ...caseExpr,
      args: caseExpr.args.map(arg => {
        if (arg.type === 'when') {
          return {
            ...arg,
            cond: replaceColumnReferences(arg.cond, rule),
            result: replaceColumnReferences(arg.result, rule)
          };
        } else if (arg.type === 'else') {
          return {
            ...arg,
            result: replaceColumnReferences(arg.result, rule)
          };
        }
        return arg;
      })
    } as Case;
  }

  if (expression.type === 'aggr_func') {
    const aggrFuncExpr = expression as AggrFunc;
    return {
      ...aggrFuncExpr,
      args: {
        ...aggrFuncExpr.args,
        expr: replaceColumnReferences(aggrFuncExpr.args.expr, rule)
      }
    } as AggrFunc;
  }

  return expression;
};

/**
 * Resolves unqualified column references to a specific table
 *
 * If multiple tables have the same column, we use a priority order:
 * 1. The primary table in the FROM clause (first table)
 * 2. Any other table in the query
 *
 * @param columnName - The unqualified column name
 * @param fromTables - Tables in the FROM clause, with primary table first
 * @returns The qualified table name, or null if no match
 */
const resolveColumnToTable = (columnName: string, fromTables: string[]): string | null => {
  if (!columnName || fromTables.length === 0) return null;

  for (const table of fromTables) {
    const columnNameCamelCase = columnName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    if (ALLOWED_TABLES_AND_SCHEMA[table as TableName]?.includes(columnNameCamelCase)) {
      return table;
    }
  }

  return null;
};

/**
  * Apply joins from a rule to the query
  * @param {Select} node - The SELECT node to modify
  * @param {AutoJoinRule} rule - The rule to apply
  */
const applyJoins = (node: Select, rule: AutoJoinRule): void => {
  if (!node.from) return;

  const fromNodes = Array.isArray(node.from) ? node.from : [node.from];

  // Track tables that are already joined
  const joinedTables = new Set<string>();

  // Collect tables that are already in the FROM clause
  fromNodes.forEach(from => {
    if ('table' in from) {
      joinedTables.add(from.table as string);
    }
  });

  // Add each join in the chain
  let newFromNodes = [...fromNodes];

  for (const joinCondition of rule.joinChain) {
    // Skip if the right table is already joined
    if (joinedTables.has(joinCondition.rightTable)) continue;

    // Create a join node
    const joinNode = createJoinNode(joinCondition);

    // Add it to the FROM clause
    newFromNodes.push(joinNode);

    // Mark table as joined
    joinedTables.add(joinCondition.rightTable);
  }

  // Update the FROM clause if we added any joins
  if (newFromNodes.length > fromNodes.length) {
    node.from = newFromNodes;
  }

  // Apply column replacements
  if (rule.columnReplacements) {
    // Apply to columns
    if (node.columns) {
      node.columns = node.columns.map((column: Column) => {
        let newAs = column.as;
        if (column.expr.type === 'column_ref') {
          const columnRef = column.expr as ColumnRefItem;
          if (typeof columnRef.column === 'string') {
            newAs = newAs ?? columnRef.column;
          } else {
            newAs = newAs ?? (columnRef.column.expr?.value as string);
          }
        } else if (column.expr.type === 'expr') {
          const innerColumnRef = (column.expr as unknown as ColumnRefExpr).expr as ColumnRefItem;
          if (typeof innerColumnRef.column === 'string') {
            newAs = newAs ?? innerColumnRef.column;
          } else {
            newAs = newAs ?? (innerColumnRef.column.expr?.value as string);
          }
        }
        return {
          ...column,
          expr: replaceColumnReferences(column.expr, rule),
          as: newAs
        };
      });
    }

    // Apply to WHERE
    if (node.where) {
      node.where = replaceColumnReferences(node.where, rule) as Binary;
    }

    // Apply to GROUP BY
    if (node.groupby?.columns) {
      node.groupby.columns = node.groupby.columns.map(column =>
        replaceColumnReferences(column, rule) as ColumnRef
      );
    }

    // Apply to ORDER BY
    if (node.orderby) {
      node.orderby = node.orderby.map(order => ({
        ...order,
        expr: replaceColumnReferences(order.expr, rule)
      }));
    }
  }
};

/**
 * Check if an expression references any of the specified columns
 * @param {ExpressionValue} expression - The expression to check
 * @param {string[]} columns - Column names to look for
 * @returns {boolean} - Whether any column is referenced
 */
const hasColumnReference = (expression: ExpressionValue, columns: string[]): boolean => {
  if (!expression) return false;

  if (expression.type === 'column_ref') {
    const columnRef = expression as ColumnRefItem;
    const column = columnRef.column;
    const columnName = typeof column === 'string' ? column : column.expr?.value as string;
    return columns.includes(columnName);
  }

  if (expression.type === 'binary_expr') {
    const binaryExpr = expression as Binary;
    return hasColumnReference(binaryExpr.left as ExpressionValue, columns) ||
      hasColumnReference(binaryExpr.right as ExpressionValue, columns);
  }

  if (expression.type === 'expr') {
    const exprExpr = (expression as unknown as ColumnRefExpr).expr;
    return exprExpr ? hasColumnReference(exprExpr, columns) : false;
  }

  if (expression.type === 'function') {
    const funcExpr = expression as NodeSqlFunction;
    if (funcExpr.args && Array.isArray(funcExpr.args.value)) {
      return funcExpr.args.value.some(arg =>
        hasColumnReference(arg as ExpressionValue, columns)
      );
    }
  }

  if (expression.type === 'case') {
    const caseExpr = expression as Case;
    return caseExpr.args.some(arg => {
      if (arg.type === 'when') {
        return hasColumnReference(arg.cond, columns) ||
          hasColumnReference(arg.result, columns);
      }
      return hasColumnReference(arg.result, columns);
    });
  }

  if (expression.type === 'aggr_func') {
    const aggrFuncExpr = expression as AggrFunc;
    return hasColumnReference(aggrFuncExpr.args.expr, columns);
  }

  if (expression.type === 'expr_list' && Array.isArray((expression as ExprList).value)) {
    return (expression as ExprList).value.some(item =>
      hasColumnReference(item as ExpressionValue, columns)
    );
  }

  return false;
};
