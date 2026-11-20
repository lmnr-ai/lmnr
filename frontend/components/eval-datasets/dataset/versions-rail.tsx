import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { cn } from "@/lib/utils";

import { type TaskVersion } from "./rows";
import VersionLabel from "./version-label";

interface VersionsRailProps {
  versions: TaskVersion[];
  selected?: string;
  onSelect: (hash: string) => void;
}

/** A task's versions, newest first, beside its files. Styled like the evaluation groups list. */
export default function VersionsRail({ versions, selected, onSelect }: VersionsRailProps) {
  return (
    <div className="flex w-56 shrink-0 flex-col overflow-hidden border-r">
      <div className="flex h-8 shrink-0 items-center px-3 text-xs text-muted-foreground">Versions</div>
      <ul className="flex flex-col gap-0.5 overflow-auto px-1 pb-1">
        {versions.map((version) => {
          const isSelected = version.hash === selected;
          return (
            <li key={version.hash} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(version.hash)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  // Same hover/selected states as the file tree beside it.
                  isSelected
                    ? "overlay-selected text-foreground-50"
                    : "text-muted-foreground hover:overlay-hover active:overlay-selected"
                )}
              >
                <VersionLabel version={version} className="flex-1" />
                <ClientTimestampFormatter
                  className="shrink-0 text-xs text-muted-foreground"
                  timestamp={version.pushedAt}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
