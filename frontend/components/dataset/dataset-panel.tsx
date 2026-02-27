import { ChevronsRight, Loader2, Save } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import AddToLabelingQueuePopover from "@/components/traces/add-to-labeling-queue-popover";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { type Datapoint } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { parseTimestampToMs } from "@/lib/time/timestamp";
import { isValidJsonObject, swrFetcher } from "@/lib/utils";

import { Button } from "../ui/button";
import { Label } from "../ui/label";
import MonoWithCopy from "../ui/mono-with-copy";
import { Skeleton } from "../ui/skeleton";
import DatapointVersionSelector from "./datapoint-version-selector";

interface DatasetPanelProps {
  datasetId: string;
  datapointId: string;
  onClose: () => void;
  onEditingStateChange?: (isEditing: boolean) => void;
  onDatapointUpdate?: (updatedDatapoint: Datapoint) => void;
}

// Helper function to safely parse JSON strings
const safeParseJSON = (jsonString: string | null | undefined, fallback: any = null) => {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Failed to parse JSON:", e);
    return fallback;
  }
};

export default function DatasetPanel({
  datasetId,
  datapointId,
  onClose,
  onEditingStateChange,
  onDatapointUpdate,
}: DatasetPanelProps) {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const {
    data: datapoint,
    isLoading,
    mutate,
  } = useSWR<Datapoint>(`/api/projects/${projectId}/datasets/${datasetId}/datapoints/${datapointId}`, swrFetcher);

  // Fetch all versions
  const {
    data: versions,
    isLoading: versionsLoading,
    mutate: mutateVersions,
  } = useSWR<Datapoint[]>(
    `/api/projects/${projectId}/datasets/${datasetId}/datapoints/${datapointId}/versions`,
    swrFetcher
  );

  // Track selected version - initialize from URL param if present
  const [selectedVersionCreatedAt, setSelectedVersionCreatedAt] = useState<string | null>(() =>
    searchParams.get("createdAt")
  );

  // Calculate if viewing an old version
  const isViewingOldVersion = useMemo(() => {
    if (!versions || versions.length === 0 || !selectedVersionCreatedAt) return false;
    const sortedVersions = [...versions].sort(
      (a, b) => parseTimestampToMs(b.createdAt) - parseTimestampToMs(a.createdAt)
    );
    const latestVersion = sortedVersions[0];
    return selectedVersionCreatedAt !== latestVersion.createdAt;
  }, [versions, selectedVersionCreatedAt]);

  const [newData, setNewData] = useState<any>(datapoint ? safeParseJSON(datapoint.data, null) : null);
  const [newTarget, setNewTarget] = useState<any>(datapoint ? safeParseJSON(datapoint.target, null) : null);
  const [newMetadata, setNewMetadata] = useState<Record<string, any>>(
    datapoint ? safeParseJSON(datapoint.metadata, {}) : {}
  );
  const [isValidJsonData, setIsValidJsonData] = useState(true);
  const [isValidJsonTarget, setIsValidJsonTarget] = useState(true);
  const [isValidJsonMetadata, setIsValidJsonMetadata] = useState(true);
  const { toast } = useToast();
  const [saving, setSaving] = useState<boolean>(false);

  // Track original values to detect changes
  const originalDataRef = useRef<any>(null);
  const originalTargetRef = useRef<any>(null);
  const originalMetadataRef = useRef<Record<string, any>>({});

  // Check if current values differ from original values
  const hasChanges = useCallback(
    () =>
      JSON.stringify(newData) !== JSON.stringify(originalDataRef.current) ||
      JSON.stringify(newTarget) !== JSON.stringify(originalTargetRef.current) ||
      JSON.stringify(newMetadata) !== JSON.stringify(originalMetadataRef.current),
    [newData, newTarget, newMetadata]
  );

  const saveChanges = useCallback(async () => {
    // For old versions, allow save without changes (restoration)
    // For latest version, require changes
    if (!isViewingOldVersion && !hasChanges()) {
      return;
    }

    // Don't save if JSON is invalid
    if (!isValidJsonData || !isValidJsonTarget || !isValidJsonMetadata || !datapoint) {
      return;
    }

    // Generate the timestamp before saving - this will be used by both backend and frontend
    const newTimestamp = new Date().toISOString();

    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/datasets/${datasetId}/datapoints/${datapointId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: newData,
        target: newTarget,
        metadata: newMetadata,
        createdAt: newTimestamp,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast({
        title: "Failed to save changes",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Changes saved",
      description: "A new version of the datapoint has been created.",
    });

    // Create updated datapoint with the timestamp we sent to the backend
    const updatedDatapoint: Datapoint = {
      ...datapoint,
      data: JSON.stringify(newData),
      target: JSON.stringify(newTarget),
      metadata: JSON.stringify(newMetadata),
      createdAt: newTimestamp,
    };

    // Update SWR cache without refetching
    mutate(updatedDatapoint, false);

    // Update original values after successful save
    originalDataRef.current = newData;
    originalTargetRef.current = newTarget;
    originalMetadataRef.current = newMetadata;

    // Reset version selector to latest and refresh list
    setSelectedVersionCreatedAt(null);

    // Remove createdAt from URL when saving (since we're now on the latest version)
    const params = new URLSearchParams(searchParams.toString());
    params.delete("createdAt");
    router.push(`${pathname}?${params.toString()}`);

    mutateVersions();

    // Notify parent to update table
    if (onDatapointUpdate) {
      onDatapointUpdate(updatedDatapoint);
    }
  }, [
    isViewingOldVersion,
    hasChanges,
    isValidJsonData,
    isValidJsonTarget,
    isValidJsonMetadata,
    newData,
    newTarget,
    newMetadata,
    projectId,
    datasetId,
    datapointId,
    datapoint,
    toast,
    mutate,
    mutateVersions,
    onDatapointUpdate,
    searchParams,
    pathname,
    router,
  ]);

  // Load version data into editors
  // When user selects a different version, this populates the editors with that version's data
  const loadVersion = useCallback((version: Datapoint) => {
    const parsedData = safeParseJSON(version.data, null);
    const parsedTarget = safeParseJSON(version.target, null);
    const parsedMetadata = safeParseJSON(version.metadata, {});

    setNewData(parsedData);
    setNewTarget(parsedTarget);
    setNewMetadata(parsedMetadata);
    setIsValidJsonData(true);
    setIsValidJsonTarget(true);
    setIsValidJsonMetadata(true);

    // Update refs to track changes from this version
    originalDataRef.current = parsedData;
    originalTargetRef.current = parsedTarget;
    originalMetadataRef.current = parsedMetadata;
  }, []);

  // Handler for when user selects a different version from dropdown
  const handleVersionChange = useCallback(
    (createdAt: string) => {
      setSelectedVersionCreatedAt(createdAt);

      // Update URL with the selected version's createdAt
      const params = new URLSearchParams(searchParams.toString());
      if (createdAt) {
        params.set("createdAt", createdAt);
      } else {
        params.delete("createdAt");
      }
      router.push(`${pathname}?${params.toString()}`);

      // Find and load the selected version
      const version = versions?.find((v) => v.createdAt === createdAt);
      if (version) {
        loadVersion(version);
      }
    },
    [versions, loadVersion, searchParams, pathname, router]
  );

  // Initialize with specific version from URL or latest version when datapoint first loads
  useEffect(() => {
    if (!datapoint || !versions) return;

    const createdAtFromUrl = searchParams.get("createdAt");

    // If there's a createdAt in the URL and it matches a version, load that version
    if (createdAtFromUrl && versions.some((v) => v.createdAt === createdAtFromUrl)) {
      const version = versions.find((v) => v.createdAt === createdAtFromUrl);
      if (version) {
        loadVersion(version);
        setSelectedVersionCreatedAt(createdAtFromUrl);
        return;
      }
    }

    // Otherwise, load the latest version (current datapoint)
    const parsedData = safeParseJSON(datapoint.data, null);
    const parsedTarget = safeParseJSON(datapoint.target, null);
    const parsedMetadata = safeParseJSON(datapoint.metadata, {});

    setNewData(parsedData);
    setNewTarget(parsedTarget);
    setNewMetadata(parsedMetadata);

    // Update original values when datapoint changes
    originalDataRef.current = parsedData;
    originalTargetRef.current = parsedTarget;
    originalMetadataRef.current = parsedMetadata;
  }, [datapoint, versions, searchParams, loadVersion]);

  const discardChanges = useCallback(() => {
    // Restore to the original values (from refs)
    setNewData(originalDataRef.current);
    setNewTarget(originalTargetRef.current);
    setNewMetadata(originalMetadataRef.current);
    setIsValidJsonData(true);
    setIsValidJsonTarget(true);
    setIsValidJsonMetadata(true);
  }, []);

  const handleClose = useCallback(() => {
    // Discard any unsaved changes when closing
    discardChanges();
    onClose();
  }, [onClose, discardChanges]);

  // Notify parent component when editing state changes
  useEffect(() => {
    if (onEditingStateChange) {
      onEditingStateChange(hasChanges());
    }
  }, [hasChanges, onEditingStateChange]);

  if (isLoading) {
    return (
      <div className="p-4 space-y-2 h-full w-full">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    );
  }

  if (datapoint) {
    const isEditing = hasChanges();

    // When viewing old version, allow save without changes (restoration)
    // When viewing latest, require changes to enable save
    const canSave = isViewingOldVersion
      ? isValidJsonData && isValidJsonTarget && isValidJsonMetadata
      : isEditing && isValidJsonData && isValidJsonTarget && isValidJsonMetadata;

    return (
      <>
        <div className="flex flex-col h-full w-full">
          <div className="h-12 flex flex-none space-x-2 px-3 items-center border-b">
            <Button variant="ghost" className="px-1" onClick={handleClose}>
              <ChevronsRight />
            </Button>
            <div>Row</div>
            <MonoWithCopy className="text-secondary-foreground mt-0.5">{datapoint?.id}</MonoWithCopy>

            {/* Version dropdown component */}
            <DatapointVersionSelector
              versions={versions || []}
              selectedVersionCreatedAt={selectedVersionCreatedAt}
              onVersionChange={handleVersionChange}
              isLoading={versionsLoading}
            />

            {saving && (
              <div className="flex text-secondary-foreground text-sm">
                <Loader2 className="animate-spin h-4 w-4 mr-2 mt-0.5" />
                Saving
              </div>
            )}
            {(isEditing || isViewingOldVersion) && !saving && (
              <>
                <Button variant="default" onClick={saveChanges} disabled={!canSave} className="gap-1">
                  <Save className="h-4 w-4" />
                  {isViewingOldVersion ? "Save as new version" : "Save"}
                </Button>
                <Button variant="outline" onClick={discardChanges} className="gap-1" icon="x">
                  Discard changes
                </Button>
              </>
            )}
            <div className="grow" />
            {datapoint && !isEditing && !isViewingOldVersion && (
              <AddToLabelingQueuePopover
                data={[
                  {
                    payload: {
                      data: safeParseJSON(datapoint.data, {}),
                      target: safeParseJSON(datapoint.target, {}),
                      metadata: safeParseJSON(datapoint.metadata, {}),
                    },
                    metadata: { source: "datapoint", id: datapoint.id, datasetId: datasetId },
                  },
                ]}
                buttonVariant="outline"
                buttonSize="default"
              />
            )}
          </div>
          {datapoint && (
            <div className="grow flex overflow-auto">
              <div className="grow flex flex-col space-y-4 p-4 h-full w-full">
                <div className="flex flex-col space-y-2">
                  <Label className="font-medium">Data</Label>
                  <ContentRenderer
                    presetKey={`dataset-data-${datasetId}`}
                    className="max-h-[400px] rounded"
                    value={JSON.stringify(newData, null, 2)}
                    defaultMode="json"
                    readOnly={false}
                    onChange={(s) => {
                      try {
                        const parsed = JSON.parse(s);
                        if (parsed === null) {
                          setIsValidJsonData(false);
                          // we still set it to null to format the error,
                          // button is blocked by isValidJsonData check
                          setNewData(null);
                          return;
                        }
                        setIsValidJsonData(true);
                        setNewData(parsed);
                      } catch (e) {
                        setIsValidJsonData(false);
                      }
                    }}
                  />
                  {!isValidJsonData && (
                    <p className="text-sm text-red-500">
                      {newData === null ? "Data cannot be null" : "Invalid JSON format"}
                    </p>
                  )}
                </div>
                <div className="flex flex-col space-y-2">
                  <Label className="font-medium">Target</Label>
                  <ContentRenderer
                    presetKey={`dataset-target-${datasetId}`}
                    className="max-h-[400px] rounded w-full"
                    value={JSON.stringify(newTarget, null, 2)}
                    defaultMode="json"
                    onChange={(s) => {
                      try {
                        setNewTarget(JSON.parse(s));
                        setIsValidJsonTarget(true);
                      } catch (e) {
                        setIsValidJsonTarget(false);
                      }
                    }}
                  />
                  {!isValidJsonTarget && <p className="text-sm text-red-500">Invalid JSON format</p>}
                </div>
                <div className="flex flex-col space-y-2 pb-4">
                  <Label className="font-medium">Metadata</Label>
                  <ContentRenderer
                    presetKey={`dataset-metadata-${datasetId}`}
                    className="rounded max-h-[400px]"
                    value={JSON.stringify(newMetadata, null, 2)}
                    defaultMode="json"
                    onChange={(s: string) => {
                      try {
                        if (s === "") {
                          setNewMetadata({});
                          setIsValidJsonMetadata(true);
                          return;
                        }
                        if (!isValidJsonObject(JSON.parse(s))) {
                          setIsValidJsonMetadata(false);
                          return;
                        }
                        setNewMetadata(JSON.parse(s));
                        setIsValidJsonMetadata(true);
                      } catch (e) {
                        setIsValidJsonMetadata(false);
                      }
                    }}
                  />
                  {!isValidJsonMetadata && (
                    <p className="text-sm text-red-500">Invalid JSON object. Metadata must be a JSON map.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }
}
