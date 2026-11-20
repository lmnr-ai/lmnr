import Mono from "@/components/ui/mono";
import { shortHash } from "@/lib/actions/eval-datasets/types";
import { cn } from "@/lib/utils";

import { type TaskVersion } from "./rows";

interface VersionLabelProps {
  version: TaskVersion;
  className?: string;
}

/** `v3 · a1b2c3d4e5f6`. */
export default function VersionLabel({ version, className }: VersionLabelProps) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)} title={version.hash}>
      <span className="shrink-0 text-xs font-medium">v{version.number}</span>
      <Mono className="truncate text-xs text-muted-foreground">{shortHash(version.hash)}</Mono>
    </span>
  );
}
