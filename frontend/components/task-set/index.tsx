"use client";

import useSWR from "swr";

import AgentScripts from "@/components/task-sets/agent-scripts";
import Header from "@/components/ui/header";
import { type TaskSetDetail } from "@/lib/actions/task-sets/types";
import { swrFetcher } from "@/lib/api/fetch-api";

import RunsTab from "./runs-tab";
import { useTaskSetTab } from "./state";
import TaskSetTabs from "./tabs";
import TasksTab from "./tasks-tab";
import VersionsTab from "./versions-tab";

interface TaskSetProps {
  projectId: string;
  initialTaskSet: TaskSetDetail;
}

/** One task set: its tasks at a version, its versions, the runs that used it and its agent's scripts. */
export default function TaskSet({ projectId, initialTaskSet }: TaskSetProps) {
  const { data: taskSet = initialTaskSet } = useSWR<TaskSetDetail>(
    `/api/projects/${projectId}/task-sets/${initialTaskSet.id}`,
    swrFetcher,
    { fallbackData: initialTaskSet }
  );
  const [tab] = useTaskSetTab();

  return (
    <>
      <Header
        path={[
          { name: "task sets", href: `/project/${projectId}/task-sets` },
          { name: taskSet.agent.name },
          { name: taskSet.name },
        ]}
      />
      <div className="flex flex-none px-4 pb-2">
        <TaskSetTabs />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
        {tab === "tasks" && <TasksTab projectId={projectId} taskSet={taskSet} />}
        {tab === "versions" && <VersionsTab taskSet={taskSet} />}
        {tab === "runs" && <RunsTab projectId={projectId} taskSetId={taskSet.id} />}
        {tab === "scripts" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
            <AgentScripts
              projectId={projectId}
              agentId={taskSet.agent.id}
              agentName={taskSet.agent.name}
              headVersionId={taskSet.agent.headVersionId}
            />
          </div>
        )}
      </div>
    </>
  );
}
