import {
  AggrFunc,
  AST,
  Binary,
  Case,
  Cast,
  ExpressionValue,
  ExprList,
  Function as NodeSqlFunction,
  TableColumnAst} from "node-sql-parser";

/**
 * Extract AST nodes from an expression
 * @param {ExpressionValue | ExprList} expression - The expression to extract ASTs from
 * @returns {AST[]} - Array of AST nodes
 */
export function getExpressionASTs(expression: ExpressionValue | ExprList): AST[] {
  if (expression.type === 'expr_list' && Array.isArray(expression.value)) {
    return (expression.value as ExpressionValue[]).flatMap(item => getExpressionASTs(item));
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
      return getExpressionASTs(args);
    }
  }

  if (expression.type === 'case') {
    const args = (expression as unknown as Case).args;
    if (args) {
      return args.flatMap(arg => {
        if (arg.type === 'when') {
          return [...getExpressionASTs(arg.cond), ...getExpressionASTs(arg.result)];
        }
        if (arg.type === 'else') {
          return getExpressionASTs(arg.result);
        }
        return [];
      });
    }
  }
  }

  if (expression.type === 'binary_expr') {
    const binaryExpression = expression as unknown as Binary;
    return [
      ...getExpressionASTs(binaryExpression.left),
      ...getExpressionASTs(binaryExpression.right)
    ];
  }

  if (expression.type === 'aggr_func') {
    const aggrFunc = expression as unknown as AggrFunc;
    return getExpressionASTs(aggrFunc.args.expr);
  }

  if (expression.type === 'cast') {
    const cast = expression as unknown as Cast;
    return getExpressionASTs(cast.expr);
  }

  return [];
}
