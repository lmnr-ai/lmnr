import { BaseFrom, From, Select, TableExpr } from "node-sql-parser";

import { FromTable } from "./types";

export function getFromTableNames(ast: Select): FromTable[] {
  if (ast.from) {
    if (Array.isArray(ast.from)) {
      return ast.from.flatMap((from: From) => {
        if ((from as BaseFrom).table) {
          return [{
            table: (from as BaseFrom).table,
            as: (from as BaseFrom).as ?? (from as BaseFrom).table,
          }];
        } else if ((from as TableExpr).expr) {
          return getFromTableNames((from as TableExpr).expr.ast);
        }
        return [];
      });
    }
  }
  return [];
}
