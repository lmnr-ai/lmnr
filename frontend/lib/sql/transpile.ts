/**
 * SQL Validator and Transpiler
 * 
 * This module validates and transpiles a subset of SQL queries for a platform 
 * where users have projects with multiple entities inside.
 * 
 * Features:
 * 1. Only allows SELECT queries
 * 2. Only allows access to specified tables
 * 3. Automatically adds project_id to WHERE clause for security
 * 4. Provides syntactic sugar for JSONB fields
 */

import { NoopLogger, DefaultLogger, Logger } from "drizzle-orm";
import {
  AggrFunc,
  AST,
  BaseFrom,
  Binary,
  Case,
  Cast,
  Column,
  ColumnRef,
  ColumnRefExpr,
  ColumnRefItem,
  ExpressionValue,
  ExprList,
  From,
  Function as NodeSqlFunction,
  OrderBy,
  Parser,
  Select,
  TableColumnAst,
  TableExpr,
} from "node-sql-parser";
import { db } from "@/lib/db/drizzle";
import { PostgresJsPreparedQuery } from "drizzle-orm/postgres-js";
import { Arg, TableName, TranspiledQuery } from "./types";
import { REPLACE_JSONB_FIELDS } from "./replace";

class SQLValidator {
  private parser: Parser;
  private allowedTables: Set<string>;

  constructor() {
    this.parser = new Parser();

    this.allowedTables = new Set([
      "spans",
      "traces",
      "evaluations",
      "evaluation_results",
      "evaluation_scores",
      "datasets",
      "dataset_datapoints"
    ]);
  }

  /**
   * Validates and transpiles a user SQL query to a safe SQL query
   * @param {string} sqlQuery - The user's SQL query
   * @param {string} projectId - The user's project ID
   * @returns {TranspiledQuery} - { valid: boolean, sql: string, params: any[], error: string }
   */
  public validateAndTranspile(sqlQuery: string, projectId: string): TranspiledQuery {
    try {
      // Parse the query
      const ast = this.parser.astify(sqlQuery, { database: 'Postgresql' });

      // Validate query type (only SELECT allowed)
      if (!this.isSelectQuery(ast)) {
        return {
          valid: false,
          sql: null,
          args: [],
          error: 'Only SELECT queries are allowed'
        };
      }

      const allowedTables = [`(select)::(.*)::(${Array.from(this.allowedTables).join('|')})`]
      this.parser.whiteListCheck(sqlQuery,
        allowedTables,
        {
          database: 'Postgresql',
          type: 'table',
        }
      )

      // Transpile the query
      const transpiled = this.transpileQuery(ast, projectId);

      return {
        valid: true,
        sql: transpiled.sql,
        args: transpiled.args,
        error: null
      };
    } catch (error) {
      return {
        valid: false,
        sql: null,
        args: [],
        error: `SQL syntax error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Check if the query is a SELECT query
   * @param {Object} ast - The parsed SQL AST
   * @returns {boolean}
   */
  private isSelectQuery(ast: AST | AST[]): boolean {
    // Check if it's a single query and it's a SELECT
    if (Array.isArray(ast)) {
      return ast.every(statement => statement.type === 'select');
    }
    return ast.type === 'select';
  }

  /**
   * Transpile the query to add project_id restriction and handle JSONB fields
   * @param {Object} ast - The parsed SQL AST
   * @param {string} projectId - The user's project ID
   * @returns {Object} - { sql: string, params: Arg[] }
   */
  private transpileQuery(ast: AST | AST[], projectId: string): {
    sql: string;
    args: Arg[];
  } {
    const statements = Array.isArray(ast) ? ast : [ast];

    for (const statement of statements) {
      if (statement.type !== 'select') continue;

      // Add project_id condition to WHERE clause
      this.processSubqueries(statement, new Set());
    }

    // Convert AST back to SQL
    let sql = this.parser.sqlify(ast, {
      database: 'Postgresql',
    });

    return {
      sql: sql,
      args: [{
        name: 'project_id',
        value: projectId
      }],
    };
  }

  /**
   * Recursively process all subqueries in the AST and add project_id conditions
   * @param {AST} node - Current AST node
   * @param {Set<AST>} processedNodes - Set of already processed nodes to prevent infinite recursion
   */
  private processSubqueries(node: AST, processedNodes: Set<AST>): AST {
    if (!node || typeof node !== 'object') return node;

    // Prevent processing the same node twice
    if (processedNodes.has(node)) return node;
    processedNodes.add(node);

    // Handle subqueries in WHERE clauses
    if (node.type === 'select') {
      const newProcessedNodes = new Set(processedNodes);
      newProcessedNodes.add(node);

      let fromTables: string[] = [];

      if (node.from) {
        if (Array.isArray(node.from)) {
          fromTables = node.from.map((from: From) => {
            if ((from as BaseFrom).table) {
              return (from as BaseFrom).table;
            }
          }).filter((table): table is string => table !== undefined);
        }
      }

      node.columns.forEach((column: Column) => {
        const aliases: string[] = [];
        column.expr = this.replaceJsonbFields(column.expr, fromTables, aliases);
        column.as = aliases[0] ?? null;
      });

      if (node.groupby?.columns) {
        node.groupby.columns = node.groupby.columns.map((column: ColumnRef) =>
          this.replaceJsonbFields(column, fromTables, []) as ExpressionValue as ColumnRef
        );
      }

      if (node.orderby) {
        node.orderby = node.orderby.map((order: OrderBy) => ({
          ...order,
          expr: this.replaceJsonbFields(order.expr, fromTables, []) as ExpressionValue,
        }));
      }

      // Process all potential subqueries in this select statement
      if (node.with) {
        for (const withItem of node.with) {
          this.processSubqueries(withItem.stmt.ast, newProcessedNodes);
        }
      }

      if (node.from) {
        const fromNodes = Array.isArray(node.from) ? node.from : [node.from];
        for (const fromNode of fromNodes) {
          if ((fromNode as TableExpr).expr) {
            this.processSubqueries((fromNode as TableExpr).expr.ast, newProcessedNodes);
          }
        }
      }

      if (node.where) {
        if (node.where.type === 'binary_expr') {
          const leftASTs = this.getExpressionASTs((node.where as Binary).left);
          const rightASTs = this.getExpressionASTs((node.where as Binary).right);
          for (const leftAST of leftASTs) {
            this.processSubqueries(leftAST, newProcessedNodes);
          }
          for (const rightAST of rightASTs) {
            this.processSubqueries(rightAST, newProcessedNodes);
          }
          node.where = {
            ...node.where,
            left: this.replaceJsonbFields(node.where.left, fromTables, []) as ExpressionValue,
            right: this.replaceJsonbFields(node.where.right, fromTables, []) as ExpressionValue,
          }
        } else if (node.where.type === 'function') {
          const args = (node.where as NodeSqlFunction).args;
          if (args) {
            const argASTs = this.getExpressionASTs(args);
            for (const argAST of argASTs) {
              this.processSubqueries(argAST, newProcessedNodes);
            }
            node.where = {
              ...node.where,
              args: {
                ...args,
                value: args.value.map(item => this.replaceJsonbFields(item, fromTables, []) as ExpressionValue),
              },
            }
          }
        }
      }

      // Now apply the project_id condition to this select statement
      const mainTable = this.findMainTable(node);
      if (this.allowedTables.has(mainTable)) {
        this.applyProjectIdToStatement(node);
      }
      return node;
    } else if (node as unknown as TableExpr) {
      return this.processSubqueries((node as unknown as TableExpr).expr.ast, processedNodes);
    } else {
      throw new Error('Only select queries are supported');
    }
  }

  private getExpressionASTs(expression: ExpressionValue | ExprList): AST[] {
    if (expression.type === 'expr_list' && Array.isArray(expression.value)) {
      return (expression.value as ExpressionValue[]).flatMap(item => this.getExpressionASTs(item));
    }

    if ((expression as unknown as TableColumnAst)?.ast) {
      const ast = (expression as unknown as TableColumnAst).ast;
      if (ast) {
        return Array.isArray(ast) ? ast : [ast];
      }
    }

    if (expression.type === 'function' && (expression as unknown as NodeSqlFunction).args) {
      const args = (expression as unknown as NodeSqlFunction).args;
      if (args) {
        return this.getExpressionASTs(args);
      }
    }

    if (expression.type === 'case') {
      const args = (expression as unknown as Case).args;
      if (args) {
        for (const arg of args) {
          if (arg.type === 'when') {
            return this.getExpressionASTs(arg.cond);
          }
          if (arg.type === 'else') {
            return this.getExpressionASTs(arg.result);
          }
        }
      }
    }

    if (expression.type === 'binary_expr') {
      const binaryExpression = expression as unknown as Binary;
      return [
        ...this.getExpressionASTs(binaryExpression.left),
        ...this.getExpressionASTs(binaryExpression.right)
      ];
    }

    if (expression.type === 'aggr_func') {
      const aggrFunc = expression as unknown as AggrFunc;
      return this.getExpressionASTs(aggrFunc.args.expr);
    }

    if (expression.type === 'cast') {
      const cast = expression as unknown as Cast;
      return this.getExpressionASTs(cast.expr);
    }

    return [];
  }

  private replaceJsonbFields(
    columnExpression: ExpressionValue | ExprList,
    fromTables: string[] = [],
    aliases: string[] = [],
  ): ExpressionValue | ExprList {
    if (columnExpression.type === 'expr_list' && Array.isArray(columnExpression.value)) {
      return {
        ...columnExpression,
        value: columnExpression.value.map(item => this.replaceJsonbFields(item, fromTables, aliases))
      }
    }

    if (columnExpression.type === 'expr' && (columnExpression as unknown as ColumnRefExpr).expr?.type === 'column_ref') {
      const innerExpr = (columnExpression as unknown as ColumnRefExpr).expr;
      const tables = innerExpr.table ? [innerExpr.table] : fromTables;
      const column = innerExpr.column;
      const columnName = typeof column === 'string' ? column : column.expr.value as string;
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
            value: args.value.map(item => this.replaceJsonbFields(item, fromTables, aliases))
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
              cond: this.replaceJsonbFields(item.cond, fromTables, aliases) as ExpressionValue as Binary,
              result: this.replaceJsonbFields(item.result, fromTables, aliases)
            }
          } else if (item.type === "else") {
            return {
              ...item,
              result: this.replaceJsonbFields(item.result, fromTables, aliases)
            }
          }
          return item;
        })
      }
    }

    if (columnExpression.type === "binary_expr") {
      const binaryExpression = columnExpression as unknown as Binary;
      return {
        ...binaryExpression,
        left: this.replaceJsonbFields(binaryExpression.left, fromTables, aliases),
        right: this.replaceJsonbFields(binaryExpression.right, fromTables, aliases)
      }
    }

    if (columnExpression.type === "aggr_func") {
      const aggrFunc = columnExpression as unknown as AggrFunc;
      return {
        ...aggrFunc,
        args: {
          ...aggrFunc.args,
          expr: this.replaceJsonbFields(aggrFunc.args.expr, fromTables, aliases)
        }
      }
    }

    if (columnExpression.type === "cast") {
      const cast = columnExpression as unknown as Cast;
      return {
        ...cast,
        expr: this.replaceJsonbFields(cast.expr, fromTables, aliases)
      }
    }

    return columnExpression;
  }

  /**
   * Apply project_id condition to a statement
   * @param {AST} statement - SQL statement object
   */
  private applyProjectIdToStatement(statement: AST) {
    if (statement.type !== 'select') return;

    const mainTable = this.findMainTable(statement);
    let projectIdCondition: Binary;

    // Create the appropriate condition based on the table
    if (['spans', 'traces', 'evaluations'].includes(mainTable)) {
      // Direct project_id condition for tables with project_id column
      projectIdCondition = {
        type: 'binary_expr',
        operator: '=',
        left: {
          type: 'column_ref',
          table: mainTable,
          column: 'project_id'
        },
        right: {
          type: 'param',
          value: 1, // Using $1 for the parameter
          // @ts-ignore
          prefix: '$'
        }
      };
    } else if (mainTable === 'evaluation_scores') {
      // Nested query for evaluation_scores
      projectIdCondition = {
        type: 'binary_expr',
        operator: 'IN',
        left: {
          type: 'column_ref',
          table: mainTable,
          column: 'result_id'
        },
        right: {
          type: 'expr_list',
          value: [{
            type: 'select',
            columns: [{
              expr: { type: 'column_ref', table: '', column: 'id' },
              as: null
            }],
            from: [{ table: 'evaluation_results', as: null }],
            where: {
              type: 'binary_expr',
              operator: 'IN',
              left: {
                type: 'column_ref',
                table: '',
                column: 'evaluation_id'
              },
              right: {
                type: 'expr_list',
                value: [{
                  type: 'select',
                  columns: [{
                    expr: { type: 'column_ref', table: '', column: 'id' },
                    as: null
                  }],
                  from: [{ table: 'evaluations', as: null }],
                  where: {
                    type: 'binary_expr',
                    operator: '=',
                    left: {
                      type: 'column_ref',
                      table: '',
                      column: 'project_id'
                    },
                    right: {
                      type: 'param',
                      value: 1,
                      // @ts-ignore
                      prefix: '$'
                    }
                  }
                }]
              }
            }
          }]
        }
      };
    } else if (mainTable === 'evaluation_results') {
      // Nested query for evaluation_results
      projectIdCondition = {
        type: 'binary_expr',
        operator: 'IN',
        left: {
          type: 'column_ref',
          table: mainTable,
          column: 'evaluation_id'
        },
        right: {
          type: 'expr_list',
          value: [{
            type: 'select',
            columns: [{
              expr: { type: 'column_ref', table: '', column: 'id' },
              as: null
            }],
            from: [{ table: 'evaluations', as: null }],
            where: {
              type: 'binary_expr',
              operator: '=',
              left: {
                type: 'column_ref',
                table: '',
                column: 'project_id'
              },
              right: {
                type: 'param',
                value: 1,
                // @ts-ignore
                prefix: '$'
              }
            }
          }]
        }
      };
    } else {
      // A fallback condition for tables we don't recognize
      // It's better if this results in an error or empty result, than if
      // we expose data from other projects
      projectIdCondition = {
        type: 'binary_expr',
        operator: '=',
        left: {
          type: 'column_ref',
          table: mainTable,
          column: 'project_id'
        },
        right: {
          type: 'param',
          value: 1, // Using $1 for the parameter
          // @ts-ignore
          prefix: '$'
        }
      };
    }

    // If there's already a WHERE clause, add the condition with AND
    if ((statement as Select).where) {
      (statement as Select).where = {
        type: 'binary_expr',
        operator: 'AND',
        left: (statement as Select).where as Binary,
        right: projectIdCondition as Binary
      };
    } else {
      // Otherwise, create a new WHERE clause
      (statement as Select).where = projectIdCondition;
    }
  }

  /**
   * Find the main table in the statement to add project_id condition
   * @param {AST} statement - SQL statement object
   * @returns {string} - Table name
   */
  private findMainTable(statement: AST): string {
    if ((statement as Select).from
      && Array.isArray((statement as Select).from)
      && ((statement as Select).from as From[]).length > 0
    ) {
      return (((statement as Select).from as From[])[0] as BaseFrom).table;
    }
    return '';
  }
}

/**
 * A wrapper function that validates and executes a safe SQL query
 * @param {string} sqlQuery - The user SQL query
 * @param {string} projectId - The user's project ID
 * @param {typeof db} dbClient - Database client (e.g., pg client)
 * @returns {Promise<any>} - Query result or error
 */
async function executeSafeQuery(
  sqlQuery: string,
  projectId: string,
  dbClient: typeof db,
  logger: Logger = new DefaultLogger()
): Promise<any> {
  const validator = new SQLValidator();
  const result = validator.validateAndTranspile(sqlQuery, projectId);

  if (!result.valid || !result.sql) {
    throw new Error(result.error ?? 'Unknown error');
  }

  try {
    // Execute the query with prepared statement
    const prepared = new PostgresJsPreparedQuery(
      dbClient.$client,
      result.sql,
      result.args.map(arg => arg.value),
      logger,
      undefined,
      false
    );
    const r = await prepared.execute();
    return r;
  } catch (error) {
    throw new Error(`Database error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export {
  SQLValidator,
  executeSafeQuery
};
