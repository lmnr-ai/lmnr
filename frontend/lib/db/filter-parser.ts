import { eq, gt, gte, ilike, lt, lte, SQL } from "drizzle-orm";

import { FilterDef } from "@/lib/db/modifiers";

type ColumnType = "string" | "number" | "boolean" | "custom";

type ColumnConfig<T = any> = {
  column: T;
  type: ColumnType;
  handler?: (filter: FilterDef) => SQL<unknown> | null;
};

type FilterConfig<T extends Record<string, any>> = {
  [K in keyof T]: ColumnConfig<T[K]>;
};

export function parseFilters<T extends Record<string, any>>(
  filters: any[],
  config: FilterConfig<T>
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  filters.forEach((filterItem) => {
    try {
      const f: FilterDef = typeof filterItem === "string" ? JSON.parse(filterItem) : filterItem;
      const { column, operator, value } = f;

      if (!column || !operator || value === undefined) {
        return;
      }

      const columnConfig = config[column as keyof T];
      if (!columnConfig) {
        return;
      }

      const { column: drizzleColumn, type, handler } = columnConfig;
      const operatorStr = operator as string;

      if (type === "custom" && handler) {
        const condition = handler(f);
        if (condition) {
          conditions.push(condition);
        }
      } else if (type === "string") {
        if (operator === "eq") {
          conditions.push(eq(drizzleColumn, value));
        } else if (operatorStr === "contains") {
          conditions.push(ilike(drizzleColumn, `%${value}%`));
        }
      } else if (type === "number") {
        const numValue = Number(value);
        if (operator === "eq") {
          conditions.push(eq(drizzleColumn, numValue));
        } else if (operator === "gt") {
          conditions.push(gt(drizzleColumn, numValue));
        } else if (operator === "gte") {
          conditions.push(gte(drizzleColumn, numValue));
        } else if (operator === "lt") {
          conditions.push(lt(drizzleColumn, numValue));
        } else if (operator === "lte") {
          conditions.push(lte(drizzleColumn, numValue));
        }
      } else if (type === "boolean") {
        const boolValue = value === "true" || value === true;
        if (operator === "eq") {
          conditions.push(eq(drizzleColumn, boolValue));
        }
      }
    } catch (error) {}
  });

  return conditions;
}