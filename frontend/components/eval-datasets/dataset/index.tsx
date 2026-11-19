"use client";

import { type Row } from "@tanstack/react-table";
import { parseAsString, useQueryStates } from "nuqs";
import { useCallback, useMemo } from "react";
import useSWR from "swr";

import Header from "@/components/ui/header";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { type EvalDataset } from "@/lib/actions/eval-datasets/types";
import { swrFetcher } from "@/lib/api/fetch-api";
import { nameToPath } from "@/lib/evaluation/trial-files";

import { filterRows } from "../filter-rows";
import { defaults, filterFields, RESOURCE } from "./constants";
import { type TaskRow, toTaskRows } from "./rows";
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
  const { data, error, isLoading } = useSWR<EvalDataset>(
    `/api/projects/${projectId}/eval-datasets/${nameToPath(datasetId)}`,
    swrFetcher
  );
  const [open, setOpen] = useQueryStates({ task: parseAsString, hash: parseAsString });
  const { effective, isLoading: isViewLoading, setSearchAndFilters, setFilters } = useTableView();
  const value = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );

  const onOpenVersion = useCallback((task: string, hash: string) => setOpen({ task, hash }), [setOpen]);
  const onRowClick = useCallback(
    (row: Row<TaskRow>) => onOpenVersion(row.original.taskId, row.original.latest.hash),
    [onOpenVersion]
  );
  const onClose = useCallback(() => setOpen({ task: null, hash: null }), [setOpen]);

  const allRows = useMemo(() => toTaskRows(data?.tasks ?? []), [data]);
  const rows = useMemo(() => filterRows(allRows, value, filterFields.task, filterFields), [allRows, value]);
  const suggestions = useMemo(() => new Map([["task", allRows.map((r) => r.taskId)]]), [allRows]);

  const openTask = allRows.find((r) => r.taskId === open.task);

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
            rows={rows}
            isLoading={isLoading || isViewLoading}
            error={error instanceof Error ? error.message : null}
            focusedRowId={openTask?.taskId ?? null}
            onRowClick={onRowClick}
          >
            <TasksTableControls
              projectId={projectId}
              onFiltersChange={setFilters}
              searchValue={value}
              onSearchChange={setSearchAndFilters}
              suggestions={suggestions}
              taskCount={data ? allRows.length : null}
            />
          </TasksTableContents>
        </div>
      </div>
      {openTask && open.hash && (
        <VersionFilesDialog
          projectId={projectId}
          datasetId={datasetId}
          taskId={openTask.taskId}
          hash={open.hash}
          versions={openTask.history}
          onSelectVersion={(hash) => onOpenVersion(openTask.taskId, hash)}
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
