"use client";

import { memo } from "react";

import { Filter } from "@/lib/actions/common/filters";

import { FilterSearchProvider, StatefulFilterProvider } from "../context";
import FilterSearchInput from "../filters/filter-search-input";
import { ColumnFilter } from "../types";

interface StatefulProviderProps {
  filters: ColumnFilter[];
  initialFilters?: Filter[];
  resource?: "traces" | "spans";
  placeholder?: string;
  className?: string;
  onSubmit?: (filters: Filter[], search: string) => void;
}

const StatefulProvider = ({
  filters,
  initialFilters = [],
  resource = "traces",
  placeholder = "Search...",
  className,
  onSubmit,
}: StatefulProviderProps) => (
  <StatefulFilterProvider initialFilters={initialFilters}>
    <FilterSearchProvider filters={filters} mode="stateful" onSubmit={onSubmit}>
      <FilterSearchInput placeholder={placeholder} className={className} resource={resource} />
    </FilterSearchProvider>
  </StatefulFilterProvider>
);

StatefulProvider.displayName = "StatefulProvider";

export default memo(StatefulProvider);
