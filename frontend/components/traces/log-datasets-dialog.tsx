
import { Dataset } from '@/lib/dataset/types';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { useProjectContext } from '@/contexts/project-context';
import { Label } from '../ui/label';
import { ArrowUpRight, Loader } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface LogDatasetsDialogProps {
  endpointId: string
  onUpdate?: () => void
}

export default function LogDatasetsDialog({ endpointId, onUpdate }: LogDatasetsDialogProps) {
  const { projectId } = useProjectContext();
  const [datasetIds, setDatasetIds] = useState<Set<string>>(new Set());
  const [allDatasets, setAllDatasets] = useState<Dataset[]>([]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchDatasets = async () => {
      const res = await fetch(`/api/projects/${projectId}/datasets`);
      if (res.ok) {
        const allProjectDatasets = await res.json();
        setAllDatasets(allProjectDatasets as Dataset[]);
      }

      const response = await fetch(`/api/projects/${projectId}/endpoints/${endpointId}/log-datasets`);
      if (res.ok) {
        const logDatasets = await response.json();
        setDatasetIds(new Set((logDatasets as Dataset[]).map(dataset => dataset.id)));
      }
    }
    fetchDatasets();
  }, []);

  const toggleSelectedDataset = (datasetId: string) => {
    const newDatasetIds = new Set(datasetIds);
    if (newDatasetIds.has(datasetId)) {
      newDatasetIds.delete(datasetId);
    } else {
      newDatasetIds.add(datasetId);
    }
    setDatasetIds(newDatasetIds);
  }

  const saveDatasets = async () => {
    setIsLoading(true);
    const res = await fetch(`/api/projects/${projectId}/endpoints/${endpointId}/log-datasets`, {
      method: 'PUT',
      body: JSON.stringify({
        datasetIds: Array.from(datasetIds),
      }),
    });
    const json = await res.json();
    setIsLoading(false);
    onUpdate?.();
    setIsDialogOpen(false);
  }

  return (
    <>
      <Dialog open={isDialogOpen} onOpenChange={() => { setIsDialogOpen(!isDialogOpen) }}>
        <DialogTrigger asChild>
          <Button variant={'secondary'}>Write to dataset</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select datasets</DialogTitle>
          </DialogHeader>
          <h3> Whenever any new log entry is written, all data will be automatically saved to the selected datasets. </h3>
          <div className='flex-col'>
            {(allDatasets ?? []).map((dataset) => (
              <div key={dataset.id} className='flex items-center p-1'>
                <Checkbox
                  className='cursor-pointer'
                  id={dataset.id}
                  checked={datasetIds.has(dataset.id)}
                  onClick={() => toggleSelectedDataset(dataset.id)}
                />
                <Label htmlFor={dataset.id} className='cursor-pointer pl-2'>{dataset.name}</Label>
                <Link className="ml-2" href={`/project/${projectId}/datasets/${dataset.id}`}><ArrowUpRight size={16} /></Link>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={async () => await saveDatasets()}
              disabled={isLoading}
            >
              <Loader className={cn('mr-2 hidden', isLoading ? 'animate-spin block' : '')} size={16} />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}