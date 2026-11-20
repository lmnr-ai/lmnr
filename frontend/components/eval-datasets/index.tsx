"use client";

import Header from "@/components/ui/header";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";

import { defaults, RESOURCE } from "./constants";
import LegacyDatasetsBanner from "./legacy-banner";
import { useListQuery } from "./list-query";
import { EvalDatasetsTableContents } from "./table-contents";
import { EvalDatasetsTableControls } from "./table-controls";

interface EvalDatasetsProps {
  projectId: string;
}

function EvalDatasetsContent({ projectId }: EvalDatasetsProps) {
  const { value, filter, search, isSearching, isViewLoading, setSearchAndFilters, setFilters } = useListQuery();

  return (
    <>
      <Header path="datasets" />
      <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
        <LegacyDatasetsBanner projectId={projectId} />
        <div className="flex flex-1 overflow-hidden">
          <EvalDatasetsTableContents
            projectId={projectId}
            filter={filter}
            search={search}
            isViewLoading={isViewLoading}
            isSearching={isSearching}
          >
            <EvalDatasetsTableControls
              projectId={projectId}
              onFiltersChange={setFilters}
              searchValue={value}
              onSearchChange={setSearchAndFilters}
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
