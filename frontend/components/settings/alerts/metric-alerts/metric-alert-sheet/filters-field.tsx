"use client";

import { isEqual } from "lodash";
import { useCallback, useMemo } from "react";
import { useFormContext } from "react-hook-form";

import AdvancedSearch, { type AdvancedSearchValue } from "@/components/common/advanced-search";
import { filters as traceFilters } from "@/components/traces/traces-table/columns";
import { type Filter } from "@/lib/actions/common/filters";

import { type MetricAlertFormValues } from "./types";

// A rule watches many traces, so picking one by id is not offered.
const RULE_FILTERS = traceFilters.filter((filter) => filter.key !== "id");

/** Mirrors the search bar's own value coercion so the two sides compare. */
const normalize = (filters: Filter[]) =>
  filters.map((f) => ({
    column: f.column,
    operator: f.operator,
    value: Array.isArray(f.value) ? f.value.map(String) : String(f.value),
  }));

/** The search bar of the traces table, so a rule is narrowed the same way traces are found. */
export default function FiltersField() {
  const { watch, setValue } = useFormContext<MetricAlertFormValues>();
  const filters = watch("filters");

  // Memoized because AdvancedSearch reflows its editor state whenever `value` changes identity.
  const value = useMemo<AdvancedSearchValue>(() => ({ filters, search: "" }), [filters]);

  const handleChange = useCallback(
    (next: AdvancedSearchValue) => {
      // A blur hands back stringified values; that alone is not an edit.
      if (isEqual(normalize(filters), normalize(next.filters as Filter[]))) return;
      setValue("filters", next.filters as Filter[], { shouldDirty: true });
      // One state per model needs the per-model rollup, which holds no trace fields.
      if (next.filters.length > 0) setValue("splitByModel", false);
    },
    [filters, setValue]
  );

  return (
    <AdvancedSearch
      value={value}
      onChange={handleChange}
      filters={RULE_FILTERS}
      allowFreeTextSearch={false}
      placeholder="All traces. Add a filter, e.g. tags include …"
      className="w-full"
      options={{ disableHotKey: true }}
    />
  );
}
