import React, { useState } from 'react';

import { Button } from '@/components/ui/button'
import { useToast } from '../../lib/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Loader, NotepadText } from 'lucide-react';
import { useProjectContext } from '@/contexts/project-context';
import { Label } from '@/components/ui/label';
import { Input } from '../ui/input';
import { Dataset } from '@/lib/dataset/types';

interface IndexDatasetDialogProps {
  datasetId: string;
  defaultDataset: Dataset;
  onUpdate?: () => void;
}

export default function IndexDatasetDialog({ datasetId, defaultDataset, onUpdate }: IndexDatasetDialogProps) {
  const { projectId } = useProjectContext()
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [selectedIndexKey, setSelectedIndexKey] = useState<string>(defaultDataset.indexedOn ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const indexDataset = async () => {
    setIsLoading(true);

    let res = await fetch(
      `/api/projects/${projectId}/datasets/${datasetId}/index`,
      {
        method: 'POST',
        body: JSON.stringify({ indexColumn: selectedIndexKey }),
        cache: 'no-cache',
      })

    if (res.status != 200) {
      setIsLoading(false);
      toast({
        title: 'Error indexing dataset',
      })
      return
    }

    toast({
      title: 'Successfully indexed dataset',
    })

    const newDataset = await res.json();
    setSelectedIndexKey(newDataset.indexedOn);
    onUpdate?.();

    setIsLoading(false);
    setIsDialogOpen(false);
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-7 ml-4"
        >
          <NotepadText className='w-4 mr-1 text-gray-500' />
          Index
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Index dataset</DialogTitle>
        </DialogHeader>
        <Label>Type the key to index this dataset on for semantic search.</Label>
        <Label className='text-sm text-slate-400'>{"New datapoints are indexed automatically. " +
          'Only datapoints with this key in data" will be indexed.'}</Label>
        <Input defaultValue={defaultDataset?.indexedOn ?? ""} onChange={(e) => setSelectedIndexKey(e.target.value)} />
        <DialogFooter>
          <Button
            className='my-4'
            disabled={isLoading || !selectedIndexKey || selectedIndexKey === defaultDataset.indexedOn}
            onClick={async () => await indexDataset()}
            handleEnter>
            {isLoading && <Loader className='animate-spin h-4 w-4 mr-2' />}
            Index
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}