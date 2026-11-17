import { type TaskInfo } from "@/lib/actions/task-sets/types";
import { cn } from "@/lib/utils";

interface TaskListProps {
  tasks: TaskInfo[];
  selected: string;
  onSelect: (name: string) => void;
}

/** The version's tasks by name; the open one is highlighted. */
export default function TaskList({ tasks, selected, onSelect }: TaskListProps) {
  return (
    <div className="h-full overflow-auto py-1">
      {tasks.map((task) => (
        <button
          key={task.id}
          type="button"
          onClick={() => onSelect(task.name)}
          className={cn(
            "block w-full truncate px-3 py-1 text-left font-mono text-xs hover:overlay-hover",
            task.name === selected && "bg-secondary text-foreground"
          )}
          title={task.name}
        >
          {task.name}
        </button>
      ))}
    </div>
  );
}
