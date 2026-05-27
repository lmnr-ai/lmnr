"use client";

import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { useCallback, useMemo } from "react";

import { type Filter, FilterSchemaRelaxed } from "@/lib/actions/common/filters";

export function useFilterUrlValue(disabled: boolean): {
  filters: Filter[];
  setFilters: (next: Filter[]) => void;
} {
  const [{ filter }, setForm] = useQueryStates({
    filter: parseAsArrayOf(parseAsString).withDefault([]).withOptions({ clearOnDefault: true }),
  });

  const filters = useMemo<Filter[]>(() => {
    if (disabled) return [];
    return filter.flatMap((raw) => {
      try {
        const parsed = JSON.parse(raw);
        const result = FilterSchemaRelaxed.safeParse(parsed);
        return result.success ? [result.data as Filter] : [];
      } catch {
        return [];
      }
    });
  }, [filter, disabled]);

  const setFilters = useCallback(
    (next: Filter[]) => {
      if (disabled) return;
      void setForm({ filter: next.length > 0 ? next.map((f) => JSON.stringify(f)) : null });
    },
    [setForm, disabled]
  );

  return { filters, setFilters };
}
