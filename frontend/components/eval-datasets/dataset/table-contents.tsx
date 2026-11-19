"use client";

import { type Row } from "@tanstack/react-table";
import { memo, type PropsWithChildren } from "react";

import { InfiniteDataTable } from "@/components/ui/infinite-datatable";

import MessageRow from "../message-row";
import { taskColumns } from "./columns";
import { type TaskRow } from "./rows";

const noop = () => {};
const getRowId = (row: TaskRow) => row.taskId;

const NoMatchesRow = <MessageRow>No tasks match your search.</MessageRow>;

interface TasksTableContentsProps {
  rows: TaskRow[];
  isLoading: boolean;
  error: string | null;
  focusedRowId: string | null;
  onRowClick: (row: Row<TaskRow>) => void;
}

export const TasksTableContents = memo(function TasksTableContents({
  children,
  rows,
  isLoading,
  error,
  focusedRowId,
  onRowClick,
}: PropsWithChildren<TasksTableContentsProps>) {
  return (
    <InfiniteDataTable<TaskRow>
      className="w-full"
      columns={taskColumns}
      data={rows}
      getRowId={getRowId}
      focusedRowId={focusedRowId}
      onRowClick={onRowClick}
      hasMore={false}
      isFetching={false}
      isLoading={isLoading}
      fetchNextPage={noop}
      emptyRow={error ? <MessageRow>{error}</MessageRow> : NoMatchesRow}
    >
      {children}
    </InfiniteDataTable>
  );
});
