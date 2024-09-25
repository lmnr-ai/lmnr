import { useProjectContext } from "@/contexts/project-context";
import { ChevronsRight } from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import Ide from "../ui/ide";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";
import Mono from "../ui/mono";
import { Datapoint } from "@/lib/dataset/types";
import Formatter from "../ui/formatter";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface DatasetPanelProps {
  datasetId: string;
  datapoint: Datapoint
  onClose: () => void;
}

const deepEqual = (x: Object, y: Object): boolean => {
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
  const [isValidJsonData, setIsValidJsonData] = useState(true);
  const [isValidJsonTarget, setIsValidJsonTarget] = useState(true);
  const router = useRouter();

  useEffect(() => {
    setNewData(datapoint.data);
    setNewTarget(datapoint.target);
  }, [datapoint])

  return (
    <div className='flex flex-col h-full w-full'>
      <div className='h-[49px] flex flex-none space-x-2 px-3 items-center border-b'>
        <div className="flex flex-row flex-grow space-x-2 h-full items-center">
          <Button
            variant={'ghost'}
            className='px-1'
            onClick={() => {
              setNewData(datapoint.data)
              setNewTarget(datapoint.target)
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
          disabled={!isValidJsonData || !isValidJsonTarget ||
            (deepEqual(datapoint.data, newData) && deepEqual(datapoint.target, newTarget))} // disable if no changes or invalid json
          onClick={() => {
            fetch(`/api/projects/${projectId}/datasets/${datasetId}/datapoints/${datapoint.id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                data: newData,
                target: newTarget
              })
            })
            router.refresh()
          }}
        > Save changes
        </Button>
      </div>
      {datapoint &&
        <ScrollArea className="flex-grow flex overflow-auto">
          <div className="flex max-h-0">
            <div className="flex-grow flex flex-col space-y-2 p-4 h-full">
              <Label className="">Data</Label>
              <div className="rounded border" key={datapoint.id}>
                <Formatter value={JSON.stringify(datapoint.data, null, 2)} defaultMode="json" editable
                  onChange={s => {
                    try {
                      const data = JSON.parse(s);
                      const isDataValid = typeof data === 'object' && !Array.isArray(data);
                      if (isDataValid) {
                        setNewData(data);
                        setIsValidJsonData(true);
                      } else {
                        setIsValidJsonData(false);
                      }
                    } catch (e) {
                      setIsValidJsonData(false);
                    }
                  }} />
              </div>
              <Label className="">Target</Label>
              <div className="rounded border">
                <Formatter value={JSON.stringify(datapoint.target, null, 2)} defaultMode="json" editable
                  onChange={s => {
                    try {
                      const target = JSON.parse(s);
                      const isTargetValid = typeof target === 'object' && !Array.isArray(target);
                      if (isTargetValid) {
                        setNewTarget(target);
                        setIsValidJsonTarget(true);
                      } else {
                        setIsValidJsonTarget(false);
                      }
                    } catch (e) {
                      setIsValidJsonTarget(false);
                    }
                  }} />
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
