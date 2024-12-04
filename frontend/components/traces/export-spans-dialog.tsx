import { Database, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { useProjectContext } from '@/contexts/project-context';
import { Dataset } from '@/lib/dataset/types';
import { eventEmitter } from '@/lib/event-emitter';
import { useToast } from '@/lib/hooks/use-toast';
import { Span } from '@/lib/traces/types';
import { cn } from '@/lib/utils';

import { Button } from '../ui/button';
import DatasetSelect from '../ui/dataset-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../ui/dialog';
import Formatter from '../ui/formatter';
import { Label } from '../ui/label';

interface ExportSpansDialogProps {
  span: Span;
}

export default function ExportSpansDialog({ span }: ExportSpansDialogProps) {
  const { projectId } = useProjectContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);

  const { toast } = useToast();

  const [data, setData] = useState(span.input);
  const [target, setTarget] = useState(span.output);
  const [isDataValid, setIsDataValid] = useState(true);
  const [isTargetValid, setIsTargetValid] = useState(true);

  const [metadata, setMetadata] = useState({ spanId: span.spanId });
  const [isMetadataValid, setIsMetadataValid] = useState(true);

  const handleDataChange = (value: string) => {
    try {
      const parsed = JSON.parse(value);
      if (parsed === null) {
        setIsDataValid(false);
        // we still set it to null to format the error,
        // button is blocked by isDataValid check
        setData(parsed);
        return;
      }
      setData(parsed);
      setIsDataValid(true);
    } catch (e) {
      setIsDataValid(false);
    }
  };

  const handleTargetChange = (value: string) => {
    try {
      setTarget(JSON.parse(value));
      setIsTargetValid(true);
    } catch (e) {
      setIsTargetValid(false);
    }
  };

  const handleMetadataChange = (value: string) => {
    try {
      setMetadata(JSON.parse(value));
      setIsMetadataValid(true);
    } catch (e) {
      setIsMetadataValid(false);
    }
  };

  const exportSpan = async () => {
    if (!selectedDataset) {
      return;
    }
    setIsLoading(true);
    const res = await fetch(
      `/api/projects/${projectId}/datasets/${selectedDataset.id}/datapoints`,
      {
        method: 'POST',
        body: JSON.stringify({
          datapoints: [
            {
              data: data,
              target: target,
              metadata: metadata
            }
          ],
          sourceSpanId: span.spanId
        })
      }
    );
    setIsLoading(false);
    setIsDialogOpen(false);
    if (!res.ok) {
      toast({
        title: 'Failed to export span',
        variant: 'destructive'
      });
    } else {
      eventEmitter.emit('mutateSpanDatapoints');
      toast({
        title: `Successfully exported span to dataset ${selectedDataset?.name}`
      });
    }
  };

  return (
    <>
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setSelectedDataset(null);
            setIsLoading(false);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant={'outline'}>
            <Database size={16} className="mr-2" />
            Add to dataset
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-6xl bg-background max-h-[90vh] p-0 m-0 gap-0">
          <DialogHeader className="p-4 border-b m-0">
            <div className="flex flex-row justify-between items-center">
              <DialogTitle>Export span to dataset</DialogTitle>
              <Button
                onClick={async () => await exportSpan()}
                disabled={
                  isLoading ||
                  !selectedDataset ||
                  !isDataValid ||
                  !isTargetValid ||
                  !isMetadataValid
                }
              >
                <Loader2
                  className={cn(
                    'mr-2 hidden',
                    isLoading ? 'animate-spin block' : ''
                  )}
                  size={16}
                />
                Add to dataset
              </Button>
            </div>
          </DialogHeader>
          <div className="flex flex-col space-y-8 overflow-auto flex-grow h-[70vh] m-0">
            <div className="flex flex-col space-y-4 p-4 pb-8">
              <div className="flex flex-none flex-col space-y-2">
                <Label className="text-lg font-medium">Dataset</Label>
                <DatasetSelect
                  onDatasetChange={(dataset) => setSelectedDataset(dataset)}
                />
              </div>
              <div className="flex flex-col space-y-2">
                <Label className="text-lg font-medium">Data</Label>
                <Formatter
                  className="max-h-[500px]"
                  editable
                  defaultMode={'json'}
                  value={JSON.stringify(data, null, 2)}
                  onChange={handleDataChange}
                />
                {!isDataValid && (
                  <p className="text-sm text-red-500">
                    {data === null
                      ? 'Data cannot be null'
                      : 'Invalid JSON format'}
                  </p>
                )}
              </div>
              <div className="flex flex-col space-y-2">
                <Label className="text-lg font-medium">Target</Label>
                <Formatter
                  className="max-h-[500px]"
                  editable
                  defaultMode={'json'}
                  value={JSON.stringify(target, null, 2)}
                  onChange={handleTargetChange}
                />
                {!isTargetValid && (
                  <p className="text-sm text-red-500">Invalid JSON format</p>
                )}
              </div>
              <div className="flex flex-col space-y-2">
                <Label className="text-lg font-medium">Metadata</Label>
                <Formatter
                  className="max-h-[500px]"
                  editable
                  defaultMode={'json'}
                  value={JSON.stringify(metadata, null, 2)}
                  onChange={handleMetadataChange}
                />
                {!isMetadataValid && (
                  <p className="text-sm text-red-500">Invalid JSON format</p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
