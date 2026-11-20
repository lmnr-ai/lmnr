"use client";

import { type Row } from "@tanstack/react-table";
import { parseAsString, useQueryStates } from "nuqs";
import { useCallback } from "react";
import useSWR from "swr";

import Header from "@/components/ui/header";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { type EvalDataset, type EvalTaskSummary } from "@/lib/actions/eval-datasets/types";
import { swrFetcher } from "@/lib/api/fetch-api";
import { nameToPath } from "@/lib/evaluation/trial-files";

import { useListQuery } from "../list-query";
import { defaults, RESOURCE } from "./constants";
import { TasksTableContents } from "./table-contents";
import { TasksTableControls } from "./table-controls";
import VersionFilesDialog from "./version-files-dialog";

interface EvalDatasetViewProps {
  projectId: string;
  datasetId: string;
}

/**
 * One eval dataset: a row per task at its latest version. A row opens the files
 * dialog, which also browses the task's older versions; the open one is `?task=&hash=`.
 */
function EvalDatasetContent({ projectId, datasetId }: EvalDatasetViewProps) {
  const { data: dataset, error } = useSWR<EvalDataset>(
    `/api/projects/${projectId}/eval-datasets/${nameToPath(datasetId)}`,
    swrFetcher
  );
  const [open, setOpen] = useQueryStates({ task: parseAsString, hash: parseAsString });
  const { value, filter, search, isViewLoading, setSearchAndFilters, setFilters } = useListQuery();

  const onOpenVersion = useCallback((task: string, hash: string) => setOpen({ task, hash }), [setOpen]);
  const onRowClick = useCallback(
    (row: Row<EvalTaskSummary>) => onOpenVersion(row.original.id, row.original.latest.hash),
    [onOpenVersion]
  );
  const onClose = useCallback(() => setOpen({ task: null, hash: null }), [setOpen]);

  return (
    <>
      <Header
        path={[
          { name: "datasets", href: `/project/${projectId}/eval-datasets` },
          { name: datasetId, copyValue: datasetId, className: "min-w-0" },
        ]}
      />
      <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
        <div className="flex flex-1 overflow-hidden">
          <TasksTableContents
            projectId={projectId}
            datasetId={datasetId}
            filter={filter}
            search={search}
            isViewLoading={isViewLoading}
            datasetError={error instanceof Error ? error.message : null}
            focusedRowId={open.task}
            onRowClick={onRowClick}
          >
            <TasksTableControls
              projectId={projectId}
              onFiltersChange={setFilters}
              searchValue={value}
              onSearchChange={setSearchAndFilters}
              taskCount={dataset?.taskCount ?? null}
            />
          </TasksTableContents>
        </div>
      </div>
      {open.task && open.hash && (
        <VersionFilesDialog
          projectId={projectId}
          datasetId={datasetId}
          taskId={open.task}
          hash={open.hash}
          onSelectVersion={(hash) => open.task && onOpenVersion(open.task, hash)}
          onClose={onClose}
        />
      )}
    </>
  );
}

export default function EvalDatasetView(props: EvalDatasetViewProps) {
  return (
    <InfiniteDataTableProvider defaults={defaults} views={{ projectId: props.projectId, resource: RESOURCE }}>
      <EvalDatasetContent {...props} />
    </InfiniteDataTableProvider>
  );
}
