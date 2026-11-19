"use client";

import { useMemo } from "react";
import useSWR from "swr";

import Header from "@/components/ui/header";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { type EvalDatasetSummary } from "@/lib/actions/eval-datasets/types";
import { swrFetcher } from "@/lib/api/fetch-api";

import { defaults, filterFields, RESOURCE } from "./constants";
import { filterRows } from "./filter-rows";
import LegacyDatasetsBanner from "./legacy-banner";
import { EvalDatasetsTableContents } from "./table-contents";
import { EvalDatasetsTableControls } from "./table-controls";

interface EvalDatasetsProps {
  projectId: string;
}

const EMPTY: EvalDatasetSummary[] = [];

function EvalDatasetsContent({ projectId }: EvalDatasetsProps) {
  const { data, error, isLoading } = useSWR<EvalDatasetSummary[]>(
    `/api/projects/${projectId}/eval-datasets`,
    swrFetcher
  );
  const datasets = data ?? EMPTY;
  const { effective, isLoading: isViewLoading, setSearchAndFilters, setFilters } = useTableView();
  const value = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );
  const shown = useMemo(() => filterRows(datasets, value, filterFields.name, filterFields), [datasets, value]);
  const suggestions = useMemo(() => new Map([["name", datasets.map((d) => d.id)]]), [datasets]);
  const isSearching = value.filters.length > 0 || value.search.length > 0;

  return (
    <>
      <Header path="datasets" />
      <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
        <LegacyDatasetsBanner projectId={projectId} />
        <div className="flex flex-1 overflow-hidden">
          <EvalDatasetsTableContents
            projectId={projectId}
            datasets={shown}
            isLoading={isLoading || isViewLoading}
            error={error instanceof Error ? error.message : null}
            isSearching={isSearching}
          >
            <EvalDatasetsTableControls
              projectId={projectId}
              onFiltersChange={setFilters}
              searchValue={value}
              onSearchChange={setSearchAndFilters}
              suggestions={suggestions}
            />
          </EvalDatasetsTableContents>
        </div>
      </div>
    </>
  );
}

/** The project's eval datasets (`lmnr-cli eval dataset push`). */
export default function EvalDatasets(props: EvalDatasetsProps) {
  return (
    <InfiniteDataTableProvider defaults={defaults} views={{ projectId: props.projectId, resource: RESOURCE }}>
      <EvalDatasetsContent {...props} />
    </InfiniteDataTableProvider>
  );
}
