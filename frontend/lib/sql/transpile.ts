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

import { Logger, NoopLogger } from "drizzle-orm";
import { PostgresJsPreparedQuery } from "drizzle-orm/postgres-js";
import {
  AST,
  Binary,
  Column,
  ColumnRef,
  ExpressionValue,
  Function as NodeSqlFunction,
  OrderBy,
  Parser,
  Select,
  TableExpr,
} from "node-sql-parser";

import { db } from "@/lib/db/drizzle";

import { getExpressionASTs } from "./expression";
import {
  applyAutoJoinRules,
  qualifyColumnReferences,
} from "./join";
import { applyProjectIdToStatement, findMainTable } from "./project-id-filter";
import { replaceJsonbFields } from "./replace";
import { ALLOWED_TABLES, Arg, TranspiledQuery } from "./types";
import { getFromTableNames } from "./utils";
import { AGG_SCORE_CTE_WITH, WITH_AGG_SCORES_CTE_NAME } from "./with";

const ALLOWED_INTERNAL_CTES = [WITH_AGG_SCORES_CTE_NAME];

class SQLValidator {
  private parser: Parser;
  private allowedTables: Set<string>;

  constructor(allowedTables: Set<string> = ALLOWED_TABLES) {
    this.parser = new Parser();
    this.allowedTables = allowedTables;
  }

  /**
   * Validates and transpiles a user SQL query to a safe SQL query
   * @param {string} sqlQuery - The user's SQL query
   * @param {string} projectId - The user's project ID
   * @returns {TranspiledQuery} - the result of transpilation
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

      const allowedTables = [`(select)::(.*)::(${Array.from(this.allowedTables).concat(ALLOWED_INTERNAL_CTES).join('|')})`];
      try {
        this.parser.whiteListCheck(sqlQuery,
          allowedTables,
          {
            database: 'Postgresql',
            type: 'table',
          }
        );
      } catch (error) {
        // This error is worded with good explanation, but exposes too much
        // information to the user, so throw a generic error instead
        return {
          valid: false,
          sql: null,
          args: [],
          error: 'Access denied. Only SELECT queries on tables ' +
            `${Array.from(this.allowedTables).map(table => `'${table}'`).join(', ')}` +
            ' are allowed.'
        };
      }

      console.log('ast', JSON.stringify(ast, null, 2));

      // Transpile the query
      const transpiled = this.transpileQuery(ast, projectId);

      console.log('transpiled', transpiled.sql);
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

      statement.with = [...(statement.with ?? []), ...AGG_SCORE_CTE_WITH];

      this.processSubqueries(statement, new Set());
    }

    // Convert AST back to SQL
    const sql = this.parser.sqlify(ast, {
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

      if (node.with) {
        for (const withItem of node.with) {
          this.processSubqueries(withItem.stmt.ast, newProcessedNodes);
        }
      }

      const fromTables: string[] = getFromTableNames(node);

      // Process auto-joins based on rules
      applyAutoJoinRules(node as Select, fromTables);

      // After joins are added, qualify column references

      node.columns.forEach((column: Column) => {
        const aliases: string[] = [];
        column.expr = qualifyColumnReferences(column.expr, fromTables);
        column.expr = replaceJsonbFields(column.expr, fromTables, aliases);
        column.as = aliases[0] ?? column.as ?? null;
      });

      if (node.groupby?.columns) {
        node.groupby.columns = node.groupby.columns.map((column: ColumnRef) =>
          replaceJsonbFields(column, fromTables, []) as ExpressionValue as ColumnRef
        );
      }

      if (node.orderby) {
        node.orderby = node.orderby.map((order: OrderBy) => ({
          ...order,
          expr: replaceJsonbFields(order.expr, fromTables, []) as ExpressionValue,
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
          const leftASTs = getExpressionASTs((node.where as Binary).left);
          const rightASTs = getExpressionASTs((node.where as Binary).right);
          for (const leftAST of leftASTs) {
            this.processSubqueries(leftAST, newProcessedNodes);
          }
          for (const rightAST of rightASTs) {
            this.processSubqueries(rightAST, newProcessedNodes);
          }
          node.where = {
            ...node.where,
            left: replaceJsonbFields(node.where.left, fromTables, []) as ExpressionValue,
            right: replaceJsonbFields(node.where.right, fromTables, []) as ExpressionValue,
          };
        } else if (node.where.type === 'function') {
          const args = (node.where as NodeSqlFunction).args;
          if (args) {
            const argASTs = getExpressionASTs(args);
            for (const argAST of argASTs) {
              this.processSubqueries(argAST, newProcessedNodes);
            }
            node.where = {
              ...node.where,
              args: {
                ...args,
                value: args.value.map(item => replaceJsonbFields(item, fromTables, []) as ExpressionValue),
              },
            };
          }
        }
      }

      // Now apply the project_id condition to this select statement
      const mainTable = findMainTable(node);
      if (this.allowedTables.has(mainTable)) {
        applyProjectIdToStatement(node);
      }
      return node;
    } else if (node as unknown as TableExpr) {
      return this.processSubqueries((node as unknown as TableExpr).expr.ast, processedNodes);
    } else {
      throw new Error('Only select queries are supported');
    }
  }
}

/**
 * A wrapper function that validates and executes a safe SQL query
 * @param {string} sqlQuery - The user SQL query
 * @param {string} projectId - The user's project ID
 * @param {typeof db} dbClient - Database client (e.g., pg client)
 * @returns {Promise<Record<string, any>[]>} - Query result or error
 */
async function executeSafeQuery(
  sqlQuery: string,
  projectId: string,
  logger: Logger = new NoopLogger()
): Promise<Record<string, any>[]> {
  const validator = new SQLValidator();
  const result = validator.validateAndTranspile(sqlQuery, projectId);

  if (!result.valid || !result.sql) {
    throw new Error(result.error ?? 'Unknown error');
  }

  try {
    // Execute the query with prepared statement
    const prepared = new PostgresJsPreparedQuery(
      db.$client,
      result.sql,
      result.args.map(arg => arg.value),
      logger,
      undefined,
      false
    );
    const r = await prepared.execute();
    return r as Record<string, any>[];
  } catch (error) {
    throw new Error(`Database error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export {
  executeSafeQuery,
  SQLValidator
};
