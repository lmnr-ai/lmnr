"use client";

import { QueryStructure } from "@/lib/actions/sql/types";

export const getDefaultFormValues = (): QueryStructure => ({
  table: "spans",
  metrics: [{ fn: "count", column: "*", alias: "count", args: [] }],
  dimensions: [],
  filters: [],
  orderBy: [],
  limit: undefined,
  timeRange: undefined,
});
