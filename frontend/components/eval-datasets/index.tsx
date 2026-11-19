"use client";

import { useMemo } from "react";
import useSWR from "swr";

import AdvancedSearch from "@/components/common/advanced-search";
import { useAdvancedSearchUrlValue } from "@/components/common/advanced-search/use-url-value";
import Header from "@/components/ui/header";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { type ColumnFilter } from "@/components/ui/infinite-datatable/ui/datatable-filter/utils";
import { type EvalDatasetSummary } from "@/lib/actions/eval-datasets/types";
import { swrFetcher } from "@/lib/api/fetch-api";

import { filterRows } from "./filter-rows";
import { EvalDatasetsTableContents } from "./table-contents";

interface EvalDatasetsProps {
  projectId: string;
}

const defaults = { columnOrder: ["name", "taskCount", "lastPushedAt"] };

const searchFilters: ColumnFilter[] = [
  { name: "Name", key: "name", dataType: "string" },
  { name: "Tasks", key: "taskCount", dataType: "number" },
];

const filterFields = {
  name: (d: EvalDatasetSummary) => d.id,
  taskCount: (d: EvalDatasetSummary) => d.taskCount,
};

const EMPTY: EvalDatasetSummary[] = [];

function EvalDatasetsContent({ projectId }: EvalDatasetsProps) {
  const { data, error, isLoading } = useSWR<EvalDatasetSummary[]>(
    `/api/projects/${projectId}/eval-datasets`,
    swrFetcher
  );
  const datasets = data ?? EMPTY;
  const { value, onChange } = useAdvancedSearchUrlValue();
  const shown = useMemo(() => filterRows(datasets, value, filterFields.name, filterFields), [datasets, value]);
  const suggestions = useMemo(() => new Map([["name", datasets.map((d) => d.id)]]), [datasets]);
  const isSearching = value.filters.length > 0 || value.search.length > 0;

  return (
    <>
      <Header path="eval datasets" />
      <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
        <div className="flex flex-1 overflow-hidden">
          <EvalDatasetsTableContents
            projectId={projectId}
            datasets={shown}
            isLoading={isLoading}
            error={error instanceof Error ? error.message : null}
            isSearching={isSearching}
          >
            <div className="w-full pt-1">
              <AdvancedSearch
                value={value}
                onChange={onChange}
                filters={searchFilters}
                options={{ suggestions }}
                placeholder="Search datasets by name..."
                className="w-full flex-1"
              />
            </div>
          </EvalDatasetsTableContents>
        </div>
      </div>
    </>
  );
}

/** The project's eval datasets (`lmnr-cli eval dataset push`). */
export default function EvalDatasets(props: EvalDatasetsProps) {
  return (
    <InfiniteDataTableProvider defaults={defaults}>
      <EvalDatasetsContent {...props} />
    </InfiniteDataTableProvider>
  );
}
