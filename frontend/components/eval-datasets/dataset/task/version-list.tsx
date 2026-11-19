import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Badge } from "@/components/ui/badge";
import { shortHash, type TaskVersion } from "@/lib/actions/eval-datasets/types";
import { cn } from "@/lib/utils";

interface VersionListProps {
  task: string;
  /** Newest first. */
  versions: TaskVersion[];
  selected: string;
  onSelect: (hash: string) => void;
}

export default function VersionList({ task, versions, selected, onSelect }: VersionListProps) {
  return (
    <div className="flex w-60 flex-none flex-col overflow-hidden">
      <div className="flex-none border-b px-3 py-1.5">
        <div className="truncate font-mono text-xs font-medium" title={task}>
          {task}
        </div>
        <div className="text-xs text-muted-foreground">
          {versions.length} {versions.length === 1 ? "version" : "versions"}
        </div>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto p-1">
        {versions.map((version, index) => (
          <li key={version.hash}>
            <button
              type="button"
              title={version.hash}
              onClick={() => onSelect(version.hash)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:overlay-hover hover:text-foreground-50",
                version.hash === selected && "overlay-selected font-medium text-foreground-50"
              )}
            >
              <span className="font-mono">{shortHash(version.hash)}</span>
              {index === 0 && (
                <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal">
                  latest
                </Badge>
              )}
              <ClientTimestampFormatter
                timestamp={version.createdAt}
                className="ml-auto shrink-0 text-xs text-muted-foreground"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
