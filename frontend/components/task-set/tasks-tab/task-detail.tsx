import ArchiveFolder from "@/components/evaluation/task-files/archive-folder";
import { type TaskInfo } from "@/lib/actions/task-sets/types";

import TaskMetadata from "./task-metadata";

interface TaskDetailProps {
  projectId: string;
  task: TaskInfo;
  /** Lists the version's archive; `/content?path=` reads one file. */
  filesBase: string;
}

/** One task: its `[metadata]` (where it came from), then its folder from the version's archive. */
export default function TaskDetail({ projectId, task, filesBase }: TaskDetailProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TaskMetadata projectId={projectId} task={task} />
      <div className="flex min-h-0 flex-1">
        <ArchiveFolder
          id="task-set-task-files"
          listUrl={filesBase}
          contentUrl={(path) => `${filesBase}/content?path=${encodeURIComponent(path)}`}
          root={task.name}
          title={task.name}
        />
      </div>
    </div>
  );
}
