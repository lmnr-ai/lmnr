"use client";

import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { useCallback, useMemo } from "react";

import { type Filter, FilterSchemaRelaxed } from "@/lib/actions/common/filters";

import { type AdvancedSearchValue } from "./index";

// URL <-> AdvancedSearchValue adapter for plain (no-views) tables.
// Mirrors today's `mode="url"` behaviour: filters as multi-key JSON strings,
// search as a single string.
export function useAdvancedSearchUrlValue(): {
  value: AdvancedSearchValue;
  onChange: (next: AdvancedSearchValue) => void;
} {
  const [{ filter, search }, setForm] = useQueryStates({
    filter: parseAsArrayOf(parseAsString).withDefault([]).withOptions({ clearOnDefault: true }),
    search: parseAsString.withOptions({ clearOnDefault: true }),
  });

  const filters = useMemo<Filter[]>(
    () =>
      filter.flatMap((raw) => {
        try {
          const parsed = JSON.parse(raw);
          const result = FilterSchemaRelaxed.safeParse(parsed);
          return result.success ? [result.data as Filter] : [];
        } catch {
          return [];
        }
      }),
    [filter]
  );

  const value = useMemo<AdvancedSearchValue>(() => ({ filters, search: search ?? "" }), [filters, search]);

  const onChange = useCallback(
    (next: AdvancedSearchValue) => {
      void setForm({
        filter: next.filters.length > 0 ? next.filters.map((f) => JSON.stringify(f)) : null,
        search: next.search || null,
      });
    },
    [setForm]
  );

  return { value, onChange };
}
