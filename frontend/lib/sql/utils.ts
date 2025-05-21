import { BaseFrom, From, Select, TableExpr } from "node-sql-parser";

export function getFromTableNames(ast: Select): string[] {
  if (ast.from) {
    if (Array.isArray(ast.from)) {
      return ast.from.flatMap((from: From) => {
        if ((from as BaseFrom).table) {
          return [(from as BaseFrom).table];
        } else if ((from as TableExpr).expr) {
          return getFromTableNames((from as TableExpr).expr.ast);
        }
        return [];
      });
    }
  }
  return [];
}
