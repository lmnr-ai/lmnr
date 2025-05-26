import {
  AST,
  BaseFrom,
  Binary,
  From,
  Select
} from "node-sql-parser";

/**
 * Find the main table in the statement to add project_id condition
 * @param {AST} statement - SQL statement object
 * @returns {string} - Table name
 */
export function findMainTable(statement: AST): string {
  if ((statement as Select).from
    && Array.isArray((statement as Select).from)
    && ((statement as Select).from as From[]).length > 0
  ) {
    return (((statement as Select).from as From[])[0] as BaseFrom).table;
  }
  return '';
}

/**
 * Apply project_id condition to a statement
 * @param {AST} statement - SQL statement object
 */
export function applyProjectIdToStatement(statement: AST) {
  if (statement.type !== 'select') return;

  const mainTable = findMainTable(statement);
  let projectIdCondition: Binary;

  // Create the appropriate condition based on the table
  if (['spans', 'traces', 'evaluations', 'datasets'].includes(mainTable)) {
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
        //@ts-expect-error
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
              prefix: '$'
            }
          }
        }]
      }
    };
  } else if (mainTable === 'dataset_datapoints') {
    // Nested query for dataset_datapoints
    projectIdCondition = {
      type: 'binary_expr',
      operator: 'IN',
      left: {
        type: 'column_ref',
        table: mainTable,
        column: 'dataset_id'
      },
      right: {
        type: 'expr_list',
        value: [{
          type: 'select',
          columns: [{
            expr: { type: 'column_ref', table: '', column: 'id' },
            as: null
          }],
          from: [{ table: 'datasets', as: null }],
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
        //@ts-expect-error
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
