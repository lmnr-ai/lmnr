"use client";

import { memo } from "react";

import { Filter } from "@/lib/actions/common/filters";

import { FilterSearchProvider } from "../context";
import FilterSearchInput from "../filters/filter-search-input";
import { ColumnFilter } from "../types";

interface UrlSyncedProviderProps {
  filters: ColumnFilter[];
  resource?: "traces" | "spans";
  placeholder?: string;
  className?: string;
  onSubmit?: (filters: Filter[], search: string) => void;
}

const UrlSyncedProvider = ({
  filters,
  resource = "traces",
  placeholder = "Search...",
  className,
  onSubmit,
}: UrlSyncedProviderProps) => (
  <FilterSearchProvider filters={filters} mode="url" onSubmit={onSubmit}>
    <FilterSearchInput placeholder={placeholder} className={className} resource={resource} />
  </FilterSearchProvider>
);

UrlSyncedProvider.displayName = "UrlSyncedProvider";

export default memo(UrlSyncedProvider);
