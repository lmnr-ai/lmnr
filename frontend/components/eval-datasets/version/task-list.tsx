import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { type EvalDatasetTask } from "@/lib/actions/eval-datasets/types";

import { type TaskChange, type TaskDiff } from "../utils";
import TaskListItem from "./task-list-item";

/** Rendering every name of a huge version would stall the page; search narrows it down. */
const MAX_SHOWN = 500;

interface TaskListProps {
  tasks: EvalDatasetTask[];
  /** Set when comparing: only the tasks that differ are listed. */
  diff: TaskDiff | null;
  compareVersion: number | null;
  selected: string | null;
  onSelect: (name: string) => void;
}

/** The version's tasks, or the ones that differ from the compared version. */
export default function TaskList({ tasks, diff, compareVersion, selected, onSelect }: TaskListProps) {
  const [search, setSearch] = useState("");

  const entries = useMemo((): { name: string; change?: TaskChange }[] => {
    if (!diff) return tasks.map((task) => ({ name: task.name }));
    return (["changed", "added", "removed"] as const).flatMap((change) =>
      diff[change].map((name) => ({ name, change }))
    );
  }, [tasks, diff]);
  const matching = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? entries.filter((entry) => entry.name.toLowerCase().includes(query)) : entries;
  }, [entries, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-none border-b p-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tasks…"
          className="h-7 text-xs"
        />
      </div>
      {diff && (
        <p className="flex-none border-b px-3 py-1.5 text-xs text-muted-foreground">
          vs v{compareVersion}: {diff.changed.length} changed, {diff.added.length} added, {diff.removed.length} removed,{" "}
          {diff.unchanged} unchanged
        </p>
      )}
      <ul className="flex min-h-0 flex-1 flex-col overflow-auto p-1">
        {matching.slice(0, MAX_SHOWN).map((entry) => (
          <TaskListItem
            key={entry.name}
            name={entry.name}
            change={entry.change}
            selected={entry.name === selected}
            onSelect={onSelect}
          />
        ))}
        {matching.length === 0 && (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            {entries.length === 0 ? (diff ? "No task differs." : "This version has no tasks.") : "No task matches."}
          </li>
        )}
        {matching.length > MAX_SHOWN && (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            {matching.length - MAX_SHOWN} more; search to narrow the list.
          </li>
        )}
      </ul>
    </div>
  );
}
