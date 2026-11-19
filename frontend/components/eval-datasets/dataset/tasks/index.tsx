"use client";

import { useState } from "react";

import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";

import { FETCH_SIZE } from "../../constants";
import { TASKS_COLUMN_ORDER } from "./columns";
import { TasksTableContents } from "./table-contents";
import TasksTableControls from "./table-controls";

interface DatasetTasksProps {
  projectId: string;
  dataset: string;
  selected: string | null;
  onSelect: (task: string) => void;
}

/** The dataset's tasks at their latest version; a click selects one (`?task=`). */
export default function DatasetTasks({ projectId, dataset, selected, onSelect }: DatasetTasksProps) {
  const [search, setSearch] = useState("");

  return (
    <div className="flex flex-1 overflow-hidden p-2">
      <InfiniteDataTableProvider defaults={{ columnOrder: TASKS_COLUMN_ORDER }} pageSize={FETCH_SIZE} uniqueKey="name">
        <TasksTableContents
          projectId={projectId}
          dataset={dataset}
          search={search}
          selected={selected}
          onSelect={onSelect}
        >
          <TasksTableControls onSearchChange={setSearch} />
        </TasksTableContents>
      </InfiniteDataTableProvider>
    </div>
  );
}
