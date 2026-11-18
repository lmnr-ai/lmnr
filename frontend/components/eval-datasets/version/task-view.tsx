import Message from "@/components/evaluation/task-files/message";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import TaskFiles from "./task-files";

interface TaskViewProps {
  projectId: string;
  task: string | null;
  version: number;
  /** The task's hash at `version`; null when it doesn't have the task. */
  hash: string | null;
  compareVersion: number | null;
  baseHash: string | null;
  /** Which version's copy is shown (`?at=`); defaults to `version` when it has the task. */
  at: number | null;
  onAtChange: (version: number) => void;
  file: string | null;
  onFileChange: (path: string) => void;
}

/** The selected task's files; a task changed between the compared versions can be shown at either. */
export default function TaskView(props: TaskViewProps) {
  const { projectId, task, version, hash, compareVersion, baseHash, at, onAtChange, file, onFileChange } = props;
  if (!task || (!hash && !baseHash)) return <Message>Select a task to see its files.</Message>;

  const showBase = !hash || (at === compareVersion && !!baseHash);
  const shownHash = (showBase ? baseHash : hash)!;
  const changed = !!hash && !!baseHash && hash !== baseHash;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {compareVersion !== null && (
        <div className="flex flex-none items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
          {changed ? (
            <>
              <span>Show at</span>
              <Tabs value={String(showBase ? compareVersion : version)} onValueChange={(v) => onAtChange(Number(v))}>
                <TabsList size="sm">
                  <TabsTrigger value={String(version)}>v{version}</TabsTrigger>
                  <TabsTrigger value={String(compareVersion)}>v{compareVersion}</TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          ) : (
            <span>{!baseHash ? `Only in v${version}` : !hash ? `Only in v${compareVersion}` : "Unchanged"}</span>
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <TaskFiles
          key={shownHash}
          projectId={projectId}
          task={task}
          hash={shownHash}
          file={file}
          onFileChange={onFileChange}
        />
      </div>
    </div>
  );
}
