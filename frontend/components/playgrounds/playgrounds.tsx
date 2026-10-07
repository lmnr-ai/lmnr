"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import { playgroundsColumnLabels, PlaygroundsTableContents } from "@/components/playgrounds/table-contents";
import { PlaygroundsTableControls } from "@/components/playgrounds/table-controls";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { track } from "@/lib/posthog";

import Header from "../ui/header";
import { RESOURCE } from "./constants";
import CreatePlaygroundDialog from "./create-playground-dialog";

export const defaultPlaygroundsColumnOrder = ["__row_selection", "id", "name", "createdAt"];

function PlaygroundsContent() {
  const { projectId } = useParams();

  useEffect(() => {
    track("playgrounds", "page_viewed");
  }, []);

  const { effective, isLoading: isViewLoading, setSearchAndFilters, setFilters } = useTableView();
  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );
  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const search = effective.search.length > 0 ? effective.search : null;

  return (
    <>
      <Header path="playgrounds" />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 overflow-hidden">
        <CreatePlaygroundDialog />
        <div className="flex flex-1 overflow-hidden">
          <PlaygroundsTableContents filter={filter} search={search} isViewLoading={isViewLoading}>
            <PlaygroundsTableControls
              projectId={String(projectId)}
              filters={effective.filters}
              onFiltersChange={setFilters}
              searchValue={searchValue}
              onSearchChange={setSearchAndFilters}
              columnLabels={playgroundsColumnLabels}
            />
          </PlaygroundsTableContents>
        </div>
      </div>
    </>
  );
}

export default function Playgrounds() {
  const { projectId } = useParams();
  return (
    <InfiniteDataTableProvider
      defaults={{ columnOrder: defaultPlaygroundsColumnOrder }}
      lockedColumns={["__row_selection"]}
      views={{ projectId: String(projectId), resource: RESOURCE }}
    >
      <PlaygroundsContent />
    </InfiniteDataTableProvider>
  );
}
