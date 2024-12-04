import { ChevronsRight, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useProjectContext } from '@/contexts/project-context';
import { Datapoint } from '@/lib/dataset/types';
import { useToast } from '@/lib/hooks/use-toast';

import { Button } from '../ui/button';
import Formatter from '../ui/formatter';
import { Label } from '../ui/label';
import MonoWithCopy from '../ui/mono-with-copy';
import { ScrollArea } from '../ui/scroll-area';
import { Skeleton } from '../ui/skeleton';

interface DatasetPanelProps {
  datasetId: string;
  indexedOn: string | null;
  datapoint: Datapoint;
  onClose: () => void;
}

const AUTO_SAVE_TIMEOUT_MS = 750;

export default function DatasetPanel({
  datasetId,
  indexedOn,
  datapoint,
  onClose,
}: DatasetPanelProps) {
  const { projectId } = useProjectContext();
  // datapoint is DatasetDatapoint, i.e. result of one execution on a data point
  const [newData, setNewData] = useState<Record<string, any> | null>(datapoint.data);
  const [newTarget, setNewTarget] = useState<Record<string, any> | null>(
    datapoint.target
  );
  const [newMetadata, setNewMetadata] = useState<Record<string, any> | null>(
    datapoint.metadata
  );
  const [isValidJsonData, setIsValidJsonData] = useState(true);
  const [isValidJsonTarget, setIsValidJsonTarget] = useState(true);
  const [isValidJsonMetadata, setIsValidJsonMetadata] = useState(true);
  const { toast } = useToast();
  const autoSaveFuncTimeoutId = useRef<NodeJS.Timeout | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [isFirstRender, setIsFirstRender] = useState<boolean>(true);

  const saveChanges = async () => {

    // don't do anything if no changes or invalid jsons
    if (!isValidJsonData || !isValidJsonTarget || !isValidJsonMetadata) {
      return;
    }
    setSaving(true);
    const res = await fetch(
      `/api/projects/${projectId}/datasets/${datasetId}/datapoints/${datapoint.id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: newData,
          target: newTarget,
          metadata: newMetadata,
          indexedOn
        })
      }
    );
    setSaving(false);
    if (!res.ok) {
      toast({
        title: 'Failed to save changes',
        variant: 'destructive'
      });
      return;
    }
  };

  useEffect(() => {
    if (isFirstRender) {
      setIsFirstRender(false);
      return;
    }
    if (autoSaveFuncTimeoutId.current) {
      clearTimeout(autoSaveFuncTimeoutId.current);
    }

    autoSaveFuncTimeoutId.current = setTimeout(
      async () => await saveChanges(),
      AUTO_SAVE_TIMEOUT_MS
    );
  }, [newData, newTarget, newMetadata]);

  useEffect(() => {
    setNewData(datapoint.data);
    setNewTarget(datapoint.target);
    setNewMetadata(datapoint.metadata);
  }, [datapoint]);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="h-12 flex flex-none space-x-2 px-3 items-center border-b">
        <Button
          variant={'ghost'}
          className="px-1"
          onClick={async () => {
            await saveChanges();
            onClose();
          }}
        >
          <ChevronsRight />
        </Button>
        <div>Row</div>
        <MonoWithCopy className="text-secondary-foreground mt-0.5">{datapoint.id}</MonoWithCopy>
        {saving && <div className='flex text-secondary-foreground text-sm'>
          <Loader2 className="animate-spin h-4 w-4 mr-2 mt-0.5" />
          Saving
        </div>}
      </div>
      {datapoint && (
        <ScrollArea className="flex-grow flex overflow-auto">
          <div className="flex max-h-0">
            <div className="flex-grow flex flex-col space-y-4 p-4 h-full">
              <div className="flex flex-col space-y-2">
                <Label className="text-lg font-medium">Data</Label>
                <Formatter
                  className="max-h-[400px]"
                  value={JSON.stringify(newData, null, 2)}
                  defaultMode="json"
                  editable
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
                    {newData === null
                      ? 'Data cannot be null'
                      : 'Invalid JSON format'}
                  </p>
                )}
              </div>
              <div className="flex flex-col space-y-2">
                <Label className="text-lg font-medium">Target</Label>
                <Formatter
                  className="max-h-[400px]"
                  value={JSON.stringify(newTarget, null, 2)}
                  defaultMode="json"
                  editable
                  onChange={(s) => {
                    try {
                      setNewTarget(JSON.parse(s));
                      setIsValidJsonTarget(true);
                    } catch (e) {
                      setIsValidJsonTarget(false);
                    }
                  }}
                />
                {!isValidJsonTarget && (
                  <p className="text-sm text-red-500">Invalid JSON object</p>
                )}
              </div>
              <div className="flex flex-col space-y-2">
                <Label className="text-lg font-medium">Metadata</Label>
                <Formatter
                  className="max-h-[400px]"
                  value={JSON.stringify(newMetadata, null, 2)}
                  defaultMode="json"
                  editable
                  onChange={(s) => {
                    try {
                      setNewMetadata(JSON.parse(s));
                      setIsValidJsonMetadata(true);
                    } catch (e) {
                      setIsValidJsonMetadata(false);
                    }
                  }}
                />
                {!isValidJsonMetadata && (
                  <p className="text-sm text-red-500">Invalid JSON object</p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      )}

      {!datapoint && (
        <div className="flex-grow w-full p-4 space-y-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      )}
    </div>
  );
}
