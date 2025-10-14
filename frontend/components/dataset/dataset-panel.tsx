import { ChevronsRight, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import AddToLabelingQueuePopover from "@/components/traces/add-to-labeling-queue-popover";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { Datapoint } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { isValidJsonObject, swrFetcher } from "@/lib/utils";

import { Button } from "../ui/button";
import { Label } from "../ui/label";
import MonoWithCopy from "../ui/mono-with-copy";
import { Skeleton } from "../ui/skeleton";

interface DatasetPanelProps {
  datasetId: string;
  datapointId: string;
  onClose: (updatedDatapoint?: Datapoint) => void;
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

export default function DatasetPanel({ datasetId, datapointId, onClose }: DatasetPanelProps) {
  const { projectId } = useParams();
  const { data: datapoint, isLoading } = useSWR<Datapoint>(
    `/api/projects/${projectId}/datasets/${datasetId}/datapoints/${datapointId}`,
    swrFetcher
  );

  const [newData, setNewData] = useState<Record<string, any> | null>(
    datapoint ? safeParseJSON(datapoint.data, null) : null
  );
  const [newTarget, setNewTarget] = useState<Record<string, any> | null>(
    datapoint ? safeParseJSON(datapoint.target, null) : null
  );
  const [newMetadata, setNewMetadata] = useState<Record<string, any>>(
    datapoint ? safeParseJSON(datapoint.metadata, {}) : {}
  );
  const [isValidJsonData, setIsValidJsonData] = useState(true);
  const [isValidJsonTarget, setIsValidJsonTarget] = useState(true);
  const [isValidJsonMetadata, setIsValidJsonMetadata] = useState(true);
  const { toast } = useToast();
  const autoSaveFuncTimeoutId = useRef<NodeJS.Timeout | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Track original values to detect changes
  const originalDataRef = useRef<Record<string, any> | null>(null);
  const originalTargetRef = useRef<Record<string, any> | null>(null);
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
    // don't do anything if no changes or invalid jsons
    if (!hasChanges() || !isValidJsonData || !isValidJsonTarget || !isValidJsonMetadata) {
      return;
    }
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
        createdAt: datapoint?.createdAt,
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

    // Update original values after successful save
    originalDataRef.current = newData;
    originalTargetRef.current = newTarget;
    originalMetadataRef.current = newMetadata;
  }, [
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
    toast,
  ]);

  useEffect(() => {
    if (!datapoint) return;

    // Parse JSON strings and set state
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
  }, [datapoint]);

  const handleClose = useCallback(() => {
    if (datapoint) {
      const updatedDatapoint: Datapoint = {
        ...datapoint,
        data: JSON.stringify(newData),
        target: JSON.stringify(newTarget),
        metadata: JSON.stringify(newMetadata),
      };
      onClose(updatedDatapoint);
    } else {
      onClose();
    }
  }, [onClose, datapoint, newData, newTarget, newMetadata]);

  // Debounced auto-save effect
  useEffect(() => {
    // Skip if datapoint is not loaded yet or if values are invalid
    if (!datapoint || !isValidJsonData || !isValidJsonTarget || !isValidJsonMetadata) {
      return;
    }

    // Clear existing timeout
    if (autoSaveFuncTimeoutId.current) {
      clearTimeout(autoSaveFuncTimeoutId.current);
    }

    // Only set timeout if there are changes
    if (hasChanges()) {
      autoSaveFuncTimeoutId.current = setTimeout(() => {
        saveChanges();
      }, 500);
    }

    // Cleanup function
    return () => {
      if (autoSaveFuncTimeoutId.current) {
        clearTimeout(autoSaveFuncTimeoutId.current);
      }
    };
  }, [
    newData,
    newTarget,
    newMetadata,
    hasChanges,
    saveChanges,
    datapoint,
    isValidJsonData,
    isValidJsonTarget,
    isValidJsonMetadata,
  ]);

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
    return (
      <div className="flex flex-col h-full w-full">
        <div className="h-12 flex flex-none space-x-2 px-3 items-center border-b">
          <Button variant="ghost" className="px-1" onClick={handleClose}>
            <ChevronsRight />
          </Button>
          <div>Row</div>
          <MonoWithCopy className="text-secondary-foreground mt-0.5">{datapoint?.id}</MonoWithCopy>
          {saving && (
            <div className="flex text-secondary-foreground text-sm">
              <Loader2 className="animate-spin h-4 w-4 mr-2 mt-0.5" />
              Saving
            </div>
          )}
          <div className="flex-grow" />
          {datapoint && (
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
            />
          )}
        </div>
        {datapoint && (
          <div className="flex-grow flex overflow-auto">
            <div className="flex-grow flex flex-col space-y-4 p-4 h-full w-full">
              <div className="flex flex-col space-y-2">
                <Label className="font-medium">Data</Label>
                <CodeHighlighter
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
                <CodeHighlighter
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
                <CodeHighlighter
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
    );
  }
}
