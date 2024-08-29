
import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Button } from '../ui/button';
import { useProjectContext } from '@/contexts/project-context';
import { Label } from '../ui/label';
import DatasetSelect from '../ui/dataset-select';
import { cn, getFilterFromUrlParams } from '@/lib/utils';
import { useSearchParams } from 'next/navigation';
import { Loader } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { DatatableFilter } from '@/lib/types';
import { useToast } from '@/lib/hooks/use-toast';

interface LogExportDialogProps {
  endpointId: string
  totalNumberOfTraces: number // matching by filter
  runIds: string[]
  useAll: boolean
}

const sendExportRequest = async (
  projectId: string,
  endpointId: string,
  datasetId: string,
  runIds: string[] | undefined,
  filters: DatatableFilter[] | undefined
) => {
  const body = JSON.stringify({
    datasetId,
    runIds,
    filters
  })
  await fetch(`/api/projects/${projectId}/traces/endpoint/${endpointId}/export`, {
    method: 'POST',
    body: body
  });
}

export default function LogExportDialog({ endpointId, runIds, totalNumberOfTraces, useAll }: LogExportDialogProps) {
  const { projectId } = useProjectContext();
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const queryParamFilters = searchParams.get('filter');
  const { toast } = useToast();

  return (useAll || runIds.length > 0) ? (
    <Dialog open={isDialogOpen} onOpenChange={open => {
      setIsDialogOpen(open)
      if (!open) {
        setSelectedDatasetId(null)
        setIsLoading(false)
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline">Export to dataset</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export logs to dataset</DialogTitle>
        </DialogHeader>
        <div className='text-secondary-foreground flex flex-col space-y-2'>
          <Label> Exporting {useAll ? totalNumberOfTraces : runIds.length} selected traces.</Label>
        </div>
        <DatasetSelect onDatasetChange={(dataset) => setSelectedDatasetId(dataset.id)} />
        <DialogFooter>
          <Button
            variant="default"
            disabled={!selectedDatasetId || isLoading}
            onClick={async () => {
              setIsLoading(true);
              const filters = useAll ? undefined : (queryParamFilters ? (getFilterFromUrlParams(queryParamFilters) ?? []) : []);
              try {
                await sendExportRequest(projectId, endpointId, selectedDatasetId!, useAll ? undefined : runIds, filters)
              } catch (e) {
                toast({
                  title: 'Error exporting traces'
                })
              }
              setIsLoading(false)
              setIsDialogOpen(false)
              setSelectedDatasetId(null)
            }}
            handleEnter
          >
            <Loader className={cn('mr-2 hidden', isLoading ? 'animate-spin block' : '')} size={16} />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog >
  ) : (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div tabIndex={0}>
            <Button variant="outline" disabled>Export to dataset</Button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Select traces to export
        </TooltipContent>
      </Tooltip>
    </TooltipProvider >
  )
}
