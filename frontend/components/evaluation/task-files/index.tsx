"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { type EvaluationFiles } from "@/lib/actions/evaluation/files";
import { swrFetcher } from "@/lib/api/fetch-api";

import FileTree from "./file-tree";
import FileViewer from "./file-viewer";
import Message from "./message";
import { buildFileTree, DEFAULT_FILE, type FileNode, flattenFiles } from "./utils";

interface TaskFilesProps {
  projectId: string;
  evaluationId: string;
  /** The trial's task dir in the uploaded evals folder; null when it wasn't uploaded. */
  taskPath: string | null;
}

/**
 * The trial's task folder from the evals folder its remote run uploaded: file
 * tree on the left, the open file on the right. Mount with `key={taskPath}` so
 * switching tasks reopens the default file.
 */
export default function TaskFiles({ projectId, evaluationId, taskPath }: TaskFilesProps) {
  const base = `/api/projects/${projectId}/evaluations/${evaluationId}/files`;
  // One listing per evaluation, shared by every trial's task; an uploaded folder never changes.
  const { data, error, isLoading } = useSWR<EvaluationFiles>(base, swrFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  const tree = useMemo(() => (data && taskPath ? buildFileTree(data.files, taskPath) : []), [data, taskPath]);
  const [selected, setSelected] = useState<FileNode | null>(null);

  const open = useMemo(() => {
    if (selected) return selected;
    const files = flattenFiles(tree);
    return files.find((f) => f.path === DEFAULT_FILE) ?? files[0] ?? null;
  }, [selected, tree]);

  if (!taskPath) {
    return (
      <Message>This trial&apos;s task wasn&apos;t uploaded with the run, so its files can&apos;t be shown.</Message>
    );
  }
  if (error) return <Message>{error instanceof Error ? error.message : "Failed to load the files"}</Message>;
  if (isLoading) return <Message>Loading files…</Message>;
  if (!open) return <Message>{`No files found in ${taskPath}`}</Message>;

  return (
    <ResizablePanelGroup id="evaluation-task-files" orientation="horizontal">
      <ResizablePanel id="evaluation-task-files-tree" defaultSize={30} minSize={15} className="min-w-0">
        <div className="h-full overflow-auto">
          <div className="truncate border-b px-3 py-1.5 font-mono text-xs text-muted-foreground" title={taskPath}>
            {taskPath}
          </div>
          <FileTree nodes={tree} selectedPath={open.path} onSelect={setSelected} />
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="evaluation-task-files-viewer" defaultSize={70} minSize={30} className="min-w-0">
        <FileViewer
          key={open.path}
          url={`${base}/content?path=${encodeURIComponent(`${taskPath}/${open.path}`)}`}
          path={open.path}
          size={open.size}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
