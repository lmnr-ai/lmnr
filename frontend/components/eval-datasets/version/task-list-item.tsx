import { cn } from "@/lib/utils";

import { type TaskChange } from "../utils";

const MARKS: Record<TaskChange, { mark: string; className: string }> = {
  added: { mark: "A", className: "text-success-text" },
  removed: { mark: "D", className: "text-destructive-text" },
  changed: { mark: "M", className: "text-primary-text" },
};

interface TaskListItemProps {
  name: string;
  change?: TaskChange;
  selected: boolean;
  onSelect: (name: string) => void;
}

export default function TaskListItem({ name, change, selected, onSelect }: TaskListItemProps) {
  return (
    <li>
      <button
        type="button"
        title={name}
        onClick={() => onSelect(name)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-xs hover:overlay-hover hover:text-foreground-50",
          selected && "overlay-selected font-medium text-foreground-50"
        )}
      >
        <span className={cn("w-3 shrink-0 font-semibold", change && MARKS[change].className)}>
          {change ? MARKS[change].mark : ""}
        </span>
        <span className="truncate">{name}</span>
      </button>
    </li>
  );
}
