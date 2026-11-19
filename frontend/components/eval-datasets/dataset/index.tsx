"use client";

import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { parseAsString, useQueryStates } from "nuqs";
import { useCallback } from "react";

import Message from "@/components/evaluation/task-files/message";
import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { datasetEvaluationsHref, evalDatasetsHref } from "../constants";
import TaskPanel from "./task";
import DatasetTasks from "./tasks";

const QUERY = { task: parseAsString, version: parseAsString, file: parseAsString };

/** One eval dataset: its tasks (latest versions), and the selected task's versions and files. */
export default function EvalDataset({ dataset }: { dataset: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  const [{ task, version, file }, setQuery] = useQueryStates(QUERY);

  const onSelectTask = useCallback((name: string) => setQuery({ task: name, version: null }), [setQuery]);

  return (
    <>
      <Header path={[{ name: "eval datasets", href: evalDatasetsHref(projectId) }, { name: dataset }]}>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5" asChild>
          <Link href={datasetEvaluationsHref(projectId, dataset)}>
            <FlaskConical className="size-3.5" />
            Evaluations
          </Link>
        </Button>
      </Header>
      <div className="flex min-h-0 flex-1 border-t">
        <ResizablePanelGroup id="eval-dataset" orientation="horizontal">
          <ResizablePanel id="eval-dataset-tasks" defaultSize="38%" minSize="20%" className="flex min-w-0">
            <DatasetTasks projectId={projectId} dataset={dataset} selected={task} onSelect={onSelectTask} />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="eval-dataset-task" defaultSize="62%" minSize="30%" className="flex min-w-0">
            {task ? (
              <TaskPanel
                key={task}
                projectId={projectId}
                dataset={dataset}
                task={task}
                version={version}
                onVersionChange={(hash) => setQuery({ version: hash })}
                file={file}
                onFileChange={(path) => setQuery({ file: path })}
              />
            ) : (
              <Message>Select a task to see its versions and files.</Message>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );
}
