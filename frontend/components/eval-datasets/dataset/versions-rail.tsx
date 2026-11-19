import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { cn } from "@/lib/utils";

import { type TaskVersion } from "./rows";
import VersionLabel from "./version-label";

interface VersionsRailProps {
  versions: TaskVersion[];
  selected: string;
  onSelect: (hash: string) => void;
}

/** A task's versions, newest first, beside its files. */
export default function VersionsRail({ versions, selected, onSelect }: VersionsRailProps) {
  return (
    <div className="flex w-56 shrink-0 flex-col overflow-auto border-r">
      <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">Versions</div>
      {versions.map((version, i) => (
        <button
          key={version.hash}
          type="button"
          onClick={() => onSelect(version.hash)}
          className={cn(
            "flex flex-col gap-0.5 border-b px-3 py-2 text-left outline-none hover:bg-emphasis-0.5 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50",
            version.hash === selected && "bg-emphasis-1"
          )}
        >
          <VersionLabel version={version} isLatest={i === 0} />
          <span className="text-xs text-muted-foreground">
            <ClientTimestampFormatter timestamp={version.pushedAt} />
          </span>
        </button>
      ))}
    </div>
  );
}
