import { useMemo } from "react";

import { type Datapoint } from "@/lib/dataset/types";
import { formatTimestampWithSeconds } from "@/lib/utils";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface NumberedVersion extends Datapoint {
  versionNumber: number;
  label: string;
}

interface DatapointVersionSelectorProps {
  versions: Datapoint[];
  selectedVersionCreatedAt: string | null;
  onVersionChange: (createdAt: string) => void;
  isLoading?: boolean;
}

/**
 * DatapointVersionSelector Component
 *
 * Controlled component that displays version selection dropdown.
 * All state is managed by the parent component.
 */
export default function DatapointVersionSelector({
  versions,
  selectedVersionCreatedAt,
  onVersionChange,
  isLoading,
}: DatapointVersionSelectorProps) {
  // Create numbered versions sorted by createdAt (oldest first gets v1)
  const numberedVersions = useMemo(() => {
    if (!versions || versions.length === 0) return [];

    return [...versions]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((v, index) => ({
        ...v,
        versionNumber: index + 1,
        label: `v${index + 1} - ${formatTimestampWithSeconds(v.createdAt)}`,
      }));
  }, [versions]);

  // Find the latest version
  const latestVersion = useMemo(() => {
    if (numberedVersions.length === 0) return null;
    return numberedVersions[numberedVersions.length - 1];
  }, [numberedVersions]);

  // Get currently selected version
  const selectedVersion = useMemo(() => {
    if (!selectedVersionCreatedAt || numberedVersions.length === 0) return latestVersion;
    return numberedVersions.find((v) => v.createdAt === selectedVersionCreatedAt) || latestVersion;
  }, [selectedVersionCreatedAt, numberedVersions, latestVersion]);

  if (isLoading || numberedVersions.length === 0) {
    return null;
  }

  return (
    <Select value={selectedVersionCreatedAt || latestVersion?.createdAt || ""} onValueChange={onVersionChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue>{selectedVersion ? selectedVersion.label : "Select version"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {numberedVersions.toReversed().map((version) => (
          <SelectItem key={version.createdAt} value={version.createdAt}>
            {version.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
