"use client";

import { useParams } from "next/navigation";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useMemo } from "react";
import useSWR from "swr";

import Message from "@/components/evaluation/task-files/message";
import Header from "@/components/ui/header";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { type EvalDatasetVersionDetails } from "@/lib/actions/eval-datasets/types";
import { swrFetcher } from "@/lib/api/fetch-api";

import { evalDatasetHref, evalDatasetsHref } from "../constants";
import { diffTasks, resolveTask } from "../utils";
import CompareSelect from "./compare-select";
import TaskList from "./task-list";
import TaskView from "./task-view";
import VersionSummary from "./version-summary";

const QUERY = { task: parseAsString, compare: parseAsInteger, at: parseAsInteger, file: parseAsString };

// Versions are immutable.
const SWR_OPTIONS = { revalidateOnFocus: false, revalidateIfStale: false };

/** One version's tasks and their files, optionally diffed against another version (`?compare=`). */
export default function EvalDatasetVersion({ dataset, version }: { dataset: string; version: number }) {
  const { projectId } = useParams<{ projectId: string }>();
  const [{ task, compare, at, file }, setQuery] = useQueryStates(QUERY);
  const url = (v: number) => `/api/projects/${projectId}/eval-datasets/${encodeURIComponent(dataset)}/versions/${v}`;
  const current = useSWR<EvalDatasetVersionDetails>(url(version), swrFetcher, SWR_OPTIONS);
  const compareVersion = compare !== null && compare !== version ? compare : null;
  const base = useSWR<EvalDatasetVersionDetails>(
    compareVersion !== null ? url(compareVersion) : null,
    swrFetcher,
    SWR_OPTIONS
  );

  const tasks = current.data?.tasks;
  const diff = useMemo(() => (tasks && base.data ? diffTasks(tasks, base.data.tasks) : null), [tasks, base.data]);
  const selected = task ?? (diff ? [...diff.changed, ...diff.added, ...diff.removed][0] : tasks?.[0]?.name) ?? null;
  const { hash, baseHash } = resolveTask(selected, tasks ?? [], base.data?.tasks ?? null);

  const header = (
    <Header
      path={[
        { name: "eval datasets", href: evalDatasetsHref(projectId) },
        { name: dataset, href: evalDatasetHref(projectId, dataset) },
        { name: `v${version}` },
      ]}
    />
  );
  if (current.error || !current.data) {
    return (
      <>
        {header}
        <Message>{current.error instanceof Error ? current.error.message : "Loading…"}</Message>
      </>
    );
  }
  // A failed compare fetch stays inside the content area, so the picker can still clear or change it.
  const compareStatus = base.error
    ? `Couldn't load v${compareVersion}: ${base.error instanceof Error ? base.error.message : "unknown error"}`
    : `Loading v${compareVersion}…`;

  return (
    <>
      {header}
      <VersionSummary projectId={projectId} details={current.data}>
        <CompareSelect
          version={version}
          versions={current.data.versions}
          value={compareVersion}
          onChange={(next) => setQuery({ compare: next, task: null, at: null })}
        />
      </VersionSummary>
      <div className="flex min-h-0 flex-1 border-t">
        {compareVersion !== null && !diff ? (
          <Message>{compareStatus}</Message>
        ) : (
          <ResizablePanelGroup id="eval-dataset-version" orientation="horizontal">
            <ResizablePanel id="eval-dataset-version-tasks" defaultSize={22} minSize={12} className="min-w-0">
              <TaskList
                tasks={current.data.tasks}
                diff={diff}
                compareVersion={compareVersion}
                selected={selected}
                onSelect={(name) => setQuery({ task: name })}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="eval-dataset-version-files" defaultSize={78} minSize={40} className="flex min-w-0">
              <TaskView
                projectId={projectId}
                task={selected}
                version={version}
                hash={hash}
                compareVersion={compareVersion}
                baseHash={baseHash}
                at={at}
                onAtChange={(next) => setQuery({ at: next === version ? null : next })}
                file={file}
                onFileChange={(path) => setQuery({ file: path })}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </>
  );
}
