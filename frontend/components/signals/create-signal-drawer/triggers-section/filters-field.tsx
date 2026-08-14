"use client";

import { isEqual } from "lodash";
import { useCallback, useMemo } from "react";
import { useFormContext } from "react-hook-form";

import AdvancedSearch, { type AdvancedSearchValue } from "@/components/common/advanced-search";
import { SIGNAL_FILTER_COLUMNS } from "@/components/signals/trigger-filter-field";
import { type Filter } from "@/lib/actions/common/filters";

import { type ManageSignalForm } from "../types";
import { TRIGGER_INDEX } from "./constants";

/** Mirrors `createTagFromFilter`'s value coercion so the two sides compare. */
const normalize = (filters: Filter[]) =>
  filters.map((f) => ({
    column: f.column,
    operator: f.operator,
    value: Array.isArray(f.value) ? f.value.map(String) : String(f.value),
  }));

/**
 * Filters reuse the search bar from the traces/spans tables so the mental model
 * carries over: the same tags the user builds to find traces are the ones that
 * decide which traces this signal runs on. Free text is off — the backend
 * evaluates structured filters only (`filters_pass` in `evaluate.rs`).
 */
export default function FiltersField() {
  const { watch, setValue } = useFormContext<ManageSignalForm>();
  const filters = watch(`triggers.${TRIGGER_INDEX}.filters`);

  // Memoized because AdvancedSearch reflows its editor state whenever `value`
  // changes identity, so a fresh object per render would fight the user's typing.
  const value = useMemo<AdvancedSearchValue>(() => ({ filters: filters ?? [], search: "" }), [filters]);

  const handleChange = useCallback(
    (next: AdvancedSearchValue) => {
      // AdvancedSearch stringifies every non-array value on the way into its
      // editor, so a blur that commits an untouched default (`value: 1000`)
      // hands back `"1000"` — a real edit only if the values differ once both
      // sides are stringified. Without this, focusing and leaving the bar would
      // dirty the form and rewrite numeric filters as strings.
      if (isEqual(normalize(filters ?? []), normalize(next.filters as Filter[]))) return;
      setValue(`triggers.${TRIGGER_INDEX}.filters`, next.filters as Filter[], {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [filters, setValue]
  );

  return (
    <AdvancedSearch
      value={value}
      onChange={handleChange}
      filters={SIGNAL_FILTER_COLUMNS}
      allowFreeTextSearch={false}
      placeholder="Add a filter, e.g. total tokens > 1000"
      className="w-full"
      options={{ disableHotKey: true }}
    />
  );
}
