"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { queuesColumnLabels, QueuesTableContents } from "@/components/queues/table-contents";
import { QueuesTableControls } from "@/components/queues/table-controls";
import { Button } from "@/components/ui/button";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { track } from "@/lib/posthog";

import Header from "../ui/header";
import { RESOURCE } from "./constants";
import CreateQueueDialog from "./create-queue-dialog";

export const defaultQueuesColumnOrder = ["__row_selection", "id", "name", "progress", "createdAt"];

function QueuesContent() {
  const { projectId } = useParams();
  const router = useRouter();

  useEffect(() => {
    track("labeling_queues", "page_viewed");
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
      <Header path="labeling queues" />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 overflow-hidden">
        <CreateQueueDialog onSuccess={(queue) => router.push(`/project/${projectId}/labeling-queues/${queue.id}`)}>
          <Button icon="plus" className="w-fit">
            Queue
          </Button>
        </CreateQueueDialog>
        <div className="flex flex-1 overflow-hidden">
          <QueuesTableContents filter={filter} search={search} isViewLoading={isViewLoading}>
            <QueuesTableControls
              projectId={String(projectId)}
              filters={effective.filters}
              onFiltersChange={setFilters}
              searchValue={searchValue}
              onSearchChange={setSearchAndFilters}
              columnLabels={queuesColumnLabels}
            />
          </QueuesTableContents>
        </div>
      </div>
    </>
  );
}

export default function Queues() {
  const { projectId } = useParams();
  return (
    <InfiniteDataTableProvider
      defaults={{ columnOrder: defaultQueuesColumnOrder }}
      lockedColumns={["__row_selection"]}
      views={{ projectId: String(projectId), resource: RESOURCE }}
    >
      <QueuesContent />
    </InfiniteDataTableProvider>
  );
}
