"use client";

import useSWR from "swr";

import Message from "@/components/evaluation/task-files/message";
import VersionSelect from "@/components/task-sets/agent-scripts/version-select";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { type TaskInfo, type TaskSetDetail } from "@/lib/actions/task-sets/types";
import { swrFetcher } from "@/lib/api/fetch-api";

import { useTaskParam, useVersionParam } from "../state";
import TaskDetail from "./task-detail";
import TaskList from "./task-list";

interface TasksTabProps {
  projectId: string;
  taskSet: TaskSetDetail;
}

/** The tasks of one version (the head unless `?version=` picks another): list on the left, the open task on the right. */
export default function TasksTab({ projectId, taskSet }: TasksTabProps) {
  const [versionParam, setVersion] = useVersionParam();
  const [taskParam, setTask] = useTaskParam();
  const versionId = versionParam ?? taskSet.headVersionId ?? taskSet.versions[0]?.id ?? null;
  const base = `/api/projects/${projectId}/task-sets/${taskSet.id}/versions/${versionId}`;
  const { data: tasks, error } = useSWR<TaskInfo[]>(versionId ? `${base}/tasks` : null, swrFetcher, {
    revalidateOnFocus: false,
  });

  if (!versionId) return <Message>This task set has no versions.</Message>;
  if (error) return <Message>{error instanceof Error ? error.message : "Failed to load tasks"}</Message>;

  const task = tasks?.find((t) => t.name === taskParam) ?? tasks?.[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-none items-center gap-2">
        <VersionSelect
          versions={taskSet.versions}
          value={versionId}
          headVersionId={taskSet.headVersionId}
          onChange={(id) => void setVersion(id === taskSet.headVersionId ? null : id)}
        />
        {tasks && <span className="text-xs text-secondary-foreground">{tasks.length} tasks</span>}
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
        {!tasks && <Message>Loading tasks…</Message>}
        {tasks?.length === 0 && <Message>This version has no tasks.</Message>}
        {task && (
          <ResizablePanelGroup id="task-set-tasks" orientation="horizontal">
            <ResizablePanel id="task-set-tasks-list" defaultSize={22} minSize={12} className="min-w-0">
              <TaskList tasks={tasks!} selected={task.name} onSelect={(name) => void setTask(name)} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="task-set-tasks-detail" defaultSize={78} minSize={40} className="min-w-0">
              <TaskDetail
                key={`${versionId}/${task.name}`}
                projectId={projectId}
                task={task}
                filesBase={`${base}/files`}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}
