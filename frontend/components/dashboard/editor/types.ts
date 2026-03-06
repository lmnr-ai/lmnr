"use client";

import { type QueryStructure } from "@/lib/actions/sql/types";

export const getDefaultFormValues = (): QueryStructure => ({
  table: "spans",
  metrics: [{ fn: "count", column: "*", args: [] }],
  dimensions: [],
  filters: [],
  orderBy: [],
  limit: undefined,
  timeRange: undefined,
});
