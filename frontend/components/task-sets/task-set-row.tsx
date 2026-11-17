import Link from "next/link";

import { TableCell, TableRow } from "@/components/ui/table";
import { type TaskSetSummary } from "@/lib/actions/task-sets/types";
import { formatTimestamp } from "@/lib/utils";

import DeleteButton from "./delete-button";
import { versionLabel } from "./utils";

interface TaskSetRowProps {
  projectId: string;
  taskSet: TaskSetSummary;
  onDeleted: () => void;
}

export default function TaskSetRow({ projectId, taskSet, onDeleted }: TaskSetRowProps) {
  return (
    <TableRow>
      <TableCell>
        <Link href={`/project/${projectId}/task-sets/${taskSet.id}`} className="font-medium hover:underline">
          {taskSet.name}
        </Link>
      </TableCell>
      <TableCell className="text-secondary-foreground">
        {taskSet.head ? versionLabel(taskSet.head.number) : "—"}
      </TableCell>
      <TableCell className="text-secondary-foreground">{taskSet.taskCount}</TableCell>
      <TableCell className="text-secondary-foreground">
        {taskSet.lastRunAt ? formatTimestamp(taskSet.lastRunAt) : "—"}
      </TableCell>
      <TableCell className="text-secondary-foreground">
        {formatTimestamp(taskSet.head?.createdAt ?? taskSet.createdAt)}
      </TableCell>
      <TableCell>
        <DeleteButton
          url={`/api/projects/${projectId}/task-sets/${taskSet.id}`}
          title={`Delete task set ${taskSet.name}`}
          description={`This deletes ${taskSet.name} and all its versions. Evaluations keep their results.`}
          onDeleted={onDeleted}
        />
      </TableCell>
    </TableRow>
  );
}
