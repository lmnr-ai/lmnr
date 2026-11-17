import { shortHash, versionLabel } from "@/components/task-sets/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatTimestamp } from "@/lib/utils";

interface VersionSelectProps {
  /** Newest first. */
  versions: { id: string; number: number | null; hash: string; createdAt: string }[];
  value: string;
  headVersionId: string | null;
  onChange: (versionId: string) => void;
}

/** Picks one version of a task set. */
export default function VersionSelect({ versions, value, headVersionId, onChange }: VersionSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-auto min-w-48 font-medium">
        <SelectValue placeholder="Select version" />
      </SelectTrigger>
      <SelectContent>
        {versions.map((v) => (
          <SelectItem key={v.id} value={v.id}>
            <span>
              {versionLabel(v.number)}
              {v.id === headVersionId && <span className="ml-1 text-primary-text">(head)</span>}
              <span className="ml-2 font-mono text-xs text-secondary-foreground">{shortHash(v.hash)}</span>
              <span className="ml-2 text-xs text-secondary-foreground">{formatTimestamp(v.createdAt)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
