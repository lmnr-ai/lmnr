import useSWR from "swr";

import Message from "@/components/evaluation/task-files/message";
import { type TaskVersion } from "@/lib/actions/eval-datasets/types";
import { swrFetcher } from "@/lib/api/fetch-api";

import { evalDatasetApi } from "../../constants";
import VersionFiles from "./version-files";
import VersionList from "./version-list";

interface TaskPanelProps {
  projectId: string;
  dataset: string;
  task: string;
  /** `?version=`; the latest when null or not one of the task's. */
  version: string | null;
  onVersionChange: (hash: string) => void;
  file: string | null;
  onFileChange: (path: string) => void;
}

/** A task's versions (newest first) and the files of the selected one. */
export default function TaskPanel(props: TaskPanelProps) {
  const { projectId, dataset, task, version, onVersionChange, file, onFileChange } = props;
  const api = evalDatasetApi(projectId, dataset, task);
  const { data, error } = useSWR<{ versions: TaskVersion[] }>(`${api}/versions`, swrFetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  if (error) return <Message>{error instanceof Error ? error.message : "Failed to load the task's versions"}</Message>;
  if (!data) return <Message>Loading versions…</Message>;

  const selected = data.versions.find((v) => v.hash === version) ?? data.versions[0];
  return (
    <div className="flex min-w-0 flex-1">
      <VersionList
        task={task}
        versions={data.versions}
        selected={selected.hash}
        onSelect={(hash) => onVersionChange(hash)}
      />
      <div className="flex min-w-0 flex-1 border-l">
        <VersionFiles
          key={selected.hash}
          api={`${api}/versions/${selected.hash}/files`}
          task={task}
          hash={selected.hash}
          file={file}
          onFileChange={onFileChange}
        />
      </div>
    </div>
  );
}
