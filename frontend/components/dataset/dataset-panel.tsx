import { useProjectContext } from "@/contexts/project-context";
import { ChevronsRight } from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";
import Mono from "../ui/mono";
import { Datapoint } from "@/lib/dataset/types";
import Formatter from "../ui/formatter";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isJsonStringAValidObject } from "@/lib/utils";
import { useToast } from "@/lib/hooks/use-toast";

interface DatasetPanelProps {
  datasetId: string;
  datapoint: Datapoint
  onClose: () => void;
}

const deepEqual = (x: Object | null, y: Object | null): boolean => {
  if (x == null && y == null) return true;
  if (x == null || y == null) return false;
  const ok = Object.keys, tx = typeof x, ty = typeof y;
  return x && y && tx === 'object' && tx === ty ? (
    ok(x).length === ok(y).length &&
    ok(x).every((key: string) => deepEqual((x as any)[key], (y as any)[key]))
  ) : (x === y);
}

export default function DatasetPanel({ datasetId, datapoint, onClose }: DatasetPanelProps) {
  const { projectId } = useProjectContext();
  // datapoint is DatasetDatapoint, i.e. result of one execution on a data point
  const [newData, setNewData] = useState<Record<string, any>>(datapoint.data);
  const [newTarget, setNewTarget] = useState<Record<string, any>>(datapoint.target);
  const [newMetadata, setNewMetadata] = useState<Record<string, any> | null>(datapoint.metadata);
  const [isValidJsonData, setIsValidJsonData] = useState(true);
  const [isValidJsonTarget, setIsValidJsonTarget] = useState(true);
  const [isValidJsonMetadata, setIsValidJsonMetadata] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    setNewData(datapoint.data);
    setNewTarget(datapoint.target);
    setNewMetadata(datapoint.metadata);
  }, [datapoint])

  return (
    <div className='flex flex-col h-full w-full'>
      <div className='h-12 flex flex-none space-x-2 px-3 items-center border-b'>
        <div className="flex flex-row flex-grow space-x-2 h-full items-center">
          <Button
            variant="ghost"
            className='px-1'
            onClick={() => {
              setNewData(datapoint.data)
              setNewTarget(datapoint.target)
              setNewMetadata(datapoint.metadata)
              onClose()
            }}
          >
            <ChevronsRight />
          </Button>
          <div>
            Row
          </div>
          <Mono className='text-secondary-foreground'>
            {datapoint.id}
          </Mono>
        </div>
        <Button
          className="mr-4"
          variant='outline'
          // disable if no changes or invalid json
          disabled={!isValidJsonData || !isValidJsonTarget || !isValidJsonMetadata ||
            (deepEqual(datapoint.data, newData) && deepEqual(datapoint.target, newTarget)) && deepEqual(datapoint.metadata, newMetadata)}
          onClick={async () => {
            const res = await fetch(`/api/projects/${projectId}/datasets/${datasetId}/datapoints/${datapoint.id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                data: newData,
                target: newTarget,
                metadata: newMetadata,
              })
            })
            if (!res.ok) {
              toast({
                title: 'Failed to save changes',
                variant: 'destructive',
              })
              return
            }
            router.refresh()
            toast({
              title: 'Changes saved',
            })
          }}
        > Save changes
        </Button>
      </div>
      {datapoint &&
        <ScrollArea className="flex-grow flex overflow-auto">
          <div className="flex max-h-0">
            <div className="flex-grow flex flex-col space-y-4 p-4 h-full">
              <div className="flex flex-col space-y-2">
                <Label className="text-lg font-medium">Data</Label>
                <Formatter
                  className="max-h-[400px]"
                  value={JSON.stringify(datapoint.data, null, 2)}
                  defaultMode="json"
                  editable
                  onChange={s => {
                    try {
                      const isDataValid = isJsonStringAValidObject(s);
                      if (isDataValid) {
                        setNewData(JSON.parse(s));
                        setIsValidJsonData(true);
                      } else {
                        setIsValidJsonData(false);
                      }
                    } catch (e) {
                      setIsValidJsonData(false);
                    }
                  }} />
                {!isValidJsonData && (
                  <p className="text-sm text-red-500">Invalid JSON object</p>
                )}
              </div>
              <div className="flex flex-col space-y-2">
                <Label className="text-lg font-medium">Target</Label>
                <Formatter
                  className="max-h-[400px]"
                  value={JSON.stringify(datapoint.target, null, 2)}
                  defaultMode="json"
                  editable
                  onChange={s => {
                    try {
                      const isTargetValid = isJsonStringAValidObject(s);
                      if (isTargetValid) {
                        setNewTarget(JSON.parse(s));
                        setIsValidJsonTarget(true);
                      } else {
                        setIsValidJsonTarget(false);
                      }
                    } catch (e) {
                      setIsValidJsonTarget(false);
                    }
                  }} />
                  {!isValidJsonTarget && (
                    <p className="text-sm text-red-500">Invalid JSON object</p>
                  )}
              </div>
              <div className="flex flex-col space-y-2">
                <Label className="text-lg font-medium">Metadata</Label>
                <Formatter
                  className="max-h-[400px]"
                  value={JSON.stringify(datapoint.metadata, null, 2)}
                  defaultMode="json"
                  editable
                  onChange={s => {
                    if (s === '') {
                      setNewMetadata(null);
                      setIsValidJsonMetadata(true);
                      return;
                    }
                    try {
                      const isMetadataValid = isJsonStringAValidObject(s);
                      if (isMetadataValid) {
                        setNewMetadata(JSON.parse(s));
                        setIsValidJsonMetadata(true);
                      } else {
                        setIsValidJsonMetadata(false);
                      }
                    } catch (e) {
                      setIsValidJsonMetadata(false);
                    }
                  }} />
                  {!isValidJsonMetadata && (
                    <p className="text-sm text-red-500">Invalid JSON object</p>
                  )}
              </div>
            </div>
          </div>
        </ScrollArea>
      }

      {
        !datapoint && (
          <div className="flex-grow w-full p-4 space-y-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        )
      }
    </div>
  )
}
